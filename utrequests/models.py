from enum import StrEnum

from pydantic import BaseModel, Field


class EditionInfo(BaseModel):
    id: str
    title: str = ""
    description: str = ""


class CatalogueEntry(BaseModel):
    id: str
    display: str
    title: str
    artist: str | None = None
    page: int


class Catalogue(BaseModel):
    edition: EditionInfo
    generated_at: str = ""
    entries: list[CatalogueEntry]

    def entry_by_page(self, page: int) -> CatalogueEntry | None:
        for entry in self.entries:
            if entry.page == page:
                return entry
        return None


class BoardRow(BaseModel):
    """One handwritten row as extracted by the vision model."""

    raw_title: str = Field(description="The literal handwritten title, misspellings kept")
    raw_page: int | None = Field(
        default=None, description="The handwritten page number, null if missing/unreadable"
    )
    notes: str | None = Field(
        default=None, description="Side annotations written next to the title, if any"
    )
    crossed_out: bool = Field(default=False, description="True if the row is struck through")
    catalogue_guess: str | None = Field(
        default=None,
        description="Exact 'Title - Artist' line copied verbatim from the supplied songbook, or null",
    )


class WhiteboardExtraction(BaseModel):
    rows: list[BoardRow]


class MatchStatus(StrEnum):
    CONFIRMED = "confirmed"
    NEEDS_REVIEW = "needs_review"
    CONFLICT = "conflict"
    UNMATCHED = "unmatched"


class MatchMethod(StrEnum):
    HIGH_CONFIDENCE = "high_confidence"
    PAGE_RECOVERY = "page_recovery"
    TITLE_ONLY = "title_only"
    CONFLICT = "conflict"
    NONE = "none"


class Candidate(BaseModel):
    entry: CatalogueEntry
    title_score: float
    page_delta: int | None = None


class MatchedRow(BaseModel):
    raw_title: str
    raw_page: int | None = None
    notes: str | None = None
    crossed_out: bool = False
    status: MatchStatus
    method: MatchMethod
    confidence: float
    match: CatalogueEntry | None = None
    alternatives: list[Candidate] = []
    explanation: str = ""


class ParseResponse(BaseModel):
    edition: EditionInfo
    catalogue_generated_at: str = ""
    rows: list[MatchedRow]
    catalogue: list[CatalogueEntry]
