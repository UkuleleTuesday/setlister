"""Deterministic matching of extracted whiteboard rows against the catalogue.

Pure module (no I/O): rapidfuzz title scoring plus rule-based validation of
the handwritten page number. The vision model's ``catalogue_guess`` is only
trusted when it verbatim-matches a catalogue entry, and even then it merely
adds a small scoring bonus — the catalogue remains the source of truth.
"""

import re

from rapidfuzz import fuzz
from unidecode import unidecode

from .models import (
    BoardRow,
    Candidate,
    Catalogue,
    CatalogueEntry,
    MatchedRow,
    MatchMethod,
    MatchStatus,
    WhiteboardExtraction,
)

STRONG_TITLE = 88.0
WEAK_TITLE = 65.0
# Weekly editions shuffle pages by a few positions; a written page this close
# to the matched title's page is treated as edition drift, not a conflict.
PAGE_NEAR = 4
GUESS_BONUS = 5.0
MAX_ALTERNATIVES = 3


def normalize(text: str) -> str:
    text = unidecode(text).casefold()
    text = re.sub(r"[^a-z0-9\s]", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    if text.startswith("the "):
        text = text[4:]
    return text


def score_title(raw_title: str, entry: CatalogueEntry) -> float:
    norm_raw = normalize(raw_title)
    if not norm_raw:
        return 0.0
    return max(
        fuzz.WRatio(norm_raw, normalize(entry.title)),
        fuzz.WRatio(norm_raw, normalize(entry.display)),
    )


def rank_candidates(row: BoardRow, catalogue: Catalogue) -> list[Candidate]:
    guess = (row.catalogue_guess or "").strip()
    candidates = []
    for entry in catalogue.entries:
        score = score_title(row.raw_title, entry)
        if guess and entry.display == guess:
            score = min(100.0, score + GUESS_BONUS)
        page_delta = row.raw_page - entry.page if row.raw_page is not None else None
        candidates.append(
            Candidate(entry=entry, title_score=score, page_delta=page_delta)
        )
    candidates.sort(key=lambda c: c.title_score, reverse=True)
    return candidates


def match_row(row: BoardRow, catalogue: Catalogue) -> MatchedRow:
    candidates = rank_candidates(row, catalogue)
    best = candidates[0] if candidates else None
    page_entry = (
        catalogue.entry_by_page(row.raw_page) if row.raw_page is not None else None
    )

    def result(
        status: MatchStatus,
        method: MatchMethod,
        confidence: float,
        match: CatalogueEntry | None,
        explanation: str,
        alternatives: list[Candidate],
    ) -> MatchedRow:
        return MatchedRow(
            raw_title=row.raw_title,
            raw_page=row.raw_page,
            notes=row.notes,
            crossed_out=row.crossed_out,
            status=status,
            method=method,
            confidence=round(confidence, 2),
            match=match,
            alternatives=[a for a in alternatives if a.entry != match][
                :MAX_ALTERNATIVES
            ],
            explanation=explanation,
        )

    if best and best.title_score >= STRONG_TITLE:
        entry = best.entry
        if row.raw_page == entry.page:
            return result(
                MatchStatus.CONFIRMED,
                MatchMethod.HIGH_CONFIDENCE,
                min(0.99, 0.9 + best.title_score / 1000),
                entry,
                f"Title and page both match “{entry.display}”",
                candidates[1:],
            )
        if row.raw_page is None:
            return result(
                MatchStatus.NEEDS_REVIEW,
                MatchMethod.TITLE_ONLY,
                0.75,
                entry,
                f"Title matches “{entry.display}” but no page number was readable",
                candidates[1:],
            )
        delta = row.raw_page - entry.page
        if abs(delta) <= PAGE_NEAR:
            return result(
                MatchStatus.NEEDS_REVIEW,
                MatchMethod.HIGH_CONFIDENCE,
                0.85,
                entry,
                f"Title matches “{entry.display}” but the written page is off by "
                f"{abs(delta)}. Photo of an older songbook edition?",
                candidates[1:],
            )
        alternatives = candidates[1:]
        if page_entry is not None:
            page_candidate = Candidate(
                entry=page_entry,
                title_score=score_title(row.raw_title, page_entry),
                page_delta=0,
            )
            alternatives = [page_candidate] + [
                c for c in alternatives if c.entry != page_entry
            ]
            return result(
                MatchStatus.CONFLICT,
                MatchMethod.CONFLICT,
                0.5,
                entry,
                f"Title says “{entry.display}” (p.{entry.page}) but page "
                f"{row.raw_page} is “{page_entry.display}”",
                alternatives,
            )
        return result(
            MatchStatus.NEEDS_REVIEW,
            MatchMethod.TITLE_ONLY,
            0.6,
            entry,
            f"Title matches “{entry.display}” but page {row.raw_page} "
            f"is not in this songbook",
            alternatives,
        )

    if page_entry is not None and score_title(row.raw_title, page_entry) >= WEAK_TITLE:
        return result(
            MatchStatus.NEEDS_REVIEW,
            MatchMethod.PAGE_RECOVERY,
            0.7,
            page_entry,
            f"Page {row.raw_page} is “{page_entry.display}” and the handwriting "
            f"is broadly compatible",
            candidates,
        )

    return result(
        MatchStatus.UNMATCHED,
        MatchMethod.NONE,
        0.0,
        None,
        "No confident match. Pick the song manually",
        candidates,
    )


def match_rows(
    extraction: WhiteboardExtraction, catalogue: Catalogue
) -> list[MatchedRow]:
    return [match_row(row, catalogue) for row in extraction.rows]
