# AGENTS.md

> **Agents: don't edit this file unless a human asked you to in that
> conversation.** Suggest changes in your reply instead.
>
> **Docs and comments: optimize for clarity, readability and token count.** No
> preamble, no filler prose. All markdown (this file included) and code comments.

Guidance for agents and contributors. See `README.md` for the project overview,
quickstart, and deployment.

## What this is

Setlister turns a photo of the Ukulele Tuesday request whiteboard into a
reviewable, songbook-matched setlist.

- **`utrequests/`** — Python API (Gemini vision parse + fuzzy catalogue
  matching), deployed as a Cloud Function, run locally via `setlister serve`.
- **`ui/`** — Vite-bundled web app (`index.html` + `app.js` + `style.css`),
  npm-managed, published to GitHub Pages from `ui/dist`.

## The UI is mobile-first — a hard constraint

Used **on a phone, at the club**: snap the board, review, export. Every UI change
is a mobile change first; desktop is incidental.

- **Touch.** Tap targets ≥ 44px, no hover-only affordances. Escape is a desktop
  bonus, never the only way out.
- **Forgiving dismissal.** Overlays close on tapping anywhere obvious, not just a
  thin backdrop margin. Hint when the gesture isn't discoverable.
- **Small viewports and notches.** Use `max-height`/`max-width`, and
  `env(safe-area-inset-*)` for anything pinned to an edge.
- **Verify on a phone-sized touch viewport**, not a desktop window: Playwright
  `{ isMobile: true, hasTouch: true }` at ~390px, `.tap()` not `.click()`.

## Working in `ui/`

- Run `npm ci` in `ui/` first. Keep runtime deps minimal and justified
  (`firebase` is the precedent).
- **Everything happens inside a session.** Two views on one page, routed off
  `?session=<id>`: home (the club's session history + "New session") and a
  session's working state. No local-only mode — creating a session writes to
  Firestore, and the URL is the only source of truth for which view shows, which
  is what makes the phone's Back button work.
- `upNext` and `requests` are the durable objects (`localStorage` + synced to
  `sessions/{id}`); the review sheet is transient scan state.
  `createdBy`/`listed`/`requestsOpen` are metadata sitting *outside* the synced
  list state — see the `ui/sync.js` header.
- **Sessions have no names; the date is the identity.** Rendered from `createdAt`
  by `sessionDateLabel()` (`ui/session-index.js`) in each viewer's locale. Never
  reintroduce stored titles or formatted dates: stored formats once mixed US and
  UK strings in one list and froze "today" into labels that outlived the day, and
  a free-text name field read as mandatory and got filled with retyped dates.
  (Legacy `name` fields are tolerated and ignored.)
- **User-visible changes go in `ui/whats-new.json`, in the same PR.** The app's
  changelog: the home banner announces the latest entry, the footer link opens
  the history. Shape enforced by `ui/tests/whats-new.test.js`.
  - One short sentence per item, for players at the club, not commit readers.
    Skip refactors, fixes to unreleased work, and internal tooling.
  - Dates are ISO `YYYY-MM-DD`; the label renders via `Intl` at view time. Never
    store a formatted date.
  - **Re-edit the day's entry, don't append.** One entry per date, read as a
    single release note: merge items about the same feature, and drop or rewrite
    anything a later same-day change made obsolete — nobody outside the repo saw
    the interim states. Lead with the biggest change; three items a day, max.
- **No em dashes in copy.** Whimsical is fine as long as it stays clear.
- **Nothing in the session view may destroy other people's work.** "Start over"
  was removed for wiping the night for everyone in the room. Row-level removal is
  fine (recoverable from the bin); wholesale clearing is not.
- `firestore.rules` is the entire access-control layer and has an executable
  suite: run `npm run test:emulator` in `ui/` after touching it. Adding a doc
  field means adding it to `hasOnly` in the same change, or the write is silently
  denied.
- **Don't write a new field on the create path in the release that adds it.**
  `hasOnly` rejects the whole write over one unknown key, and cached bundles run
  ahead of deployed rules, so it breaks "New session". Default to absent-means-X
  (`requestsOpen` in `ui/sync.js`).
- Match the surrounding style: small focused functions, comments explaining *why*
  (especially the mobile/touch reasoning), not *what*.

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

- Python changes: `ruff check` / `ruff format` and the offline test suite.
- UI changes: `npm run test:emulator` in `ui/`, then exercise the flow in a
  mobile-sized browser with no console errors. If user-facing, confirm
  `ui/whats-new.json` has an entry.
