# Setlister

**Live app:** https://ukuleletuesday.github.io/setlister/

The shared setlist for a Ukulele Tuesday night, run from everyone's phone. The
room works two live lists: **Requests**, the pool of what people want to play,
and **Up next**, the running order you actually play from. Songs are matched
against the active UT songbook, so a row carries the page to turn to.

Songs get in two ways:

- **By name** — pick from the songbook: the whole book in page order, searchable
  by title, artist or page number, each tune tagged if it's already played or
  on tonight's lists. Each add is confirmed, with an optional comment. It sits
  at the top of the pool, because mid-night someone shouts a request and it has
  to land without scrolling past twenty cards.
- **By photo of the whiteboard** — the club writes its requests on the physical
  "whiteboard of wishes", and one snap turns the whole board into matched
  entries. The board keeps circulating during the night, so it gets snapped
  again each time it has filled up.

Either way, a song already on the night's lists is never added twice — which is
what makes re-snapping a board you've already scanned safe.

The set plays from the top: the first tune wears a **NEXT** badge, and marking
it played collapses it into a one-line count, so the running order consumes
itself as the evening goes. Requests are promoted into Up next — or binned — by
a tap or a thumb-swipe, and nothing is destroyed: played and binned rows stay
recoverable. The night can be copied as text or downloaded as JSON at any point.

## The scan

Snapping the board:

1. downscales the photo in the browser, so pub Wi-Fi only carries what the model
   actually sees;
2. reads each handwritten row (song title + page number) with a multimodal
   vision model (Gemini);
3. matches every row against the songbook catalogue (title fuzzy-matching +
   page-number cross-checking with
   [RapidFuzz](https://github.com/rapidfuzz/RapidFuzz));
4. drops confident matches straight into Requests, and sends only the rows it
   was unsure about to a review sheet, where a misread can be corrected against
   the photo before it lands.

The catalogue is derived from the public manifests published by
[songbook-generator](https://github.com/UkuleleTuesday/songbook-generator) at
`https://storage.googleapis.com/ukulele-tuesday-songbooks/<edition>/` — no
credentials needed.

## Sessions

The app opens on the club's **session history**: past nights, tagged with
whoever started them, plus a button to start tonight's. A session is shared and
live — everyone in the room edits the same lists and can see who else is
connected — and stays in the history afterwards.

Nights name themselves. A session is labelled from its date (*Tonight*,
*Tomorrow*, *Yesterday*, *Thursday*, *Next Friday*, *28 July*, *Thursday 16
December 2025*), rendered in each viewer's locale at view time, so the label
stays true as it ages. There are no custom titles: the date IS the identity.
Starting a session asks for its date (prefilled with today), so a missed night
can be backfilled and next Tuesday's set prepped in advance.

Visibility is **Shared** or **Unlisted**. Unlisted keeps a night out of the
club's list, but the share link opens it, so this is discoverability, not
privacy. There is no private mode: every session is readable by anyone holding
its id.

## Requests from the room

A session has two links. The **share link** opens the full app. The **request
link** opens a view meant for the room's own phones: they find tunes in the
songbook, add them with their name on them, and follow the running order — Up
next and the played count. The songbook opens as the whole book in page order
(search by title, artist or page), each tune tagged if it's played, queued or
requested tonight; tapping one already asked for gives it a thumbs up instead.
That thumbs up is the only mark a room phone leaves on the set: any unplayed
tune on either list can be wanted, but nothing is reordered, ticked off or
binned from there. A phone that arrived through the request link stays in that
view across reloads. Each request is confirmed before it lands, and one phone
waits a minute between requests, so a single keen person can't fill the night.

The share panel switches that link between **Taking requests** and **View
only**. View only shows the pool but accepts no tunes, and points people at the
whiteboard. Like Unlisted, this is a view rather than a permission: anyone
holding the plain share link has the full app either way.

## Mobile-first

The whole point is a phone in one hand at the club — snapping the board,
promoting the next tune, ticking off what's been played, all while holding a
ukulele in the other. Design and test UI changes for a phone (touch targets,
tap-to-dismiss, safe-area insets, small viewport) first; desktop is the
incidental case.

## Quickstart

Requires [uv](https://docs.astral.sh/uv/) and Python 3.12+, plus Node for the
UI (CI uses 22).

Gemini runs through Vertex AI over Application Default Credentials, so no API
key is needed: authenticate once with `gcloud auth application-default login`.
It uses the shared `songbook-generator` GCP project, like `tabby` and
songbook-generator.

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
uv run setlister serve                                          # API on :8080
cd ui && npm ci && npm run dev                                  # UI on :3000
npx --yes firebase-tools emulators:start --only firestore,auth  # Firestore :8081, Auth :9099
```

On localhost the UI talks to the emulators, never production Firebase. The
Firestore emulator is required: everything happens inside a session. Auth is
only for the organiser link.

## Development

Two pieces: `utrequests/` is the Python API, `ui/` the web app.

```bash
uv run pytest              # offline test suite (no API key needed)
uv run pytest -m live      # live smoke test (needs ADC + network)
uv run ruff check .
uv run ruff format .
```

The `ui/` app is [Svelte 5](https://svelte.dev/) and strict TypeScript, bundled
by [Vite](https://vite.dev/) and managed with npm. `index.html` is a bare page
and `App.svelte` the whole of it, one component per screen, sheet and panel.
Components read state directly from `*.svelte.ts` modules (`night`, `session`,
`catalogue`, `settings`, `view`, `history`, `overlays` / `notices` for what's
open and said, `lists` for what the lists derive); each sheet and popover is
mounted only while open. Changes go through action modules by concern (`adds`,
`rows`, `routing`, `sharing`, `live` for sync and presence, `save`, `player`
for the player's name, `organiser` for the organiser link), and `main.ts` only
boots. Logic that doesn't need a page (sync, presence, session index, dedupe,
the request window, downscaling) lives in plain, unit-tested `.ts` modules;
shared shapes are in `ui/types.ts`. `firebase`, `lucide` and `svelte` are the
only runtime dependencies.

```bash
cd ui
npm test              # pure unit tests (no emulator)
npm run test:emulator # everything, incl. the firestore.rules suite
npm run test:e2e      # mobile Playwright smoke suite, against the emulator
npm run lint          # ESLint
npm run typecheck     # svelte-check (the app) and tsc (tests, e2e)
npm run format        # Prettier (format:check is the CI gate)
npm run build         # production bundle into ui/dist
npm run preview       # serve that build locally
```

`ui/tests/rules.test.ts` runs against the Firestore emulator and covers
[`firestore.rules`](./firestore.rules), the app's entire access-control layer
(the browser writes Firestore directly). `npm test` alone fails it with a
connection error, deliberately: a skipped security suite must not look like a
passing one. CI runs `test:emulator`.

`npm run test:e2e` drives the production build (`vite preview`) on a 390px
touch screen against the Firestore and Auth emulators: the session history, a
night run end to end, the lists' gestures, the panels and sheets, the room's
request link on a second phone, the organiser link, and the photo scan. The
Python API is stubbed with `context.route` (`ui/e2e/api.ts`), so no Gemini call
is made, and any console error fails the test. Tests select by the app's ids
and accessible names, so markup changes must keep those. If Playwright has no
browser yet, run `npx playwright install chromium` once.

Check new flows by hand too: drive the real page in a phone-sized,
touch-enabled browser (the e2e project's settings in `ui/playwright.config.ts`)
and confirm there are no console errors.

User-visible changes need an entry in `ui/whats-new.json`, the in-app
changelog. See [AGENTS.md](./AGENTS.md) for that and the rest of the
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
the function runs with `--max-instances 1` to bound worst-case Vertex AI spend.
A club night sends a handful of photos, so one instance is plenty.

### Sessions in Firestore

Every setlist is a realtime collaborative session stored as
`sessions/{sessionId}`, alongside a tiny `sessionIndex/{sessionId}` listing row
(who started it, when its night is) that the home screen queries to show the
club's history, and short-lived `presence` heartbeats for "who's here". The
browser reads and writes all of it directly via the Firebase Web SDK, so
[`firestore.rules`](./firestore.rules) is the entire access-control layer —
deliberately unauthenticated, defended by a closed schema and deny-by-default,
and covered by `ui/tests/rules.test.ts`.

**Sessions are kept forever:** the app opens on past nights, so nothing expires
them, and no client can delete a session document.

Accepted risks, made larger by documents never expiring: anyone with the app
URL can read the session list, open any session, edit it, or un-list it. The
real fix is authentication; until then the bounds are the closed schema, the
bounded string fields, the 60-day cap on future-dated sessions, the 60-entry
list query, and the budget alert below, which should cover Firestore as well as
Vertex AI.

### Organiser access

Organisers register a phone by tapping the organiser link,
`https://ukuleletuesday.github.io/setlister/#organise=<key>`, pinned in their
chat (#150). The phone signs in anonymously and writes `organisers/{uid}`; the
rules accept it only if the key matches `clubConfig/organiserKey`. Nothing is
locked yet (#152).

Pin it with: "Tap this on the phone you run nights from. If you use Setlister
from your home screen, paste it in Settings → Organisers instead." (A tapped
link opens in the browser, and an iPhone home-screen app has its own storage.)

- **Add someone:** send the link.
- **Check a phone:** Settings → Organisers. Safari can drop the sign-in after
  7 days unused; re-tap the link.
- **Remove someone, or a leaked link:** change the key and re-pin. Deleting a
  row removes no one: the old link still works until the key changes.
- **Who's registered:** `organisers` in the Firebase console. `createdAt` is
  the latest registration.
- A missing `clubConfig/organiserKey` shows as "This link has been retired".

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
# ui/firebase-config.ts — they are public client identifiers, not secrets.
firebase apps:create web setlister --project=songbook-generator
firebase apps:sdkconfig web --project=songbook-generator

# Then re-run ./deploy-gcs.sh so the deployer SA gains the Firebase rules roles.
```

The web `apiKey` is safe to commit
([Firebase](https://firebase.google.com/docs/projects/api-keys)) once
restricted. In GCP Credentials, on "Browser key (auto created by Firebase)",
allow only the referrer `https://ukuleletuesday.github.io/*` and the Identity
Toolkit, Token Service, Cloud Firestore and Cloud Datastore APIs.

For [organiser access](#organiser-access):

1. Firebase Authentication: enable **Anonymous**; check
   `ukuleletuesday.github.io` is an authorised domain.
2. Firestore: create `clubConfig/organiserKey` with string `key` =
   `openssl rand -hex 16`.
3. Pin the link in the organisers' chat.

Don't enable automatic clean-up of anonymous accounts: it deletes organisers.

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
