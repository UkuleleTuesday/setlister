import httpx
import pytest

from utrequests import catalogue
from utrequests.catalogue import (
    CatalogueError,
    build_catalogue,
    fetch_catalogue,
    list_editions,
    slugify,
    split_display,
)

from .conftest import load_fixture


def test_split_display_basic():
    assert split_display("Vampire - Olivia Rodrigo") == ("Vampire", "Olivia Rodrigo")


def test_split_display_hyphenated_title_splits_on_last_separator():
    assert split_display("Twist - And - Shout - The Beatles") == (
        "Twist - And - Shout",
        "The Beatles",
    )


def test_split_display_no_artist():
    assert split_display("Happy Birthday") == ("Happy Birthday", None)


def test_slugify_accents():
    assert slugify("Sarà Perché Ti Amo - Ricchi E Poveri") == (
        "sara-perche-ti-amo-ricchi-e-poveri"
    )


def test_build_catalogue_page_arithmetic():
    manifest = load_fixture("manifest_current.json")
    cat = build_catalogue(manifest, "current")
    first_page = manifest["page_indices"]["body"]["first_page"]
    assert len(cat.entries) == len(manifest["content_info"]["file_names"])
    assert cat.entries[0].page == first_page
    assert cat.entries[-1].page == first_page + len(cat.entries) - 1
    # pages are unique and consecutive
    pages = [e.page for e in cat.entries]
    assert pages == list(range(first_page, first_page + len(pages)))


def test_build_catalogue_edition_metadata():
    cat = build_catalogue(load_fixture("manifest_current.json"), "current")
    assert cat.edition.id == "current"
    assert cat.generated_at


def test_build_catalogue_rejects_empty_manifest():
    with pytest.raises(CatalogueError):
        build_catalogue({"content_info": {"file_names": []}}, "current")


def test_fetch_catalogue_uses_fixtures(mock_bucket):
    cat = fetch_catalogue("current")
    assert cat.entry_by_page(cat.entries[0].page) is cat.entries[0]
    assert cat.entry_by_page(99999) is None


def test_fetch_catalogue_caches(monkeypatch, mock_bucket):
    fetch_catalogue("current")
    monkeypatch.setattr(
        catalogue.httpx,
        "get",
        lambda *a, **k: pytest.fail("cached fetch should not hit the network"),
    )
    fetch_catalogue("current")


def test_fetch_catalogue_ttl_zero_refetches(mock_bucket):
    first = fetch_catalogue("current", ttl=0)
    second = fetch_catalogue("current", ttl=0)
    assert first is not second


def test_fetch_catalogue_missing_edition(monkeypatch):
    def fake_get(url, **kwargs):
        return httpx.Response(404, request=httpx.Request("GET", url))

    monkeypatch.setattr(catalogue.httpx, "get", fake_get)
    with pytest.raises(CatalogueError, match="No published songbook"):
        fetch_catalogue("nope")


def test_list_editions_parses_bucket_listing(monkeypatch):
    xml = """<?xml version='1.0' encoding='UTF-8'?>
    <ListBucketResult xmlns='http://doc.s3.amazonaws.com/2006-03-01'>
      <CommonPrefixes><Prefix>complete/</Prefix></CommonPrefixes>
      <CommonPrefixes><Prefix>current/</Prefix></CommonPrefixes>
    </ListBucketResult>"""

    def fake_get(url, **kwargs):
        return httpx.Response(200, text=xml, request=httpx.Request("GET", url))

    monkeypatch.setattr(catalogue.httpx, "get", fake_get)
    assert [e.id for e in list_editions()] == ["complete", "current"]


def test_list_editions_falls_back_on_error(monkeypatch):
    def fake_get(url, **kwargs):
        raise httpx.ConnectError("blocked")

    monkeypatch.setattr(catalogue.httpx, "get", fake_get)
    ids = [e.id for e in list_editions()]
    assert "current" in ids and "complete" in ids
