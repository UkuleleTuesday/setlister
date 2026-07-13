import json
from pathlib import Path

from click.testing import CliRunner

from utrequests import cli as cli_module
from utrequests.cli import cli
from utrequests.models import ParseResponse

from .conftest import FIXTURES, load_fixture


def make_response(sample_catalogue) -> ParseResponse:
    from utrequests.matcher import match_rows
    from utrequests.models import WhiteboardExtraction

    extraction = WhiteboardExtraction.model_validate(load_fixture("vision_sample.json"))
    return ParseResponse(
        edition=sample_catalogue.edition,
        catalogue_generated_at=sample_catalogue.generated_at,
        rows=match_rows(extraction, sample_catalogue),
        catalogue=sample_catalogue.entries,
    )


def test_parse_human_output(monkeypatch, sample_catalogue):
    response = make_response(sample_catalogue)
    monkeypatch.setattr(cli_module, "parse_photo", lambda *a, **k: response)
    result = CliRunner().invoke(cli, ["parse", str(FIXTURES / "whiteboard_sample.jpg")])
    assert result.exit_code == 0, result.output
    assert "Murder On The Dancefloor" in result.output
    assert "7 rows" in result.output


def test_parse_json_output(monkeypatch, sample_catalogue):
    response = make_response(sample_catalogue)
    monkeypatch.setattr(cli_module, "parse_photo", lambda *a, **k: response)
    result = CliRunner().invoke(
        cli, ["parse", str(FIXTURES / "whiteboard_sample.jpg"), "--json"]
    )
    assert result.exit_code == 0, result.output
    payload = json.loads(result.output)
    assert len(payload["rows"]) == 7
    assert payload["edition"]["id"] == "current"


def test_parse_missing_credentials_is_clean_error(monkeypatch):
    from utrequests.vision import VisionConfigError

    def boom(*a, **k):
        raise VisionConfigError("run `gcloud auth application-default login`")

    monkeypatch.setattr(cli_module, "parse_photo", boom)
    result = CliRunner().invoke(cli, ["parse", str(FIXTURES / "whiteboard_sample.jpg")])
    assert result.exit_code != 0
    assert "application-default" in result.output
    assert "Traceback" not in result.output


def test_parse_rejects_missing_file():
    result = CliRunner().invoke(cli, ["parse", "no-such-file.jpg"])
    assert result.exit_code != 0


def test_catalogue_command(mock_bucket):
    result = CliRunner().invoke(cli, ["catalogue", "--edition", "current"])
    assert result.exit_code == 0, result.output
    assert "9 to 5 - Dolly Parton" in result.output


def test_sample_photo_fixture_exists():
    assert (Path(FIXTURES) / "whiteboard_sample.jpg").stat().st_size > 10_000
