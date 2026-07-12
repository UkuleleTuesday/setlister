"""End-to-end orchestration: photo bytes + edition -> ParseResponse."""

from .catalogue import fetch_catalogue
from .matcher import match_rows
from .models import ParseResponse
from .preprocess import prepare_image
from .vision import extract_rows


def parse_photo(
    image_data: bytes,
    edition: str | None = None,
    *,
    client=None,
    model: str | None = None,
) -> ParseResponse:
    jpeg, mime = prepare_image(image_data)
    catalogue = fetch_catalogue(edition)
    extraction = extract_rows(jpeg, mime, catalogue, client=client, model=model)
    rows = match_rows(extraction, catalogue)
    return ParseResponse(
        edition=catalogue.edition,
        catalogue_generated_at=catalogue.generated_at,
        rows=rows,
        catalogue=catalogue.entries,
    )
