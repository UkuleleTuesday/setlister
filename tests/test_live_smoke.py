"""End-to-end smoke test against the real Gemini API and GCS bucket.

Deselected by default; run with:  uv run pytest -m live
Requires GEMINI_API_KEY (env or .env) and network access.
"""

import pytest

from utrequests.config import get_settings
from utrequests.models import MatchStatus
from utrequests.pipeline import parse_photo

from .conftest import FIXTURES

pytestmark = pytest.mark.live


@pytest.fixture(autouse=True)
def _require_key():
    if not get_settings().gemini_api_key:
        pytest.skip("GEMINI_API_KEY not set")


def test_sample_photo_end_to_end():
    photo = (FIXTURES / "whiteboard_sample.jpg").read_bytes()
    response = parse_photo(photo, "current")

    # The board has 7 rows; allow the model a little slack either way.
    assert len(response.rows) >= 6

    by_title = {r.raw_title.lower(): r for r in response.rows}
    vampire = next((r for t, r in by_title.items() if "vampire" in t), None)
    assert vampire is not None, "Vampire row not detected"
    assert vampire.match is not None
    assert "vampire" in vampire.match.display.lower()

    murder = next((r for t, r in by_title.items() if "murder" in t), None)
    assert murder is not None, "Murder on the Dancefloor row not detected"
    assert murder.match is not None
    # exact page agreement in the current edition -> should be auto-confirmed
    assert murder.status == MatchStatus.CONFIRMED
