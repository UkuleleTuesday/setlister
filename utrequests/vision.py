"""Extract whiteboard rows with Gemini, constrained to structured JSON.

The catalogue is sent along with the photo as *transcription context* — it
primes the model to read ambiguous handwriting, but all matching decisions
happen locally in :mod:`utrequests.matcher`. ``catalogue_guess`` values that
are not verbatim catalogue entries are discarded here.
"""

from functools import lru_cache

import google.auth.exceptions
from google import genai
from google.genai import types

from .config import get_settings
from .models import Catalogue, WhiteboardExtraction

# With the songbook attached: the board references it, so the model gets a
# transcription hint and a catalogue_guess to copy verbatim.
PROMPT_TEMPLATE = """\
This photo shows a whiteboard where people write song requests, one per row: \
a handwritten song title and a page number.

Extract every row from top to bottom, including crossed-out ones (set \
crossed_out=true for those). For each row:
- raw_title: exactly what is handwritten, keeping misspellings and \
abbreviations. Side annotations written next to the title (e.g. "(please \
NO!!!)") go in notes, not in the title.
- raw_page: the handwritten page number, or null if missing or unreadable.
- catalogue_guess: the board references the songbook below. If the row \
clearly corresponds to one of its entries, copy that entry's exact \
"Title - Artist" line; otherwise null. Never invent an entry that is not on \
the list.

Never merge two rows into one, and never skip a row. Ignore the column \
headers (e.g. "Song Title" / "Pg.").

SONGBOOK (page | Title - Artist):
{catalogue_lines}
"""

# Without the songbook (catalogue_in_prompt=False): pure transcription, no
# guesses — matching happens locally against the catalogue in the matcher.
PROMPT_NO_CATALOGUE = """\
This photo shows a whiteboard where people write song requests, one per row: \
a handwritten song title and a page number.

Extract every row from top to bottom, including crossed-out ones (set \
crossed_out=true for those). For each row:
- raw_title: exactly what is handwritten, keeping misspellings and \
abbreviations. Side annotations written next to the title (e.g. "(please \
NO!!!)") go in notes, not in the title.
- raw_page: the handwritten page number, or null if missing or unreadable.
- catalogue_guess: always null.

Never merge two rows into one, and never skip a row. Ignore the column \
headers (e.g. "Song Title" / "Pg.").
"""


class VisionConfigError(RuntimeError):
    pass


class VisionError(RuntimeError):
    pass


def build_prompt(catalogue: Catalogue, *, include_catalogue: bool = True) -> str:
    if not include_catalogue:
        return PROMPT_NO_CATALOGUE
    lines = "\n".join(f"{e.page} | {e.display}" for e in catalogue.entries)
    return PROMPT_TEMPLATE.format(catalogue_lines=lines)


@lru_cache
def get_client() -> genai.Client:
    # Vertex AI over ADC — no API key, matching ../tabby and songbook-generator.
    settings = get_settings()
    try:
        return genai.Client(
            vertexai=True,
            project=settings.gcp_project,
            location=settings.gcp_location,
        )
    except google.auth.exceptions.GoogleAuthError as e:
        raise VisionConfigError(
            "No Google Application Default Credentials. Run "
            "`gcloud auth application-default login` (Gemini runs through "
            f"Vertex AI in project {settings.gcp_project})."
        ) from e


def extract_rows(
    image_bytes: bytes,
    mime_type: str,
    catalogue: Catalogue,
    *,
    client: genai.Client | None = None,
    model: str | None = None,
    thinking_budget: int | None = None,
    catalogue_in_prompt: bool | None = None,
) -> WhiteboardExtraction:
    settings = get_settings()
    client = client or get_client()
    model = model or settings.gemini_model
    if thinking_budget is None:
        thinking_budget = settings.gemini_thinking_budget
    if catalogue_in_prompt is None:
        catalogue_in_prompt = settings.catalogue_in_prompt
    try:
        response = client.models.generate_content(
            model=model,
            contents=[
                types.Part.from_bytes(data=image_bytes, mime_type=mime_type),
                build_prompt(catalogue, include_catalogue=catalogue_in_prompt),
            ],
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=WhiteboardExtraction,
                temperature=0,
                thinking_config=types.ThinkingConfig(thinking_budget=thinking_budget),
            ),
        )
        extraction = WhiteboardExtraction.model_validate_json(response.text)
    except (VisionConfigError, VisionError):
        raise
    except Exception as e:  # genai raises a variety of transport/API errors
        raise VisionError(f"Vision model call failed: {e}") from e

    valid_displays = {e.display for e in catalogue.entries}
    for row in extraction.rows:
        if row.catalogue_guess and row.catalogue_guess not in valid_displays:
            row.catalogue_guess = None
    return extraction
