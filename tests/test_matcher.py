import pytest

from utrequests.matcher import (
    GUESS_BONUS,
    PAGE_NEAR,
    match_row,
    match_rows,
    normalize,
    rank_candidates,
    score_title,
)
from utrequests.models import (
    BoardRow,
    MatchMethod,
    MatchStatus,
    WhiteboardExtraction,
)

from .conftest import load_fixture


def entry_for(catalogue, fragment):
    for e in catalogue.entries:
        if fragment.lower() in e.display.lower():
            return e
    raise AssertionError(f"no entry containing {fragment!r}")


def test_normalize_strips_accents_case_punctuation_and_leading_the():
    assert normalize("The Beast!!") == "beast"
    assert normalize("Sarà Perché Ti Amo") == "sara perche ti amo"


def test_score_title_accent_insensitive(sample_catalogue):
    entry = entry_for(sample_catalogue, "Sarà Perché")
    assert score_title("Sara perche ti amo", entry) >= 95


def test_exact_title_and_page_confirmed(sample_catalogue):
    entry = entry_for(sample_catalogue, "vampire")
    row = BoardRow(raw_title="Vampire", raw_page=entry.page)
    matched = match_row(row, sample_catalogue)
    assert matched.status == MatchStatus.CONFIRMED
    assert matched.method == MatchMethod.HIGH_CONFIDENCE
    assert matched.match == entry
    assert matched.confidence >= 0.9


def test_page_drift_within_tolerance_needs_review(sample_catalogue):
    entry = entry_for(sample_catalogue, "Dreams - The Cranberries")
    row = BoardRow(raw_title="Dreams", raw_page=entry.page - PAGE_NEAR)
    matched = match_row(row, sample_catalogue)
    assert matched.status == MatchStatus.NEEDS_REVIEW
    assert matched.match == entry
    assert "older" in matched.explanation


def test_far_page_pointing_at_other_song_is_conflict(sample_catalogue):
    title_entry = entry_for(sample_catalogue, "vampire")
    other = entry_for(sample_catalogue, "Kids - MGMT")
    assert abs(other.page - title_entry.page) > PAGE_NEAR
    row = BoardRow(raw_title="Vampire", raw_page=other.page)
    matched = match_row(row, sample_catalogue)
    assert matched.status == MatchStatus.CONFLICT
    assert matched.match == title_entry
    assert matched.alternatives[0].entry == other


def test_page_recovery_from_bad_handwriting(sample_catalogue):
    entry = entry_for(sample_catalogue, "Murder On The Dancefloor")
    row = BoardRow(raw_title="Murdr on the Dnce Flr", raw_page=entry.page)
    matched = match_row(row, sample_catalogue)
    assert matched.match == entry
    assert matched.status in (MatchStatus.CONFIRMED, MatchStatus.NEEDS_REVIEW)


def test_title_only_when_page_missing(sample_catalogue):
    row = BoardRow(raw_title="Vampire", raw_page=None)
    matched = match_row(row, sample_catalogue)
    assert matched.status == MatchStatus.NEEDS_REVIEW
    assert matched.method == MatchMethod.TITLE_ONLY


def test_unmatched_gibberish_still_offers_alternatives(sample_catalogue):
    row = BoardRow(raw_title="Zzzzqqq Fnord", raw_page=None)
    matched = match_row(row, sample_catalogue)
    assert matched.status == MatchStatus.UNMATCHED
    assert matched.match is None
    assert len(matched.alternatives) == 3


def test_song_not_in_edition_with_stale_page(sample_catalogue):
    # "I Kissed a Girl" is not in the current edition; its old page points at
    # some other song. Whatever the outcome, it must not be auto-confirmed.
    row = BoardRow(raw_title="I KISSED A GIRL", raw_page=56)
    matched = match_row(row, sample_catalogue)
    assert matched.status != MatchStatus.CONFIRMED


def test_verbatim_catalogue_guess_adds_bonus(sample_catalogue):
    entry = entry_for(sample_catalogue, "Sarà Perché")
    plain = rank_candidates(BoardRow(raw_title="Sara ti amo", raw_page=None), sample_catalogue)
    boosted = rank_candidates(
        BoardRow(raw_title="Sara ti amo", raw_page=None, catalogue_guess=entry.display),
        sample_catalogue,
    )
    plain_score = next(c.title_score for c in plain if c.entry == entry)
    boosted_score = next(c.title_score for c in boosted if c.entry == entry)
    assert boosted_score == pytest.approx(min(100.0, plain_score + GUESS_BONUS))


def test_non_verbatim_guess_is_ignored(sample_catalogue):
    row = BoardRow(
        raw_title="Zzzzqqq Fnord",
        raw_page=None,
        catalogue_guess="Made Up Song - Nobody",
    )
    matched = match_row(row, sample_catalogue)
    assert matched.status == MatchStatus.UNMATCHED


def test_crossed_out_flag_passes_through(sample_catalogue):
    entry = entry_for(sample_catalogue, "vampire")
    row = BoardRow(raw_title="Vampire", raw_page=entry.page, crossed_out=True)
    assert match_row(row, sample_catalogue).crossed_out is True


def test_sample_photo_extraction_against_current_catalogue(sample_catalogue):
    """The recorded whiteboard photo is from an older edition: pages drift by
    2-4 and one song has left the book. Nothing should hard-fail."""
    extraction = WhiteboardExtraction.model_validate(load_fixture("vision_sample.json"))
    rows = match_rows(extraction, sample_catalogue)
    by_title = {r.raw_title: r for r in rows}

    assert len(rows) == 7

    # exact page match survives the edition change
    murder = by_title["MURDER ON THE DANCE FLOOR"]
    assert murder.status == MatchStatus.CONFIRMED

    # drifted pages match the right song but ask for review
    for title, expected in [
        ("Vampire", "vampire - Olivia Rodrigo"),
        ("Sara perchè ti amo", "Sarà Perché Ti Amo - Ricchi E Poveri"),
        ("THE BEST", "The Best (Edit) - Tina Turner"),
        ("KIDS", "Kids - MGMT"),
        ("DREAMS", "Dreams - The Cranberries"),
    ]:
        row = by_title[title]
        assert row.match is not None and row.match.display == expected, title
        assert row.status == MatchStatus.NEEDS_REVIEW, title

    # song no longer in the songbook must not be silently confirmed
    assert by_title["I KISSED A GIRL"].status != MatchStatus.CONFIRMED


@pytest.mark.parametrize("delta", [1, PAGE_NEAR])
def test_drift_boundary_is_review_not_conflict(sample_catalogue, delta):
    entry = entry_for(sample_catalogue, "Kids - MGMT")
    matched = match_row(BoardRow(raw_title="Kids", raw_page=entry.page + delta), sample_catalogue)
    assert matched.status == MatchStatus.NEEDS_REVIEW
