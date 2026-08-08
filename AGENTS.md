# AGENTS.md

> **Agents: don't edit this file unless a human asked you to in that
> conversation.** Suggest changes in your reply instead.
>
> **Docs and comments: optimize for clarity, readability and token count.** No
> preamble, no filler prose. All markdown (this file included) and code comments.

What you must and mustn't do in this repo. `README.md` has what the project is,
how to run it, and every command; this file doesn't repeat them.

Layout: `utrequests/` is the Python API, `ui/` the web app.

## The UI is mobile-first — a hard constraint

- **Touch.** Tap targets ≥ 44px, no hover-only affordances. Escape is a desktop
  bonus, never the only way out.
- **Forgiving dismissal.** Overlays close on tapping anywhere obvious, not just a
  thin backdrop margin. Hint when the gesture isn't discoverable.
- **Small viewports and notches.** Use `max-height`/`max-width`, and
  `env(safe-area-inset-*)` for anything pinned to an edge.
- **Verify on a phone-sized touch viewport**, never just a desktop window (README
  > Development has the Playwright setup).

## Working in `ui/`

- Keep runtime deps minimal and justified; adding one is a decision, not a
  detail.
- **Everything happens inside a session.** Two views on one page, routed off
  `?session=<id>`. No local-only mode, and the URL is the only source of truth
  for which view shows, which is what makes the phone's Back button work.
- `upNext` and `requests` are the durable objects (`localStorage` + synced to
  `sessions/{id}`); the review sheet is transient scan state.
  `createdBy`/`listed`/`requestsOpen` are metadata sitting *outside* the synced
  list state — see the `ui/sync.js` header.
- **Never reintroduce session titles or stored formatted dates.** Stored formats
  once mixed US and UK strings in one list and froze "today" into labels that
  outlived the day; a free-text name field read as mandatory and got filled with
  retyped dates. (Legacy `name` fields are tolerated and ignored.)
- **User-visible changes go in `ui/whats-new.json`, in the same PR.** The in-app
  changelog. Shape enforced by `ui/tests/whats-new.test.js`.
  - One short sentence per item, for players at the club, not commit readers.
    Skip refactors, fixes to unreleased work, and internal tooling.
  - Dates are ISO `YYYY-MM-DD`; the label renders via `Intl` at view time. Never
    store a formatted date.
  - **Re-edit the day's entry, don't append.** One entry per date, read as a
    single release note: merge items about the same feature, and drop or rewrite
    anything a later same-day change made obsolete — nobody outside the repo saw
    the interim states. Lead with the biggest change; three items a day, max.
- **No em dashes in copy.** Whimsical is fine as long as it stays clear.
- **Never build anything that destroys other people's work.** "Start over" was
  removed for wiping the night for everyone in the room. Row-level removal is
  fine (recoverable from the bin); wholesale clearing is not.
- **Adding a Firestore doc field means adding it to the rules' `hasOnly` list in
  the same change**, or the write is silently denied. Run `npm run test:emulator`
  after touching `firestore.rules`.
- **Don't write a new field on the create path in the release that adds it.**
  `hasOnly` rejects the whole write over one unknown key, and cached bundles run
  ahead of deployed rules, so it breaks "New session". Default to absent-means-X
  (`requestsOpen` in `ui/sync.js`).
- Match the surrounding style: small focused functions, comments explaining *why*
  (especially the mobile/touch reasoning), not *what*.

## Before you push

- Python changes: `ruff check` / `ruff format` and the offline test suite.
- UI changes: `npm run test:emulator` in `ui/`, then exercise the flow in a
  mobile-sized browser with no console errors. If user-facing, confirm
  `ui/whats-new.json` has an entry.
