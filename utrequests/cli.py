import sys
from pathlib import Path

import click

from .catalogue import CatalogueError, fetch_catalogue, list_editions
from .models import MatchedRow, MatchStatus
from .pipeline import parse_photo
from .preprocess import ImageError
from .vision import VisionConfigError, VisionError

STATUS_GLYPHS = {
    MatchStatus.CONFIRMED: "✓",
    MatchStatus.NEEDS_REVIEW: "?",
    MatchStatus.CONFLICT: "!",
    MatchStatus.UNMATCHED: "✗",
}


@click.group()
def cli():
    """Parse photos of the UT song-request whiteboard."""


def format_row(row: MatchedRow) -> str:
    glyph = STATUS_GLYPHS[row.status]
    if row.match:
        body = f"{row.match.display} (p.{row.match.page})"
        if row.raw_title.strip().lower() not in row.match.display.lower():
            body += f'  [wrote: "{row.raw_title}"]'
    else:
        body = f'"{row.raw_title}"' + (f" p.{row.raw_page}" if row.raw_page else "")
    line = f"{glyph} {body}"
    if row.crossed_out:
        line += "  (crossed out)"
    if row.status != MatchStatus.CONFIRMED:
        line += f"\n    → {row.explanation}"
        if not row.match and row.alternatives:
            options = ", ".join(
                f"{c.entry.display} (p.{c.entry.page})" for c in row.alternatives
            )
            line += f"\n    candidates: {options}"
    return line


@cli.command()
@click.argument("photo", type=click.Path(exists=True, dir_okay=False, path_type=Path))
@click.option("--edition", default=None, help="Songbook edition ID (default: current)")
@click.option("--model", default=None, help="Gemini model ID override")
@click.option(
    "--json", "as_json", is_flag=True, help="Print the full ParseResponse as JSON"
)
def parse(photo: Path, edition: str | None, model: str | None, as_json: bool):
    """Parse a whiteboard PHOTO into a matched song-request list."""
    try:
        response = parse_photo(photo.read_bytes(), edition, model=model)
    except VisionConfigError as e:
        raise click.ClickException(str(e)) from e
    except (CatalogueError, ImageError, VisionError) as e:
        raise click.ClickException(str(e)) from e

    if as_json:
        click.echo(response.model_dump_json(indent=2))
        return

    click.echo(
        f"Edition: {response.edition.title} "
        f"(catalogue generated {response.catalogue_generated_at or 'unknown'})\n"
    )
    for row in response.rows:
        click.echo(format_row(row))
    confirmed = sum(r.status == MatchStatus.CONFIRMED for r in response.rows)
    click.echo(
        f"\n{len(response.rows)} rows: {confirmed} confirmed, "
        f"{len(response.rows) - confirmed} needing review"
    )


@cli.command()
def editions():
    """List available songbook editions."""
    for edition in list_editions():
        click.echo(edition.id)


@cli.command()
@click.option("--edition", default=None, help="Songbook edition ID (default: current)")
@click.option("--json", "as_json", is_flag=True, help="Print as JSON")
def catalogue(edition: str | None, as_json: bool):
    """Dump the resolved song -> page catalogue (debugging aid)."""
    try:
        cat = fetch_catalogue(edition)
    except CatalogueError as e:
        raise click.ClickException(str(e)) from e
    if as_json:
        click.echo(cat.model_dump_json(indent=2))
        return
    for entry in cat.entries:
        click.echo(f"{entry.page:>4}  {entry.display}")


@cli.command()
@click.option("--host", default="127.0.0.1")
@click.option("--port", default=8080, type=int)
@click.option("--debug", is_flag=True)
def serve(host: str, port: int, debug: bool):
    """Run the API locally via functions-framework.

    The UI is served separately, e.g.: python3 -m http.server 3000 -d ui
    """
    from functions_framework import create_app

    source = Path(__file__).parent / "main.py"
    create_app(target="setlister_api", source=str(source)).run(
        host=host, port=port, debug=debug
    )


if __name__ == "__main__":
    sys.exit(cli())
