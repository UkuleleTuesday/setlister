# Setlister

**Live app:** https://setlister.ukuleletuesday.ie/

The shared setlist for a Ukulele Tuesday night, run from phones. Two live lists:
**Requests** (what people want) and **Up next** (the running order). Rows are
matched to the current UT songbook, so each carries its page.

- **Add by name** from the songbook (search by title, artist or page), with an
  optional comment.
- **Snap the whiteboard of wishes:** the photo is downscaled in the browser,
  Gemini reads the handwritten rows, and
  [RapidFuzz](https://github.com/rapidfuzz/RapidFuzz) matches them to the
  catalogue. Confident rows land in Requests; unsure ones go to a review sheet.
- A song already on the night is never added twice, so re-snapping is safe.
- **Run the night:** promote or bin with a tap or swipe; the top tune is
  **NEXT**. Played and binned rows stay recoverable. Export as text or JSON.

The catalogue comes from the public manifests of
[songbook-generator](https://github.com/UkuleleTuesday/songbook-generator) at
`https://storage.googleapis.com/ukulele-tuesday-songbooks/<edition>/`.

## Sessions and the room

The app opens on the club's session history. A session is live, shared, named
by its date (rendered in the viewer's locale) and kept forever. Unlisted hides
it from the history; its link still opens it.

Each session has one link. Organisers get the full app; everyone else gets the
request view: add a tune (confirmed, one a minute per phone), thumbs up any
unplayed tune, and follow Up next. The share panel switches the link between
**Taking requests** and **View only**; the rules don't enforce that switch. To
see the room's view, open the link in a private tab.

## Organisers

A phone becomes an organiser's by tapping
`https://setlister.ukuleletuesday.ie/#organise=<key>`, pinned in the
organisers' chat (#150). Pin it with: "Tap this on the phone you run nights
from. If you use Setlister from your home screen, paste it in Settings →
Organisers instead."

- **Add someone:** send the link.
- **Check a phone:** Settings → Organisers. Safari can drop the sign-in after 7
  days unused; re-tap the link.
- **Remove someone, or a leaked link:** change the key and re-pin. Deleting an
  `organisers` row alone removes no one. A phone on the old key drops to the
  request view on its next write.
- A missing `clubConfig/organiserKey` shows as "This link has been retired".

## Quickstart

Needs [uv](https://docs.astral.sh/uv/), Python 3.12+ and Node (CI uses 22).
Gemini runs on Vertex AI in the shared `songbook-generator` GCP project, over
Application Default Credentials.

```bash
uv sync
gcloud auth application-default login           # one-time

uv run setlister editions                       # list songbook editions
uv run setlister catalogue --edition current    # dump song -> page catalogue
uv run setlister parse photo.jpg [--json]       # parse a whiteboard photo
```

The web app is three processes. On localhost the UI only talks to the
emulators; Auth is only needed for the organiser link.

```bash
uv run setlister serve                                          # API on :8080
cd ui && npm ci && npm run dev                                  # UI on :3000
npx --yes firebase-tools emulators:start --only firestore,auth  # Firestore :8081, Auth :9099
```

## Development

`utrequests/` is the Python API; `ui/` the web app.

```bash
uv run pytest              # offline suite
uv run pytest -m live      # live smoke test (ADC + network)
uv run ruff check .
uv run ruff format .
```

`ui/` is [Svelte 5](https://svelte.dev/) and strict TypeScript, built by
[Vite](https://vite.dev/). `App.svelte` is the whole page. State lives in
`*.svelte.ts` modules, changes go through action modules (`adds`, `rows`,
`routing`, `sharing`, `live`, `save`, `player`, `organiser`), and `main.ts`
only boots. Page-free logic is in plain, unit-tested `.ts` modules; shared
shapes in `ui/types.ts`. Runtime deps: `firebase`, `lucide`, `svelte`.

```bash
cd ui
npm test              # unit tests (no emulator)
npm run test:emulator # everything, incl. the firestore.rules suite (CI runs this)
npm run test:e2e      # mobile Playwright suite against the emulators
npm run lint
npm run typecheck     # svelte-check (app) and tsc (tests, e2e)
npm run format        # Prettier; format:check is the CI gate
npm run build         # into ui/dist
npm run preview       # serve that build
```

- `ui/tests/rules.test.ts` covers [`firestore.rules`](./firestore.rules). Plain
  `npm test` fails it on purpose: a skipped security suite must not pass.
- `test:e2e` drives the production build on a 390px touch screen, with the
  Python API stubbed (`ui/e2e/api.ts`). Any console error fails a test. Tests
  select by ids and accessible names. First run:
  `npx playwright install chromium`.
- Check new flows by hand on a phone-sized touch viewport
  (`ui/playwright.config.ts`), with no console errors.
- Styling goes through the foundations, components and patterns in
  [`ui/DESIGN.md`](./ui/DESIGN.md).
- User-visible changes need a `ui/whats-new.json` entry; see
  [AGENTS.md](./AGENTS.md).

## Deployment

Every merge to `main` deploys (`.github/workflows/ci.yaml`):

- **API:** gen2 Cloud Function `setlister-api` in `songbook-generator`
  (`europe-west1`), via `gcloud functions deploy --source utrequests`, with
  `requirements.txt` exported from `uv.lock`. Vertex AI stays in
  `us-central1`. Uploads are capped at 20 MB, `/api/parse` at 8 requests a
  minute per IP, and `--max-instances 1` bounds spend.
- **UI:** `ui/dist` to the `gh-pages` branch, served by Pages at the custom
  domain in `ui/public/CNAME`. Allowed API origins: `CORS_ALLOWED_ORIGINS` in
  `.env.deploy`.
- **Firestore rules:** the `deploy-rules` job.

Each PR gets a preview at
`https://setlister.ukuleletuesday.ie/pr-preview/pr-<N>/`
([`pr-preview-action`](https://github.com/rossjrw/pr-preview-action)), removed
when the PR closes. Production deploys skip `pr-preview/`.

### Firestore and access

The browser reads and writes Firestore directly, so
[`firestore.rules`](./firestore.rules) is the whole access-control layer:

- `sessions/{id}`: anyone reads; organisers write; the room may only add one
  request or toggle a vote. Never deleted.
- `sessionIndex/{id}`: the home screen's listing row. Organisers write.
- `sessions/{id}/presence/{clientId}`: "who's here" heartbeats.
- `organisers/{uid}`: written by a signed-in phone holding the current key from
  `clubConfig/organiserKey`, which no client can read.

Accepted risks: anyone can read every session, add requests and vote (votes
are on trust). PR previews share production's origin, so their code could act
as a signed-in organiser; only people with push access to this repo can ship
that. Keep a GCP budget alert on the project.

### One-time setup

Custom domain (DNS is at Blacknight):

1. CNAME `setlister` → `ukuleletuesday.github.io.`
2. Org Settings → Pages → verify `ukuleletuesday.ie` (a TXT record), so no
   other repo can claim its subdomains.
3. Repo Settings → Pages: custom domain `setlister.ukuleletuesday.ie`, then
   **Enforce HTTPS** once the certificate is issued.

The old `ukuleletuesday.github.io/setlister/` URLs redirect. Sign-ins are per
origin, so organisers re-tap the link after a domain change.

CI deploys through Workload Identity Federation: no keys or GitHub secrets. A
project admin runs [`deploy-gcs.sh`](./deploy-gcs.sh) once (config in
`.env.deploy`, safe to re-run):

```bash
./deploy-gcs.sh
```

Firestore, once:

```bash
firebase projects:addfirebase songbook-generator
gcloud services enable firebaserules.googleapis.com --project=songbook-generator
gcloud firestore databases create --location=europe-west1 \
  --type=firestore-native --project=songbook-generator

# Paste the printed config into ui/firebase-config.ts.
firebase apps:create web setlister --project=songbook-generator
firebase apps:sdkconfig web --project=songbook-generator

# Then re-run ./deploy-gcs.sh for the Firebase rules roles.
```

The web `apiKey` is safe to commit
([Firebase](https://firebase.google.com/docs/projects/api-keys)) once
restricted: in GCP Credentials, on "Browser key (auto created by Firebase)",
allow only the referrer `https://setlister.ukuleletuesday.ie/*` and the Identity
Toolkit, Token Service, Cloud Firestore and Cloud Datastore APIs.

Organiser access:

1. Firebase Authentication: enable **Anonymous**; check
   `setlister.ukuleletuesday.ie` is an authorised domain. Leave automatic
   clean-up of anonymous accounts off: it deletes organisers.
2. Firestore: create `clubConfig/organiserKey` with string `key` =
   `openssl rand -hex 16`.
3. Pin the link in the organisers' chat.

A project provisioned before session history may still have a TTL policy on
`sessions.expiresAt`, which deletes old nights. Turn it off:

```bash
gcloud firestore fields ttls list --project=songbook-generator
gcloud firestore fields ttls update expiresAt \
  --collection-group=sessions --disable-ttl --project=songbook-generator
```
