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
- The `upNext` and `requests` lists are the durable objects (persisted together
  to `localStorage`); the review sheet is transient state from the latest scan.
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

# Build the UI for production:
cd ui && npm run build                  # output in ui/dist
cd ui && npm run preview                # preview the built site locally
```

## Before you push

- Run `ruff check` / `ruff format` and the offline test suite for Python
  changes.
- For UI changes, exercise the actual flow in a mobile-sized browser and
  confirm no console errors.
