# Setlister

**Live app:** https://ukuleletuesday.github.io/setlister/

Turns photos of the Ukulele Tuesday song-request whiteboard — the "whiteboard
of wishes" — into a clean, reviewable setlist, matched against the active UT
songbook.

Take a photo of the board, and the app:

1. reads each handwritten row (song title + page number) with a multimodal
   vision model (Gemini) — the photo is downscaled in the browser first, so
   pub Wi-Fi only carries what the model actually sees;
2. matches every row against the published songbook catalogue
   (title fuzzy-matching + page-number cross-checking with
   [RapidFuzz](https://github.com/rapidfuzz/RapidFuzz));
3. drops the confident matches straight into the **Requests** pool — skipping
   anything already on the night's lists — and sends only the rows it was
   unsure about to a review sheet for correction.

From there you build the **Up next** running order by promoting requests into
it (songs can also be added by name), then copy or download the result.

The songbook catalogue is derived from the public manifests published by
[songbook-generator](https://github.com/UkuleleTuesday/songbook-generator) at
`https://storage.googleapis.com/ukulele-tuesday-songbooks/<edition>/` — no
credentials needed.

## Sessions

The app opens on the club's **session history**: past nights, tagged with
whoever started them, plus a button to start tonight's. A session is shared and
live — everyone in the room edits the same lists and can see who else is
connected — and stays in the history afterwards.

Nights name themselves. A session is labelled from its date — *Tonight*,
*Yesterday*, *Thursday*, *Next Friday*, *28 July*, *16 December 2025* —
rendered in each viewer's own locale rather than frozen into a stored string,
so the label stays true as it ages. There are no custom titles: the date IS the
identity. Starting a session asks for its date (prefilled with today), so a
missed night can be backfilled and next Tuesday's set prepped in advance.

Visibility is **Shared** or **Unlisted**. Unlisted keeps a night out of the
club's list — the share link still opens it, so this is discoverability, not
privacy. There is no private mode: every session is readable by anyone holding
its id.

## Mobile-first

The whole point is to pull out a phone at the club, snap the board, and build
the setlist on the spot. Design and test UI changes for a phone (touch targets,
tap-to-dismiss, safe-area insets, small viewport) first; desktop is the
incidental case.

## Quickstart

Requires [uv](https://docs.astral.sh/uv/) and Python 3.12+, plus Node for the
UI (CI uses 22).

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
```

The web app runs as three processes:

```bash
uv run setlister serve                                     # API on :8080
cd ui && npm ci && npm run dev                             # UI on :3000
npx --yes firebase-tools emulators:start --only firestore  # Firestore on :8081
```

On localhost the UI always talks to the emulator, never production Firestore.
Since everything happens inside a session, the emulator is required rather than
optional.

## Development

```bash
uv run pytest              # offline test suite (no API key needed)
uv run pytest -m live      # live smoke test (needs ADC + network)
uv run ruff check .
uv run ruff format .
```

The `ui/` app is plain ES modules bundled by [Vite](https://vite.dev/) and
managed with npm — `index.html` + `app.js` plus focused modules (sync,
presence, session index, dedupe, downscaling) and no framework; `firebase` and
`lucide` are the only runtime dependencies.

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

User-visible changes also need an entry in `ui/whats-new.json`, the in-app
changelog — see [AGENTS.md](./AGENTS.md) for that and the rest of the
contributor guidance.

## Deployment

Every merge to `main` deploys automatically (`.github/workflows/ci.yaml`):

- **API** — a gen2 Cloud Function `setlister-api` in the shared
  `songbook-generator` GCP project (`europe-west1`), deployed with
  `gcloud functions deploy --source utrequests` (the same pattern as
  songbook-generator: `requirements.txt` is generated from `uv.lock` with
  `uv export` at deploy time). Vertex AI calls stay in `us-central1`.
- **UI** — built by Vite (`npm run build` in `ui/`); CI pushes `ui/dist` to the
  `gh-pages` branch, which Pages serves at
  `https://ukuleletuesday.github.io/setlister/`. It calls the function
  cross-origin; allowed origins are configured via `CORS_ALLOWED_ORIGINS` (see
  `.env.deploy`).
- **Firestore rules** — pushed by the `deploy-rules` job.

Every pull request also gets a **UI preview environment** at
`https://ukuleletuesday.github.io/setlister/pr-preview/pr-<N>/`
([`rossjrw/pr-preview-action`](https://github.com/rossjrw/pr-preview-action)),
linked from a comment on the PR. Vite builds with relative asset URLs
(`base: "./"`), so the same build works under that subpath, and the preview
shares the production `github.io` origin so no extra CORS entry is needed. The
`main` deploy uses `clean-exclude: pr-preview/` so publishing production never
wipes open previews, and `cleanup-ui-preview` removes a preview when its PR is
merged or closed.

The endpoint is public but guarded: uploads are capped at 20 MB, `/api/parse`
is rate-limited per IP (8 requests per minute, in-process fixed window), and
the function runs with `--max-instances 1` to bound worst-case Vertex AI spend
(expected traffic is a handful of photos per club night, so one instance is
plenty).

### Sessions in Firestore

Every setlist is a realtime collaborative session stored as
`sessions/{sessionId}`, alongside a tiny `sessionIndex/{sessionId}` listing row
(who started it, when its night is) that the home screen queries to show the
club's history, and short-lived `presence` heartbeats for "who's here". The
browser reads and writes all of it directly via the Firebase Web SDK, so
[`firestore.rules`](./firestore.rules) is the entire access-control layer —
deliberately unauthenticated, defended by a closed schema and deny-by-default,
and covered by `ui/tests/rules.test.js`.

**Sessions are kept forever** — the app opens on past nights, so nothing
expires them, and no client can ever delete a session document.

Accepted risks, unchanged in kind but larger in blast radius now that documents
are immortal: anyone with the app URL can read the session list, open any
session, edit it, or un-list it. The real fix is authentication; until then the
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

# Register a Web App and print its config, then paste the values into
# ui/firebase-config.js — they are public client identifiers, not secrets.
firebase apps:create web setlister --project=songbook-generator
firebase apps:sdkconfig web --project=songbook-generator

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
