"""End-to-end smoke test against the real Gemini API and GCS bucket.

Deselected by default; run with:  uv run pytest -m live
Requires Google ADC (`gcloud auth application-default login`) and network access.
"""

import pytest

from utrequests.models import MatchStatus
from utrequests.pipeline import parse_photo

from .conftest import FIXTURES

pytestmark = pytest.mark.live


@pytest.fixture(autouse=True)
def _require_credentials():
    import google.auth
    import google.auth.exceptions

    try:
        google.auth.default()
    except google.auth.exceptions.DefaultCredentialsError:
        pytest.skip("no Google ADC — run `gcloud auth application-default login`")


def _row_matching(response, needle):
    return next(
        (r for r in response.rows if needle in r.raw_title.lower()),
        None,
    )


def test_sample_photo_end_to_end():
    photo = (FIXTURES / "whiteboard_sample.jpg").read_bytes()
    response = parse_photo(photo, "current")

    # The board has 7 rows; allow the model a little slack either way.
    assert len(response.rows) >= 6

    vampire = _row_matching(response, "vampire")
    assert vampire is not None, "Vampire row not detected"
    assert vampire.match is not None
    assert "vampire" in vampire.match.display.lower()

    murder = _row_matching(response, "murder")
    assert murder is not None, "Murder on the Dancefloor row not detected"
    assert murder.match is not None
    # exact page agreement in the current edition -> should be auto-confirmed
    assert murder.status == MatchStatus.CONFIRMED


def test_sample_photo_2_end_to_end():
    # Older-edition board (pages drift a lot) with a distinctive edge case:
    # one row has only a page number and no title. See fixture image.
    photo = (FIXTURES / "whiteboard_sample_2.jpg").read_bytes()
    response = parse_photo(photo, "current")

    assert len(response.rows) >= 7

    hotel_yorba = _row_matching(response, "hotel yorba")
    assert hotel_yorba is not None, "Hotel Yorba row not detected"
    assert hotel_yorba.match is not None
    assert "hotel yorba" in hotel_yorba.match.display.lower()

    ho_hey = _row_matching(response, "ho hey")
    assert ho_hey is not None, "Ho Hey row not detected"
    assert ho_hey.match is not None
    assert "ho hey" in ho_hey.match.display.lower()


def test_sample_photo_3_end_to_end():
    # Older-edition board with a crossed-out request ("Hand in My Pocket") and
    # a title written in shorthand ("i oughta know" -> You Oughta Know).
    photo = (FIXTURES / "whiteboard_sample_3.jpg").read_bytes()
    response = parse_photo(photo, "current")

    assert len(response.rows) >= 7

    proud_mary = _row_matching(response, "proud mary")
    assert proud_mary is not None, "Proud Mary row not detected"
    assert proud_mary.match is not None
    assert "proud mary" in proud_mary.match.display.lower()

    # The board has one visibly crossed-out entry — the model should flag it.
    assert any(r.crossed_out for r in response.rows), "No crossed-out row detected"
