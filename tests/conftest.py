import json
from pathlib import Path

import httpx
import pytest

from utrequests import catalogue
from utrequests.models import Catalogue

FIXTURES = Path(__file__).parent / "fixtures"


@pytest.fixture(autouse=True)
def _clear_catalogue_cache():
    catalogue.clear_cache()
    yield
    catalogue.clear_cache()


def load_fixture(name: str) -> dict:
    return json.loads((FIXTURES / name).read_text())


@pytest.fixture
def mock_bucket(monkeypatch):
    """Serve the recorded latest.json/manifest fixtures for any edition."""
    latest = load_fixture("latest_current.json")
    manifest = load_fixture("manifest_current.json")

    def fake_get(url, **kwargs):
        request = httpx.Request("GET", url)
        if url.endswith("/latest.json"):
            return httpx.Response(200, json=latest, request=request)
        if url.endswith(".manifest.json"):
            return httpx.Response(200, json=manifest, request=request)
        return httpx.Response(404, request=request)

    monkeypatch.setattr(catalogue.httpx, "get", fake_get)
    return manifest


@pytest.fixture
def sample_catalogue(mock_bucket) -> Catalogue:
    return catalogue.fetch_catalogue("current")
