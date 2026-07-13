"""End-to-end orchestration: photo bytes + edition -> ParseResponse."""

from .catalogue import fetch_catalogue
from .matcher import match_rows
from .models import ParseResponse
from .preprocess import prepare_image
from .tracing import tracer
from .vision import extract_rows


def parse_photo(
    image_data: bytes,
    edition: str | None = None,
    *,
    client=None,
    model: str | None = None,
    thinking_budget: int | None = None,
    max_image_edge: int | None = None,
    catalogue_in_prompt: bool | None = None,
) -> ParseResponse:
    with tracer.start_as_current_span("setlister.parse") as span:
        with tracer.start_as_current_span("setlister.prepare"):
            jpeg, mime = prepare_image(image_data, max_edge=max_image_edge)

        with tracer.start_as_current_span("setlister.catalogue") as cat_span:
            catalogue = fetch_catalogue(edition)
            cat_span.set_attribute("catalogue.entries", len(catalogue.entries))

        with tracer.start_as_current_span("setlister.vision") as vision_span:
            extraction = extract_rows(
                jpeg,
                mime,
                catalogue,
                client=client,
                model=model,
                thinking_budget=thinking_budget,
                catalogue_in_prompt=catalogue_in_prompt,
            )
            vision_span.set_attribute("vision.rows", len(extraction.rows))

        with tracer.start_as_current_span("setlister.match"):
            rows = match_rows(extraction, catalogue)

        # Record the knob settings that produced this trace.
        span.set_attribute("catalogue.entries", len(catalogue.entries))
        span.set_attribute("rows", len(rows))
        if model is not None:
            span.set_attribute("knob.model", model)
        if thinking_budget is not None:
            span.set_attribute("knob.thinking_budget", thinking_budget)
        if max_image_edge is not None:
            span.set_attribute("knob.max_image_edge", max_image_edge)
        if catalogue_in_prompt is not None:
            span.set_attribute("knob.catalogue_in_prompt", catalogue_in_prompt)

        return ParseResponse(
            edition=catalogue.edition,
            catalogue_generated_at=catalogue.generated_at,
            rows=rows,
            catalogue=catalogue.entries,
        )
