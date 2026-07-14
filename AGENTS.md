# AGENTS.md

Guidance for AI agents and contributors working in this repo. See `README.md`
for the full project overview, quickstart, and deployment details.

## What this is

Setlister turns a photo of the Ukulele Tuesday request whiteboard into a
reviewable, songbook-matched setlist. Two pieces:

- **`utrequests/`** — Python API (vision parse via Gemini + fuzzy catalogue
  matching), served as a Cloud Function and locally via `setlister serve`.
- **`ui/`** — a dependency-free static web app (`index.html` + `app.js` +
  `style.css`), published to GitHub Pages. No build step, no framework.

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

- Plain ES modules and DOM APIs only — **no dependencies, no bundler.** Keep it
  that way unless there's a strong reason not to.
- The in-progress setlist is the durable object (persisted to `localStorage`);
  the review sheet is transient state from the latest scan.
- Match the surrounding style: small focused functions, comments that explain
  *why* (especially the mobile/touch reasoning), not *what*.

## Commands

```bash
uv sync                    # install Python deps
uv run pytest              # offline test suite (no API key needed)
uv run pytest -m live      # live smoke test (needs ADC + network)
uv run ruff check .        # lint
uv run ruff format .       # format

# Run the app locally (API + static UI served separately):
uv run setlister serve                  # API on http://127.0.0.1:8080
python3 -m http.server 3000 -d ui       # UI on http://localhost:3000
```

There is no automated JS test suite; verify UI changes by driving the real page
in a browser (see the mobile-first note above).

## Before you push

- Run `ruff check` / `ruff format` and the offline test suite for Python
  changes.
- For UI changes, exercise the actual flow in a mobile-sized browser and
  confirm no console errors.
