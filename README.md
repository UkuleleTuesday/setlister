# UT Whiteboard Song Request Parser

Proof of concept for parsing photos of the Ukulele Tuesday song-request
whiteboard into a clean, reviewable list of requested songs, matched against
the active UT songbook.

Take a photo of the board, and the app:

1. reads each handwritten row (song title + page number) with a multimodal
   vision model (Gemini),
2. matches every row against the published songbook catalogue
   (title fuzzy-matching + page-number cross-checking with
   [RapidFuzz](https://github.com/rapidfuzz/RapidFuzz)),
3. shows a review screen where uncertain rows can be corrected before
   copying/exporting the final request list.

The songbook catalogue is derived from the public manifests published by
[songbook-generator](https://github.com/UkuleleTuesday/songbook-generator) at
`https://storage.googleapis.com/ukulele-tuesday-songbooks/<edition>/` — no
credentials needed.

## Quickstart

Requires [uv](https://docs.astral.sh/uv/) and Python 3.12+.

```bash
uv sync
cp .env.example .env   # then set GEMINI_API_KEY

# CLI
uv run ut-requests editions                       # list songbook editions
uv run ut-requests catalogue --edition current    # dump song -> page catalogue
uv run ut-requests parse photo.jpg                # parse a whiteboard photo
uv run ut-requests parse photo.jpg --json         # machine-readable output

# Web app (mobile-first review UI)
uv run ut-requests serve --port 8000              # then open http://127.0.0.1:8000
```

## Development

```bash
uv run pytest              # offline test suite (no API key needed)
uv run pytest -m live      # live smoke test (needs GEMINI_API_KEY, network)
uv run ruff check .
uv run ruff format .
```
