import json

import pytest
from fastapi.testclient import TestClient

from utrequests import vision
from utrequests.api import app

from .conftest import WHITEBOARDS, load_fixture
from .test_vision import FakeClient


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def fake_vision(monkeypatch):
    fake = FakeClient(json.dumps(load_fixture("vision_sample.json")))
    monkeypatch.setattr(vision, "get_client", lambda: fake)
    return fake


def test_healthz(client):
    assert client.get("/healthz").json() == {"ok": True}


def test_editions_endpoint(client, monkeypatch):
    import httpx

    from utrequests import catalogue

    def offline(*a, **k):
        raise httpx.ConnectError("offline")

    monkeypatch.setattr(catalogue.httpx, "get", offline)
    response = client.get("/api/editions")
    assert response.status_code == 200
    assert any(e["id"] == "current" for e in response.json()["editions"])


def test_parse_happy_path(client, mock_bucket, fake_vision):
    photo = (WHITEBOARDS / "whiteboard_sample.jpg").read_bytes()
    response = client.post(
        "/api/parse",
        files={"image": ("board.jpg", photo, "image/jpeg")},
        data={"edition": "current"},
    )
    assert response.status_code == 200, response.text
    payload = response.json()
    assert len(payload["rows"]) == 7
    assert payload["edition"]["id"] == "current"
    assert len(payload["catalogue"]) == 123
    statuses = {r["status"] for r in payload["rows"]}
    assert "confirmed" in statuses


def test_parse_empty_upload_400(client):
    response = client.post("/api/parse", files={"image": ("x.jpg", b"", "image/jpeg")})
    assert response.status_code == 400


def test_parse_garbage_image_400(client, mock_bucket, fake_vision):
    response = client.post(
        "/api/parse", files={"image": ("x.jpg", b"not an image", "image/jpeg")}
    )
    assert response.status_code == 400


def test_parse_without_credentials_503(client, mock_bucket, monkeypatch):
    import google.auth.exceptions

    def boom(*a, **k):
        raise google.auth.exceptions.DefaultCredentialsError("no ADC")

    monkeypatch.setattr(vision.genai, "Client", boom)
    photo = (WHITEBOARDS / "whiteboard_sample.jpg").read_bytes()
    response = client.post(
        "/api/parse", files={"image": ("board.jpg", photo, "image/jpeg")}
    )
    assert response.status_code == 503
    assert "application-default" in response.json()["detail"]


def test_static_index_served(client):
    response = client.get("/")
    assert response.status_code == 200
    assert "Whiteboard" in response.text
