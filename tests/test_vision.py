import json
from types import SimpleNamespace

import pytest

from utrequests import vision
from utrequests.vision import VisionConfigError, VisionError, build_prompt, extract_rows

from .conftest import load_fixture


class FakeClient:
    """Mimics genai.Client for tests: returns a canned JSON response."""

    def __init__(self, text):
        self.calls = []
        outer = self

        class Models:
            def generate_content(self, **kwargs):
                outer.calls.append(kwargs)
                return SimpleNamespace(text=text)

        self.models = Models()


@pytest.fixture
def fake_client():
    return FakeClient(json.dumps(load_fixture("vision_sample.json")))


def test_build_prompt_contains_every_catalogue_line(sample_catalogue):
    prompt = build_prompt(sample_catalogue)
    for entry in sample_catalogue.entries:
        assert f"{entry.page} | {entry.display}" in prompt


def test_extract_rows_parses_structured_output(sample_catalogue, fake_client):
    extraction = extract_rows(b"img", "image/jpeg", sample_catalogue, client=fake_client)
    assert len(extraction.rows) == 7
    assert extraction.rows[0].raw_title == "Vampire"
    call = fake_client.calls[0]
    assert call["config"].response_mime_type == "application/json"
    assert call["config"].temperature == 0


def test_extract_rows_discards_non_verbatim_guesses(sample_catalogue):
    rows = {
        "rows": [
            {"raw_title": "Vampire", "raw_page": 112, "catalogue_guess": "Fake Song - Nobody"},
            {
                "raw_title": "Kids",
                "raw_page": 70,
                "catalogue_guess": sample_catalogue.entries[0].display,
            },
        ]
    }
    extraction = extract_rows(
        b"img", "image/jpeg", sample_catalogue, client=FakeClient(json.dumps(rows))
    )
    assert extraction.rows[0].catalogue_guess is None
    assert extraction.rows[1].catalogue_guess == sample_catalogue.entries[0].display


def test_extract_rows_wraps_model_errors(sample_catalogue):
    extraction_error = FakeClient("this is not json")
    with pytest.raises(VisionError):
        extract_rows(b"img", "image/jpeg", sample_catalogue, client=extraction_error)


def test_missing_api_key_raises_config_error(sample_catalogue, monkeypatch):
    from utrequests.config import Settings

    monkeypatch.setattr(vision, "get_settings", lambda: Settings(gemini_api_key=None))
    with pytest.raises(VisionConfigError, match="GEMINI_API_KEY"):
        extract_rows(b"img", "image/jpeg", sample_catalogue)
