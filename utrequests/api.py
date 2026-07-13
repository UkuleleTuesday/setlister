"""HTTP request handling for the Cloud Function.

``handle_request`` is framework-light: it takes a Flask request (what
functions-framework hands us) and returns Flask-style ``(body, status,
headers)`` tuples, so tests can drive it through a plain Flask app without
booting functions-framework itself. Error bodies keep the ``{"detail": ...}``
shape the UI expects.
"""

import json

from . import ratelimit
from .catalogue import CatalogueError, list_editions
from .config import get_settings
from .pipeline import parse_photo
from .preprocess import ImageError
from .vision import VisionConfigError, VisionError

_ALLOWED_METHODS = "GET, POST, OPTIONS"


def _cors_headers(request) -> dict[str, str]:
    """CORS headers for this request; empty allow-origin when not allowed.

    The origin is echoed back (never ``*``) and only when it is in the
    configured allowlist. ``Vary: Origin`` keeps caches from serving one
    origin's response to another.
    """
    headers = {"Vary": "Origin"}
    origin = request.headers.get("Origin")
    if origin and origin in get_settings().cors_allowed_origins:
        headers["Access-Control-Allow-Origin"] = origin
        headers["Access-Control-Allow-Methods"] = _ALLOWED_METHODS
        headers["Access-Control-Allow-Headers"] = "Content-Type"
        headers["Access-Control-Max-Age"] = "3600"
    return headers


def _json(request, payload_json: str, status: int = 200, extra: dict | None = None):
    headers = _cors_headers(request) | {"Content-Type": "application/json"}
    if extra:
        headers |= extra
    return payload_json, status, headers


def _error(request, status: int, detail: str, extra: dict | None = None):
    return _json(request, json.dumps({"detail": detail}), status, extra)


def _parse(request):
    settings = get_settings()

    if (
        request.content_length is not None
        and request.content_length > settings.max_upload_bytes
    ):
        return _error(request, 413, "Upload too large")

    client_ip = ratelimit.parse_client_ip(
        request.headers.get("X-Forwarded-For"), request.remote_addr
    )
    decision = ratelimit.check(
        f"parse:{client_ip}",
        settings.parse_rate_limit,
        settings.parse_rate_window_seconds,
    )
    if not decision.allowed:
        return _error(
            request,
            429,
            "Too many requests — try again shortly",
            {"Retry-After": str(decision.retry_after)},
        )

    image = request.files.get("image")
    data = image.read() if image else b""
    if not data:
        return _error(request, 400, "Empty upload")
    if len(data) > settings.max_upload_bytes:
        return _error(request, 413, "Upload too large")
    edition = request.form.get("edition") or "current"

    try:
        response = parse_photo(data, edition)
    except ImageError as e:
        return _error(request, 400, str(e))
    except CatalogueError as e:
        return _error(request, 502, str(e))
    except VisionConfigError as e:
        return _error(request, 503, str(e))
    except VisionError as e:
        return _error(request, 502, str(e))
    return _json(request, response.model_dump_json())


def handle_request(request):
    """Dispatch a request to the matching route."""
    path = request.path.rstrip("/") or "/"

    if request.method == "OPTIONS":
        return "", 204, _cors_headers(request)

    if request.method == "GET" and path in ("/", "/healthz"):
        return _json(request, json.dumps({"ok": True}))

    if request.method == "GET" and path == "/api/editions":
        editions = [e.model_dump(mode="json") for e in list_editions()]
        return _json(request, json.dumps({"editions": editions}))

    if request.method == "POST" and path == "/api/parse":
        return _parse(request)

    return _error(request, 404, "Not found")
