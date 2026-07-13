"""End-to-end smoke tests against the real Gemini API and GCS bucket.

Deselected by default; run with:  uv run pytest -m live
Requires Google ADC (`gcloud auth application-default login`) and network access.

Each whiteboard photo is described declaratively in
``tests/fixtures/whiteboard_cases.json`` and exercised by the parametrized
``test_whiteboard_sample`` below. To add a new test case, drop the image in
``tests/fixtures/`` and append an entry to that manifest — no new test code.
"""

import pytest

from utrequests.models import MatchStatus
from utrequests.pipeline import parse_photo

from .conftest import FIXTURES, load_fixture

pytestmark = pytest.mark.live

WHITEBOARD_CASES = load_fixture("whiteboard_cases.json")


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
    photo = (FIXTURES / case["image"]).read_bytes()
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
                f"{case['image']}: row '{needle}' expected CONFIRMED, "
                f"got {row.status}"
            )

    if case.get("expect_crossed_out"):
        assert any(r.crossed_out for r in response.rows), (
            f"{case['image']}: no crossed-out row detected"
        )
