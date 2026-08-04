# AGENTS.md

Guidance for AI agents and contributors working in this repo. See `README.md`
for the full project overview, quickstart, and deployment details.

## What this is

Setlister turns a photo of the Ukulele Tuesday request whiteboard into a
reviewable, songbook-matched setlist. Two pieces:

- **`utrequests/`** — Python API (vision parse via Gemini + fuzzy catalogue
  matching), served as a Cloud Function and locally via `setlister serve`.
- **`ui/`** — a Vite-bundled web app (`index.html` + `app.js` +
  `style.css`), npm-managed, published to GitHub Pages via `ui/dist`.

## The UI is mobile-first — treat this as a hard constraint

The app exists to be used **on a phone, at the club**: snap the board, review,
export. Every UI change is a mobile change first; desktop is incidental.

- **Design for touch.** Tap targets ≥ 44px, no hover-only affordances, no
  reliance on keyboard-only gestures (there is no Escape key on a phone —
  Escape may exist as a desktop bonus, never as the only way out).
- **Dismissal should be forgiving.** Overlays/lightboxes close on tapping
  anywhere obvious, not just a thin backdrop margin. Give a visible hint when
  the gesture isn't discoverable.
- **Respect the small viewport and notches.** Use `max-height`/`max-width`,
  and `env(safe-area-inset-*)` for anything pinned to a screen edge.
- **Verify on a phone-sized, touch-enabled viewport** — not just a desktop
  window. Playwright with `{ isMobile: true, hasTouch: true }` and a ~390px
  viewport is the baseline; use `.tap()`, not `.click()`.

## Working in `ui/`

- Vite-bundled, npm-managed (`ui/package.json`). Keep runtime dependencies
  minimal and justified — `firebase` is the established precedent. Run
  `npm ci` in `ui/` before developing.
- **Everything happens inside a session.** The app has two views on one page,
  routed off `?session=<id>` in the URL: the home screen (the club's session
  history + "New session") and a session's working state. There is no
  local-only mode — creating a session writes to Firestore, and the URL is the
  only source of truth for which view is showing, which is what makes the
  phone's Back button work.
- The `upNext` and `requests` lists are the durable objects (persisted to
  `localStorage` and synced to `sessions/{id}`); the review sheet is transient
  state from the latest scan. A session's `name`/`createdBy`/`listed` are
  metadata that deliberately sit *outside* the synced list state — see the
  header comment in `ui/sync.js`.
- **Nothing in the session view may destroy other people's work.** "Start over"
  was removed for exactly this reason: in a shared session it wiped the night
  for everyone in the room. Row-level removal is fine (it's recoverable from the
  bin); wholesale clearing is not.
- `firestore.rules` is the entire access-control layer and has an executable
  suite: run `npm run test:emulator` in `ui/` after touching it. Adding a field
  to a Firestore doc means editing the rules' `hasOnly` list in the same change,
  or the write is silently denied.
- Match the surrounding style: small focused functions, comments that explain
  *why* (especially the mobile/touch reasoning), not *what*.

## Commands

```bash
uv sync                    # install Python deps
uv run pytest              # offline test suite (no API key needed)
uv run pytest -m live      # live smoke test (needs ADC + network)
uv run ruff check .        # lint
uv run ruff format .       # format

# Run the app locally (API + UI served separately):
uv run setlister serve                  # API on http://127.0.0.1:8080
cd ui && npm ci && npm run dev          # UI on http://localhost:3000 (Vite dev server)
npx --yes firebase-tools emulators:start --only firestore   # Firestore on :8081

# UI tests:
cd ui && npm test                       # pure unit tests
cd ui && npm run test:emulator          # + the firestore.rules suite

# Build the UI for production:
cd ui && npm run build                  # output in ui/dist
cd ui && npm run preview                # preview the built site locally
```

## Before you push

- Run `ruff check` / `ruff format` and the offline test suite for Python
  changes.
- For UI changes, run `npm run test:emulator` in `ui/`, then exercise the actual
  flow in a mobile-sized browser and confirm no console errors.
