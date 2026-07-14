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
3. shows a review screen where uncertain rows can be corrected, then drops
   the songs into a **Requests** pool. You build the **Up next** running
   order by promoting requests into it (and can add songs by name too),
   then copy/export the result.

The web UI is **mobile-first**: the whole point is to pull out a phone at the
club, snap the board, and build the setlist on the spot. Design and test UI
changes for a phone (touch targets, tap-to-dismiss, safe-area insets, small
viewport) first; desktop is the incidental case.

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

# Web app (mobile-first review UI): API + Vite dev server run separately
uv run setlister serve                          # API on http://127.0.0.1:8080
cd ui && npm ci && npm run dev                  # UI on http://localhost:3000
```

## Development

```bash
uv run pytest              # offline test suite (no API key needed)
uv run pytest -m live      # live smoke test (needs ADC + network)
uv run ruff check .
uv run ruff format .
```

The `ui/` app is built with [Vite](https://vite.dev/) — `index.html` + `app.js`
+ `style.css`, npm-managed, no other framework. Run `npm ci` then `npm run dev`
in `ui/` to start the Vite dev server on port 3000. There is no automated JS
test suite: verify UI changes by driving the real page in a phone-sized,
touch-enabled browser (e.g. Playwright with `{ isMobile: true, hasTouch: true }`
at a ~390px viewport, using `.tap()`) and confirm there are no console errors.

## Deployment

The app deploys automatically on every merge to `main`
(`.github/workflows/ci.yaml`):

- **API** — a gen2 Cloud Function `setlister-api` in the shared
  `songbook-generator` GCP project (`europe-west1`), deployed with
  `gcloud functions deploy --source utrequests` (the same pattern as
  songbook-generator: `requirements.txt` is generated from `uv.lock` with
  `uv export` at deploy time). Vertex AI calls stay in `us-central1`.
- **UI** — built by Vite (`npm run build` in `ui/`); the `ui/dist` folder is
  published to GitHub Pages via branch flow: CI pushes it to the `gh-pages`
  branch, which Pages serves at `https://ukuleletuesday.github.io/setlister/`.
  It calls the function cross-origin; allowed origins are configured via
  `CORS_ALLOWED_ORIGINS` (see `.env.deploy`).

The endpoint is public but guarded: uploads are capped at 20 MB, `/api/parse`
is rate-limited per IP (in-process fixed window), and the function runs with
`--max-instances 1` to bound worst-case Vertex AI spend (expected traffic is a
handful of photos per club night, so one instance is plenty).

- **Firestore (session sharing)** — realtime collaborative sessions store a
  single doc `sessions/{sessionId}` that the browser reads/writes directly via
  the Firebase Web SDK, so [`firestore.rules`](./firestore.rules) is the entire
  access-control layer (deliberately unauthenticated — closed schema +
  deny-by-default + a hard TTL cap). Rules deploy automatically on merge to main
  (`deploy-rules` job). A TTL policy on `expiresAt` expires stale sessions.
  Local development runs the Firestore emulator on port **8081** (8080 is the
  Python API): `npx firebase-tools emulators:start --only firestore`.

### One-time setup

CI authenticates to GCP with **Workload Identity Federation** — GitHub mints a
short-lived OIDC token that GCP exchanges for deployer-SA credentials, so
there are **no keys and no GitHub secrets/variables to configure**. A project
admin runs [`deploy-gcs.sh`](./deploy-gcs.sh) once. The script reads its config
from `.env.deploy`, is idempotent (safe to re-run), and provisions the deployer
service account, the GitHub OIDC workload-identity pool/provider, and the
runtime Vertex AI + Cloud Trace roles for the function's compute SA:

```bash
./deploy-gcs.sh
```

Firestore additionally needs a one-time provisioning pass (the app half of the
project, not covered by `deploy-gcs.sh`). Run once by a project admin:

```bash
# Add Firebase to the existing GCP project and enable the rules API.
firebase projects:addfirebase songbook-generator
gcloud services enable firebaserules.googleapis.com --project=songbook-generator

# Default Firestore database, Native mode, europe-west1 (matches the function).
gcloud firestore databases create --location=europe-west1 \
  --type=firestore-native --project=songbook-generator

# Register a Web App to obtain the web config (apiKey, projectId, appId) that
# the UI (#27) embeds.
firebase apps:create web setlister --project=songbook-generator
firebase apps:sdkconfig web --project=songbook-generator   # print the config

# TTL policy so expired sessions are cleaned up automatically.
gcloud firestore fields ttls update expiresAt \
  --collection-group=sessions --enable-ttl --project=songbook-generator

# Then re-run ./deploy-gcs.sh so the deployer SA gains the Firebase rules roles.
```

Open rules mean usage is the blast radius — confirm a GCP **budget alert** is
set on the project.
