import io
import json

import flask
import httpx
import pytest

from utrequests import ratelimit, vision
from utrequests.api import handle_request
from utrequests.config import get_settings

from .conftest import WHITEBOARDS, load_fixture
from .test_vision import FakeClient

PAGES_ORIGIN = "https://ukuleletuesday.github.io"


@pytest.fixture
def client():
    """Drive handle_request through a plain Flask app (no functions-framework:
    create_app re-imports the source under a different module name, which would
    break monkeypatching of the already-imported modules)."""
    app = flask.Flask(__name__)
    methods = ["GET", "POST", "OPTIONS"]

    def dispatch(path=""):
        return handle_request(flask.request)

    app.add_url_rule("/", "root", dispatch, methods=methods)
    app.add_url_rule("/<path:path>", "any", dispatch, methods=methods)
    return app.test_client()


@pytest.fixture
def fake_vision(monkeypatch):
    fake = FakeClient(json.dumps(load_fixture("vision_sample.json")))
    monkeypatch.setattr(vision, "get_client", lambda: fake)
    return fake


def _image_form(photo: bytes, edition: str | None = None) -> dict:
    form = {"image": (io.BytesIO(photo), "board.jpg", "image/jpeg")}
    if edition is not None:
        form["edition"] = edition
    return form


def test_healthz(client):
    assert client.get("/healthz").get_json() == {"ok": True}


def test_editions_endpoint(client, monkeypatch):
    import httpx

    from utrequests import catalogue

    def offline(*a, **k):
        raise httpx.ConnectError("offline")

    monkeypatch.setattr(catalogue.httpx, "get", offline)
    response = client.get("/api/editions")
    assert response.status_code == 200
    assert any(e["id"] == "current" for e in response.get_json()["editions"])


def test_catalogue_endpoint_returns_entries(client, mock_bucket):
    response = client.get("/api/catalogue?edition=current")
    assert response.status_code == 200, response.text
    payload = response.get_json()
    assert payload["edition"]["id"] == "current"
    assert len(payload["catalogue"]) == 123
    assert payload["catalogue_generated_at"]


def test_catalogue_endpoint_defaults_edition(client, mock_bucket):
    response = client.get("/api/catalogue")
    assert response.status_code == 200
    assert response.get_json()["edition"]["id"] == "current"


def test_catalogue_endpoint_missing_edition_502(client, monkeypatch):
    from utrequests import catalogue

    def not_found(url, **kwargs):
        return httpx.Response(404, request=httpx.Request("GET", url))

    monkeypatch.setattr(catalogue.httpx, "get", not_found)
    response = client.get("/api/catalogue?edition=nope")
    assert response.status_code == 502
    assert "detail" in response.get_json()


def test_parse_happy_path(client, mock_bucket, fake_vision):
    photo = (WHITEBOARDS / "whiteboard_sample.jpg").read_bytes()
    response = client.post("/api/parse", data=_image_form(photo, "current"))
    assert response.status_code == 200, response.text
    payload = response.get_json()
    assert len(payload["rows"]) == 7
    assert payload["edition"]["id"] == "current"
    assert len(payload["catalogue"]) == 123
    statuses = {r["status"] for r in payload["rows"]}
    assert "confirmed" in statuses


def test_parse_forwards_knobs_to_model(client, mock_bucket, fake_vision):
    photo = (WHITEBOARDS / "whiteboard_sample.jpg").read_bytes()
    form = _image_form(photo, "current")
    form["model"] = "gemini-2.5-flash-lite"
    form["thinking_budget"] = "512"
    form["catalogue_in_prompt"] = "false"
    response = client.post("/api/parse", data=form)
    assert response.status_code == 200, response.text
    call = fake_vision.calls[0]
    assert call["model"] == "gemini-2.5-flash-lite"
    assert call["config"].thinking_config.thinking_budget == 512
    assert "SONGBOOK" not in call["contents"][1]


def test_parse_clamps_thinking_budget(client, mock_bucket, fake_vision):
    photo = (WHITEBOARDS / "whiteboard_sample.jpg").read_bytes()
    form = _image_form(photo, "current")
    form["thinking_budget"] = "999999"
    response = client.post("/api/parse", data=form)
    assert response.status_code == 200
    assert fake_vision.calls[0]["config"].thinking_config.thinking_budget == 24576


def test_parse_ignores_disallowed_model(client, mock_bucket, fake_vision):
    photo = (WHITEBOARDS / "whiteboard_sample.jpg").read_bytes()
    form = _image_form(photo, "current")
    form["model"] = "gemini-2.5-pro"  # not flash-tier — dropped, default used
    response = client.post("/api/parse", data=form)
    assert response.status_code == 200
    assert fake_vision.calls[0]["model"] == get_settings().gemini_model


def test_parse_ignores_junk_image_edge(client, mock_bucket, fake_vision):
    photo = (WHITEBOARDS / "whiteboard_sample.jpg").read_bytes()
    form = _image_form(photo, "current")
    form["max_image_edge"] = "not-a-number"
    response = client.post("/api/parse", data=form)
    assert response.status_code == 200


def test_parse_empty_upload_400(client):
    response = client.post("/api/parse", data=_image_form(b""))
    assert response.status_code == 400


def test_parse_garbage_image_400(client, mock_bucket, fake_vision):
    response = client.post("/api/parse", data=_image_form(b"not an image"))
    assert response.status_code == 400


def test_parse_without_credentials_503(client, mock_bucket, monkeypatch):
    import google.auth.exceptions

    def boom(*a, **k):
        raise google.auth.exceptions.DefaultCredentialsError("no ADC")

    monkeypatch.setattr(vision.genai, "Client", boom)
    photo = (WHITEBOARDS / "whiteboard_sample.jpg").read_bytes()
    response = client.post("/api/parse", data=_image_form(photo))
    assert response.status_code == 503
    assert "application-default" in response.get_json()["detail"]


def test_unknown_path_404(client):
    response = client.get("/nope")
    assert response.status_code == 404
    assert response.get_json() == {"detail": "Not found"}


def test_cors_allowed_origin_echoed(client):
    response = client.get("/healthz", headers={"Origin": PAGES_ORIGIN})
    assert response.headers["Access-Control-Allow-Origin"] == PAGES_ORIGIN
    assert "Origin" in response.headers["Vary"]


def test_cors_disallowed_origin_gets_no_allow_header(client):
    response = client.get("/healthz", headers={"Origin": "https://evil.example"})
    assert "Access-Control-Allow-Origin" not in response.headers


def test_options_preflight_204(client):
    response = client.open(
        "/api/parse", method="OPTIONS", headers={"Origin": PAGES_ORIGIN}
    )
    assert response.status_code == 204
    assert response.headers["Access-Control-Allow-Origin"] == PAGES_ORIGIN


def test_parse_oversized_content_length_413(client):
    too_big = get_settings().max_upload_bytes + 1
    response = client.post(
        "/api/parse",
        data=b"x",
        content_type="multipart/form-data",
        environ_overrides={"CONTENT_LENGTH": str(too_big)},
    )
    assert response.status_code == 413


def test_parse_rate_limited_429(client, mock_bucket, fake_vision, monkeypatch):
    # Pin time so every request lands in the same fixed-window bucket.
    # Without this, a real-clock boundary crossing mid-loop would reset the
    # counter and let the 9th request through, making the test flaky.
    monkeypatch.setattr(ratelimit.time, "time", lambda: 12345.0)
    photo = (WHITEBOARDS / "whiteboard_sample.jpg").read_bytes()
    limit = get_settings().parse_rate_limit
    for _ in range(limit):
        response = client.post("/api/parse", data=_image_form(photo))
        assert response.status_code == 200
    response = client.post("/api/parse", data=_image_form(photo))
    assert response.status_code == 429
    assert int(response.headers["Retry-After"]) >= 1
    assert "detail" in response.get_json()
