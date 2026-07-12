"""Fetch the songbook catalogue from the public GCS manifests.

songbook-generator publishes, per edition:

    <bucket>/<edition>/latest.json      -> {"manifest_filename": ..., ...}
    <bucket>/<edition>/<manifest_filename>

The manifest's ``content_info.file_names`` lists songs as "Title - Artist"
strings in final page order, and every song occupies exactly one page, so the
printed page of song *i* is ``page_indices.body.first_page + i``.
"""

import re
import time
import xml.etree.ElementTree as ET

import httpx
from unidecode import unidecode

from .config import KNOWN_EDITIONS, get_settings
from .models import Catalogue, CatalogueEntry, EditionInfo

_cache: dict[str, tuple[float, Catalogue]] = {}


class CatalogueError(RuntimeError):
    pass


def slugify(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", unidecode(text).lower()).strip("-")


def split_display(display: str) -> tuple[str, str | None]:
    """Split a "Title - Artist" string; titles may themselves contain " - "."""
    title, sep, artist = display.rpartition(" - ")
    if not sep:
        return display.strip(), None
    return title.strip(), artist.strip() or None


def build_catalogue(manifest: dict, edition_id: str) -> Catalogue:
    content = manifest.get("content_info") or {}
    file_names = content.get("file_names") or []
    if not file_names:
        raise CatalogueError(f"Manifest for edition '{edition_id}' lists no songs")
    page_indices = manifest.get("page_indices") or {}
    body = page_indices.get("body") or {}
    first_page = body.get("first_page")
    if not first_page:
        raise CatalogueError(
            f"Manifest for edition '{edition_id}' has no body page index"
        )

    entries = []
    for i, display in enumerate(file_names):
        title, artist = split_display(display)
        entries.append(
            CatalogueEntry(
                id=slugify(display),
                display=display,
                title=title,
                artist=artist,
                page=first_page + i,
            )
        )

    edition_meta = manifest.get("edition") or {}
    edition = EditionInfo(
        id=edition_meta.get("id") or edition_id,
        title=edition_meta.get("title") or edition_id,
        description=edition_meta.get("description") or "",
    )
    return Catalogue(
        edition=edition,
        generated_at=manifest.get("generated_at") or "",
        entries=entries,
    )


def fetch_catalogue(
    edition: str | None = None, *, ttl: float | None = None
) -> Catalogue:
    settings = get_settings()
    edition = edition or settings.default_edition
    ttl = settings.catalogue_cache_ttl if ttl is None else ttl

    cached = _cache.get(edition)
    if cached and time.monotonic() - cached[0] < ttl:
        return cached[1]

    base = f"{settings.bucket_base_url}/{edition}"
    try:
        latest = httpx.get(f"{base}/latest.json", timeout=20).raise_for_status().json()
        manifest_filename = latest.get("manifest_filename")
        if not manifest_filename:
            raise CatalogueError(
                f"latest.json for edition '{edition}' has no manifest_filename"
            )
        manifest = (
            httpx.get(f"{base}/{manifest_filename}", timeout=20)
            .raise_for_status()
            .json()
        )
    except httpx.HTTPStatusError as e:
        if e.response.status_code == 404:
            raise CatalogueError(
                f"No published songbook found for edition '{edition}'"
            ) from e
        raise CatalogueError(f"Failed to fetch catalogue for '{edition}': {e}") from e
    except httpx.HTTPError as e:
        raise CatalogueError(f"Failed to fetch catalogue for '{edition}': {e}") from e

    catalogue = build_catalogue(manifest, edition)
    _cache[edition] = (time.monotonic(), catalogue)
    return catalogue


def clear_cache() -> None:
    _cache.clear()


# Edition IDs are kebab-case YAML filenames in songbook-generator; Drive-based
# editions publish under their raw Drive folder ID (mixed case) — skip those.
_EDITION_ID = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")


def list_editions() -> list[EditionInfo]:
    """Discover editions from the public bucket listing, with a static fallback."""
    settings = get_settings()
    try:
        resp = httpx.get(
            settings.bucket_base_url, params={"delimiter": "/"}, timeout=20
        )
        resp.raise_for_status()
        root = ET.fromstring(resp.text)
        ns = root.tag.partition("}")[0] + "}" if root.tag.startswith("{") else ""
        ids = sorted(
            prefix.text.rstrip("/")
            for el in root.iter(f"{ns}CommonPrefixes")
            if (prefix := el.find(f"{ns}Prefix")) is not None
            and prefix.text
            and _EDITION_ID.match(prefix.text.rstrip("/"))
        )
        if ids:
            return [EditionInfo(id=i, title=i) for i in ids]
    except (httpx.HTTPError, ET.ParseError):
        pass
    return [EditionInfo(id=i, title=i) for i in KNOWN_EDITIONS]
