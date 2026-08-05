# Setlister

**Live app:** https://ukuleletuesday.github.io/setlister/

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

The app opens on the club's **session history**: past nights, tagged with
whoever started them, plus a button to start tonight's. A session is shared and
live — everyone in the room edits the same lists — and stays in the history
afterwards.

Nights name themselves. A session is labelled from its date — *Tonight*,
*Yesterday*, *Thursday*, *Tomorrow*, *28 July*, *16 December 2025* — rendered
in each viewer's own locale rather than frozen into a stored string, so the
label stays true as it ages. There are no custom titles: the date IS the
identity. Starting a session asks for its date (prefilled with today), so a
missed night can be backfilled and next Tuesday's set can be prepped in
advance.

Visibility is **Shared** or **Unlisted**. Unlisted keeps a night out of the
club's list — the share link still opens it, so this is discoverability, not
privacy. There is no private mode: every session is readable by anyone holding
its id.

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
in `ui/` to start the Vite dev server on port 3000.

```bash
cd ui
npm test              # pure unit tests (no emulator)
npm run test:emulator # everything, incl. the firestore.rules suite
```

`ui/tests/rules.test.js` runs against the Firestore emulator and covers
[`firestore.rules`](./firestore.rules) — the app's entire access-control layer,
since the browser writes Firestore directly. `npm test` alone will fail it with
a connection error, which is deliberate: a skipped security suite must not look
like a passing one. CI runs `test:emulator`.

Everything else is still verified by hand: drive the real page in a phone-sized,
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

Every pull request also gets a **UI preview environment** on GitHub Pages
(`deploy-ui` job, using [`rossjrw/pr-preview-action`](https://github.com/rossjrw/pr-preview-action)).
CI builds the PR's `ui/dist` and publishes it to
`https://ukuleletuesday.github.io/setlister/pr-preview/pr-<N>/`, then posts the
link as a comment on the PR. Because Vite builds with relative asset URLs
(`base: "./"`), the same build works under that subpath, and the preview shares
the production `github.io` origin so no extra CORS entry is needed. The `main`
deploy uses `clean-exclude: pr-preview/` so publishing production never wipes
open previews, and the preview is removed automatically when the PR is merged or
closed (`cleanup-ui-preview` job).

The endpoint is public but guarded: uploads are capped at 20 MB, `/api/parse`
is rate-limited per IP (in-process fixed window), and the function runs with
`--max-instances 1` to bound worst-case Vertex AI spend (expected traffic is a
handful of photos per club night, so one instance is plenty).

- **Firestore (sessions)** — every setlist is a realtime collaborative session
  stored as `sessions/{sessionId}`, plus a tiny `sessionIndex/{sessionId}`
  listing row (who started it, when its night is) that the home screen queries to show
  the club's history. The browser reads/writes both directly via the Firebase
  Web SDK, so [`firestore.rules`](./firestore.rules) is the entire
  access-control layer (deliberately unauthenticated — closed schema +
  deny-by-default). Rules deploy automatically on merge to main
  (`deploy-rules` job) and are covered by `ui/tests/rules.test.js`.
  **Sessions are kept forever** — the app opens on past nights, so nothing
  expires them. Local development runs the Firestore emulator on port **8081**
  (8080 is the Python API): `npx firebase-tools emulators:start --only
  firestore`.

  Accepted risks, unchanged in kind but larger in blast radius now that
  documents are immortal: anyone with the app URL can read the session list,
  open any session, edit it, or un-list it. Session documents themselves can
  never be deleted by a client. The real fix is authentication; until then the
  bounds are the closed schema, the bounded string fields, the 60-day cap on
  future-dated sessions, the 60-entry list query, and the budget alert below —
  which should now cover Firestore, not just Vertex AI.

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

# Then re-run ./deploy-gcs.sh so the deployer SA gains the Firebase rules roles.
```

**If this project was provisioned before session history shipped**, it has a TTL
policy on `expiresAt` that must be turned off — otherwise the sweep keeps
deleting sessions created by older builds, and the club's history loses its
oldest nights. Deploying the rules alone does *not* stop it:

```bash
gcloud firestore fields ttls list --project=songbook-generator   # check first
gcloud firestore fields ttls update expiresAt \
  --collection-group=sessions --disable-ttl --project=songbook-generator
```

This targets the `sessions` collection group only. Presence heartbeats live in
the separate `presence` collection group and keep whatever policy they have —
they are meant to expire.

Open rules mean usage is the blast radius — confirm a GCP **budget alert** is
set on the project.
