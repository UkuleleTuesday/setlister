# AGENTS.md

> **Agents: don't edit this file unless a human asked you to in that
> conversation.** Suggest changes in your reply instead.
>
> **Docs and comments: optimize for clarity, readability and token count.** No
> preamble, no filler prose. All markdown (this file included) and code comments.

What you must and mustn't do in this repo. `README.md` has what the project is,
how to run it, and every command; this file doesn't repeat them.

## UX and UI

The UI is mobile-first.

- **Design system.** Style with the tokens and primitives in `ui/DESIGN.md`. No
  raw colours, sizes or shadows outside `:root`.
- **Touch.** Tap targets ≥ 44px, no hover-only affordances. Escape is a desktop
  bonus, never the only way out.
- **Forgiving dismissal.** Overlays close on tapping anywhere obvious, not just a
  thin backdrop margin. Hint when the gesture isn't discoverable.
- **Small viewports and notches.** Use `max-height`/`max-width`, and
  `env(safe-area-inset-*)` for anything pinned to an edge.
- **Verify on a phone-sized touch viewport**, never just a desktop window (README
  > Development has the Playwright setup).

## Working in `ui/`

- Keep runtime deps minimal and justified.
- **User-visible changes are captured via the "What's New" feature, in the same PR.** The in-app
  changelog.
  - One short sentence per item, for players at the club, not commit readers.
    Skip refactors, fixes to unreleased work, and internal tooling.
  - Dates are ISO `YYYY-MM-DD`; the label renders via `Intl` at view time. Never
    store a formatted date.
  - **Re-edit the day's entry, don't append.** One entry per date, read as a
    single release note: merge items about the same feature, and drop or rewrite
    anything a later same-day change made obsolete — nobody outside the repo saw
    the interim states. Lead with the biggest change; three items a day, max.
- **No em dashes in copy.** Whimsical is fine as long as it stays clear.
- **Never build anything that destroys other people's work.**

## Data storage and handling

`firestore.rules` only accepts session doc keys it lists (`hasOnly`): one
unknown key rejects the whole write. So a new field needs its rules entry in
the same change, and PR previews run new code against production's rules,
where a field written at session creation breaks "New session". Run
`npm run test:emulator` after touching the rules.

## Code

- **No comment beats a duplicate or verbose one.** Make the code say what it
  does, and pin behaviour with explicit tests. Comment only the why: reasons,
  hazards, non-obvious mechanisms.

## Pull requests

- **Descriptions are short:** what changed, why, and anything a reviewer must
  act on. No test counts, file lists or restating the diff.
- **UX changes include before and after screenshots** in the description.

## Before you push

- Check what tests CI is running, and make a best effort to run the part of the test suite
  that your change likely affects
- Python changes: `ruff check` / `ruff format` and the offline test suite.
- UI changes: `npm run lint` and `npm run format:check` in `ui/`, then
  `npm run test:emulator` and exercise the flow in a mobile-sized browser with
  no console errors. If user-facing, confirm "What's New" has an entry.