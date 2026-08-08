"""HTTP request handling for the Cloud Function.

``handle_request`` is framework-light: it takes a Flask request (what
functions-framework hands us) and returns Flask-style ``(body, status,
headers)`` tuples, so tests can drive it through a plain Flask app without
booting functions-framework itself. Error bodies keep the ``{"detail": ...}``
shape the UI expects.
"""

import json

from . import ratelimit, tracing
from .catalogue import CatalogueError, fetch_catalogue, list_editions
from .config import get_settings
from .pipeline import parse_photo
from .preprocess import ImageError
from .vision import VisionConfigError, VisionError

_ALLOWED_METHODS = "GET, POST, OPTIONS"

# The endpoint is public, so the tuning knobs are bounded before use. Models
# are limited to the flash tier to keep per-call cost predictable.
_ALLOWED_MODEL_PREFIXES = ("gemini-2.5-flash",)
_THINKING_BUDGET_MAX = 24576
_IMAGE_EDGE_MIN, _IMAGE_EDGE_MAX = 256, 4096


def _clamp_int(raw: str | None, lo: int, hi: int) -> int | None:
    """Parse a form value to an int in [lo, hi]; None if absent/unparseable."""
    if raw is None or raw == "":
        return None
    try:
        return max(lo, min(hi, int(raw)))
    except ValueError:
        return None


def _parse_bool(raw: str | None) -> bool | None:
    if raw is None or raw == "":
        return None
    return raw.lower() in ("1", "true", "yes", "on")


def _parse_knobs(request) -> dict:
    """Read the optional tuning knobs from the request form, bounded and safe.

    Absent or invalid values are dropped so ``parse_photo`` falls back to the
    configured defaults.
    """
    knobs: dict = {}
    model = request.form.get("model") or ""
    if model.startswith(_ALLOWED_MODEL_PREFIXES):
        knobs["model"] = model
    budget = _clamp_int(request.form.get("thinking_budget"), 0, _THINKING_BUDGET_MAX)
    if budget is not None:
        knobs["thinking_budget"] = budget
    edge = _clamp_int(
        request.form.get("max_image_edge"), _IMAGE_EDGE_MIN, _IMAGE_EDGE_MAX
    )
    if edge is not None:
        knobs["max_image_edge"] = edge
    catalogue_in_prompt = _parse_bool(request.form.get("catalogue_in_prompt"))
    if catalogue_in_prompt is not None:
        knobs["catalogue_in_prompt"] = catalogue_in_prompt
    return knobs


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
            "Easy there, that's a lot of scanning. Try again shortly",
            {"Retry-After": str(decision.retry_after)},
        )

    image = request.files.get("image")
    data = image.read() if image else b""
    if not data:
        return _error(request, 400, "Empty upload")
    if len(data) > settings.max_upload_bytes:
        return _error(request, 413, "Upload too large")
    edition = request.form.get("edition") or "current"
    knobs = _parse_knobs(request)

    try:
        response = parse_photo(data, edition, **knobs)
    except ImageError as e:
        return _error(request, 400, str(e))
    except CatalogueError as e:
        return _error(request, 502, str(e))
    except VisionConfigError as e:
        return _error(request, 503, str(e))
    except VisionError as e:
        return _error(request, 502, str(e))
    return _json(request, response.model_dump_json())


def _catalogue(request):
    """Return the song catalogue for an edition, independent of any photo.

    Backs the UI's manual "add a song" search, which needs the catalogue before
    (or without) a scan. The payload mirrors the ``edition`` /
    ``catalogue_generated_at`` / ``catalogue`` subset of ``ParseResponse`` so the
    frontend populates its state the same way it does after a parse.
    """
    edition = request.args.get("edition") or "current"
    try:
        cat = fetch_catalogue(edition)
    except CatalogueError as e:
        return _error(request, 502, str(e))
    payload = {
        "edition": cat.edition.model_dump(mode="json"),
        "catalogue_generated_at": cat.generated_at,
        "catalogue": [entry.model_dump(mode="json") for entry in cat.entries],
    }
    return _json(request, json.dumps(payload))


def _route(request):
    path = request.path.rstrip("/") or "/"

    if request.method == "OPTIONS":
        return "", 204, _cors_headers(request)

    if request.method == "GET" and path in ("/", "/healthz"):
        return _json(request, json.dumps({"ok": True}))

    if request.method == "GET" and path == "/api/editions":
        editions = [e.model_dump(mode="json") for e in list_editions()]
        return _json(request, json.dumps({"editions": editions}))

    if request.method == "GET" and path == "/api/catalogue":
        return _catalogue(request)

    if request.method == "POST" and path == "/api/parse":
        return _parse(request)

    return _error(request, 404, "Not found")


def handle_request(request):
    """Dispatch a request to the matching route, flushing any traces after."""
    try:
        return _route(request)
    finally:
        # Instances can freeze between invocations; ship spans before that.
        tracing.flush()
