# Setlister

Proof of concept for turning photos of the Ukulele Tuesday song-request
whiteboard — the "whiteboard of wishes" — into a clean, reviewable setlist,
matched against the active UT songbook.

Take a photo of the board, and the app:

1. reads each handwritten row (song title + page number) with a multimodal
   vision model (Gemini),
2. matches every row against the published songbook catalogue
   (title fuzzy-matching + page-number cross-checking with
   [RapidFuzz](https://github.com/rapidfuzz/RapidFuzz)),
3. shows a review screen where uncertain rows can be corrected before
   copying/exporting the final setlist.

The songbook catalogue is derived from the public manifests published by
[songbook-generator](https://github.com/UkuleleTuesday/songbook-generator) at
`https://storage.googleapis.com/ukulele-tuesday-songbooks/<edition>/` — no
credentials needed.

## Quickstart

Requires [uv](https://docs.astral.sh/uv/) and Python 3.12+.

Gemini runs through Vertex AI over Application Default Credentials — no API
key needed. Authenticate once with `gcloud auth application-default login`
(uses the shared `songbook-generator` GCP project, same as `tabby` and
songbook-generator).

```bash
uv sync
gcloud auth application-default login   # one-time; ADC for Vertex AI

# CLI
uv run setlister editions                       # list songbook editions
uv run setlister catalogue --edition current    # dump song -> page catalogue
uv run setlister parse photo.jpg                # parse a whiteboard photo
uv run setlister parse photo.jpg --json         # machine-readable output

# Web app (mobile-first review UI): API + static UI are served separately
uv run setlister serve                          # API on http://127.0.0.1:8080
python3 -m http.server 3000 -d ui               # UI on http://localhost:3000
```

## Development

```bash
uv run pytest              # offline test suite (no API key needed)
uv run pytest -m live      # live smoke test (needs ADC + network)
uv run ruff check .
uv run ruff format .
```

## Deployment

The app deploys automatically on every merge to `main`
(`.github/workflows/ci.yaml`):

- **API** — a gen2 Cloud Function `setlister-api` in the shared
  `songbook-generator` GCP project (`europe-west1`), deployed with
  `gcloud functions deploy --source utrequests` (the same pattern as
  songbook-generator: `requirements.txt` is generated from `uv.lock` with
  `uv export` at deploy time). Vertex AI calls stay in `us-central1`.
- **UI** — the static `ui/` folder, published to GitHub Pages at
  `https://ukuleletuesday.github.io/setlister/`. It calls the function
  cross-origin; allowed origins are configured via `CORS_ALLOWED_ORIGINS`
  (see `.env.deploy`).

The endpoint is public but guarded: uploads are capped at 20 MB, `/api/parse`
is rate-limited per IP (in-process fixed window), and the function runs with
`--max-instances 2` to bound worst-case Vertex AI spend.

### One-time setup

These are manual, project-level steps (already-deployed siblings mean most of
this exists):

1. **Repo secret `GCP_SA_KEY`** — the deployer service-account JSON key (the
   same one the songbook-generator repo uses; it already deploys gen2
   `--allow-unauthenticated` functions in this project). If a fresh SA is
   minted instead, it needs `roles/cloudfunctions.admin` (or `.developer` plus
   a one-time `gcloud functions add-invoker-policy-binding setlister-api
   --region=europe-west1 --member=allUsers` by an admin) and
   `roles/iam.serviceAccountUser` on the default compute service account.
2. **Repo variable `GCP_PROJECT_ID`** = `songbook-generator`.
3. **Runtime Vertex access** — confirm the default compute service account has
   `roles/aiplatform.user` in the project (songbook-generator's worker already
   uses Vertex under it).
4. **GitHub Pages** — after the first `main` deploy creates the `gh-pages`
   branch, set repo Settings → Pages → deploy from branch `gh-pages`, `/`
   (root).
