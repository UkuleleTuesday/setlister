"""Smoke tests against real Gemini and GCS: ``uv run pytest -m live``, with ADC.

To add a case, drop the photo in tests/fixtures/whiteboards/ and add an entry
to its cases.json.
"""

import pytest

from utrequests.models import MatchStatus
from utrequests.pipeline import parse_photo

from .conftest import WHITEBOARDS, load_whiteboard_cases

pytestmark = pytest.mark.live

WHITEBOARD_CASES = load_whiteboard_cases()


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


@pytest.mark.parametrize(
    "case",
    WHITEBOARD_CASES,
    ids=[c["image"] for c in WHITEBOARD_CASES],
)
def test_whiteboard_sample(case):
    photo = (WHITEBOARDS / case["image"]).read_bytes()
    response = parse_photo(photo, "current")

    assert len(response.rows) >= case["min_rows"], (
        f"{case['image']}: expected >= {case['min_rows']} rows, "
        f"got {len(response.rows)}"
    )

    for expected in case.get("expect_titles", []):
        needle = expected["needle"]
        row = _row_matching(response, needle)
        assert row is not None, f"{case['image']}: row '{needle}' not detected"
        assert row.match is not None, f"{case['image']}: row '{needle}' not matched"

        wanted = expected.get("match_contains")
        if wanted:
            assert wanted in row.match.display.lower(), (
                f"{case['image']}: row '{needle}' matched "
                f"'{row.match.display}', expected to contain '{wanted}'"
            )

        if expected.get("status") == "confirmed":
            assert row.status == MatchStatus.CONFIRMED, (
                f"{case['image']}: row '{needle}' expected CONFIRMED, got {row.status}"
            )

    if case.get("expect_crossed_out"):
        assert any(r.crossed_out for r in response.rows), (
            f"{case['image']}: no crossed-out row detected"
        )
