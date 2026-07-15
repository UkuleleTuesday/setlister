# Setlister UX audit — July 2026

An expert UX review of the live app at <https://ukuleletuesday.github.io/setlister/>,
audited against its own design brief (AGENTS.md: mobile-first, touch targets ≥ 44px,
forgiving dismissal, phone-at-the-club context).

**Method.** Code review of `ui/` + `utrequests/`, then live verification with
Playwright driving the production site in an iPhone 13 profile
(`isMobile: true, hasTouch: true`, 390×844, `.tap()`), plus 320px and desktop
passes. Findings marked **[verified live]** were reproduced against production;
**[code]** were confirmed in source. Exactly **one** Gemini-consuming request
was made (a single `/api/parse` of a synthetic whiteboard photo) — well inside
the 30-call budget; every other probe used non-Gemini endpoints or aborted routes.

Severity: 🔴 high (blocks/derails the core flow), 🟠 medium (regular friction),
🟡 low (polish).

---

## 🔴 High

### 1. Catalogue search fails silently — three ways
**[verified live]** The manual "Add a tune by name…" box is dead until the
catalogue loads, and the app never says so:

- **Cold start:** `GET /api/editions` took **5.7s** on a cold Cloud Function.
  `init()` runs `resolveSession()` → `await loadEditions()` → `loadCatalogue()`
  *sequentially*, so search can be unusable for 6+ seconds after open.
- **Typed too early:** text typed before the catalogue arrives never produces
  results, even after it arrives — the menu only recomputes on the next `input`
  event. Verified: typed "angels" at load; no menu appeared after the catalogue
  loaded until retyping.
- **API down:** with the API unreachable there is no banner, no retry, nothing —
  typing "jolene" just shows no results.

In all three cases the UI is indistinguishable from *"this song isn't in the
songbook"* — the worst possible misreading at a request night.

**Fix:** show a state inside the dropdown ("Loading songbook…", "Couldn't load
the songbook — retry", "No matches for 'x'"); re-run the search when the
catalogue arrives; fire `loadEditions()`/`loadCatalogue()` in parallel with
session resolution; cache the last catalogue in `localStorage` (it's 18KB) so a
returning phone works instantly and offline-ish.

### 2. Touch targets are far below the app's own 44px hard constraint
**[verified live]** Measured on production (CSS px):

| Control | Size | Notes |
|---|---|---|
| Move up ↑ / down ↓ | **15×26** | highest-frequency reorder control |
| Warn ⚠️ (open photo) | **18×14** | the key "check this match" affordance |
| Drag handle ⠿ | 19×23 | `touch-action:none`, so a miss scrolls nothing |
| Played ✓ | 20×27 | |
| Bin 🗑 | 23×26 | adjacent to ✓ — mis-taps toggle the wrong state |
| Promote ⬆️ / demote ⬇️ | 27×27 | promote is *the* core action of the app |
| Settings gear | 38×38 | already flagged "under-spec" in style.css |
| "Start over" link | 59×15 | destructive action, tiny target |

Only the share button (44px pseudo-element) and camera button (49px tall) meet
spec. Swipe gestures mitigate ✓/🗑 but nothing mitigates promote/reorder — the
buttons used most, one-thumbed, in a dim pub.

**Fix:** give `.row-tools button` a 44×44 hit area (padding, or transparent
`::before` like `.share-toggle`); consider swipe-to-promote in the Requests
list; make "Start over" a proper button.

### 3. Raw technical errors are shown to end users
**[verified live]**
- Bad/corrupt upload → the server's `{"detail": ...}` leaks a Python repr:
  `Could not read image: cannot identify image file <_io.BytesIO object at 0x7f8ab0303ce0>`.
- API unreachable during a scan → bare `Failed to fetch`.

Neither says what to do next (retake the photo? check signal? try later?).

**Fix:** map error classes to human copy client-side ("Couldn't read that photo —
try taking it again", "No connection — check your signal and retry") and keep a
"Try again" affordance next to the message. Server-side, return `str(e)` only
for messages written for users; the `ImageError` chain currently forwards PIL
internals.

### 4. Full-resolution photos are uploaded, then downscaled server-side
**[code]** The client posts the camera file as-is (server cap 20MB); the server
immediately resizes to a 1600px long edge before calling Gemini. A modern phone
photo is 3–8MB, so on venue Wi-Fi/4G the user waits through a multi-megabyte
upload that contributes nothing. The "Max image edge (px)" setting misleads: it
changes server-side processing, not the upload. There is also **no fetch
timeout and no cancel** — a hung request leaves "Reading the board…" sweeping
forever, and the only escape is a reload (which, see #5, also destroys nothing
yet but re-queues nothing either).

**Fix:** downscale on-device via `<canvas>`/`createImageBitmap` to ~1600px JPEG
before upload (10–20× smaller, faster and cheaper); add an `AbortController`
timeout with a retry message, and a visible cancel on the scan overlay.

### 5. A scan's review sheet is one accidental tap/reload away from being lost
**[code, behavior confirmed during live scan]** `app.review` is deliberately
transient: switching apps and getting the tab discarded (routine on iOS),
pulling to refresh, or tapping **Cancel** (no confirmation) silently discards
the entire parse — the user pays another scan (and the project pays another
Gemini call). Nothing warns that Cancel throws the scan away.

**Fix:** persist the pending review (entries + a downscaled data-URL of the
photo) alongside the lists; add a confirm to Cancel ("Discard this scan?").

### 6. After review, mistakes are unfixable
**[verified live]** The correction picker, the explanation text, and the photo
lightbox exist only in the review sheet. Once rows land in Requests:

- an unmatched row ("Free Bird") can never be attached to a songbook entry —
  it exports as `?? Free Bird` with no page, and there is no way to fix it;
- a wrong-but-confident match can't be re-checked against the photo (the image
  is gone) or corrected — only binned and re-added manually;
- conversely, the manual add path can *only* pick catalogue entries, so an
  off-book request (a thing that really happens on a whiteboard) can't be added
  by name at all — the scan path can produce unmatched rows but the human can't.

**Fix:** allow "change song" on list rows (reuse `buildSongPicker`); let the
manual combobox add free text as an unmatched request ("Add 'Free Bird'
anyway"); keep the last scan photo accessible from list rows that came from it.

---

## 🟠 Medium

### 7. The settings panel is a developer debug menu shown to musicians
**[verified live]** Behind the ⚙️: "Model" (gemini-2.5-flash vs -lite),
"Disable model thinking (faster)", "Send songbook to model (better handwriting
reads)", "Max image edge (px)". This is prompt-engineering vocabulary aimed at
the developer, not a ukulele player. The panel covers **62% of the viewport**
(288×558 on a 390×664 screen), and — worse — the **primary export actions
("Copy list", "Download JSON") are buried at its bottom**, invisible on the
main screen. "Your name" (a social feature) sits between API knobs.

**Fix:** put export on the main page (e.g. next to "Up next"); keep "Your name"
and "Songbook edition" as the only visible settings; fold the model knobs into
an "Advanced" disclosure or strip them from production. Note the panel has no
close button and no `max-height`/scroll if it ever outgrows a short viewport.

### 8. Sync failures while sharing are completely silent
**[code]** `sync.onStatusChange` handles only `expired`; the `error` status
(snapshot listener failure, rejected write) is swallowed — the green "sharing"
ring stays lit while peers silently diverge mid-gig. There's also no
connection/presence feedback at all ("3 people here", "reconnecting…"), even
though names are collected.

**Fix:** surface `status: "error"` (offline badge on the share button + retry);
consider lightweight presence via the session doc.

### 9. Wrong screen for the actual venue: bright light theme, screen sleeps
**[code]** `color-scheme: light` is forced; there is no dark mode, and the app
is explicitly for evening pub sessions — a full-white 100%-brightness phone in
a dim room. And with no Wake Lock, the phone sleeps mid-song; the MC re-unlocks
and re-finds the list between tunes all night.

**Fix:** add a `prefers-color-scheme: dark` palette (the status colors already
have dark-safe hues); request `navigator.wakeLock` while "Up next" is non-empty,
re-acquire on `visibilitychange`.

### 10. Crossed-out rows: counted, added, then invisibly dropped at export
**[verified live]** A crossed-out board row ("Mamma Mia") is counted in
"➕ Add **5** to requests", lands in Requests (struck through), but is then
silently excluded from Copy/Download unless a buried settings toggle is on.
Three different treatments of the same state, none explained where it matters.

**Fix:** default crossed-out review rows to removed (with per-row restore), or
badge them "won't export"; move the include-crossed choice next to export.

### 11. Destructive gestures have no undo
**[verified live]** Swipe-left bins instantly; no toast, no undo. Recovery
(tap 🗑 again) is undiscoverable because nothing announces the row is merely
"binned" rather than deleted. "Start over" clears both lists **for the whole
shared session** behind a native `confirm()`.

**Fix:** a 4-second "Binned 'Jolene' — Undo" snackbar covers both swipe
mistakes and the mental model; keep binned rows recoverable as today.

### 12. Duplicate requests aren't detected
**[code]** Scanning the same board twice, or a manual add plus a scan, produces
duplicate rows with no marker. At a gig this becomes a double-played song or a
confusing pool. **Fix:** flag rows whose match id already exists in either list
("already in Up next") at review-confirm and manual-add time.

### 13. Inconsistent icon language on row tools
**[verified live]** Two arrow systems sit side by side: text glyphs ↑↓ (reorder)
next to emoji ⬆️⬇️ (promote/demote) — the emoji read as upload/download and are
visually louder than the more common action. 🗑 means "bin (kept, crossed out)"
in the lists but "remove from scan" in review. ✓ toggling "played" is
learnable, but nothing signposts the swipe shortcuts.

**Fix:** one icon set (SVG, consistent weight); label promote explicitly
(e.g. a "+ Up next" pill); first-use hint for swipes.

### 14. Settings and toggles don't persist
**[code]** Only name/lists/edition/session survive a reload. Model choice,
"Show alternative suggestions", "Include crossed-out rows in export", max edge —
all reset silently. A user who fixed their export preference loses it next
Tuesday. **Fix:** persist the settings object with the lists.

### 15. Keyboard/AT access gaps
**[verified live]** The camera control is a `<label>` with `tabIndex -1` —
unreachable and unactivatable by keyboard (tab order goes share → gear → search
→ body). The combobox manages `aria-expanded`/`role=option` but never
`aria-activedescendant`, so SR users get no feedback on arrow-key selection.
Row explanation text ("Title and page both match…") is fine, but the ⚠️
button's 18×14 size fails WCAG 2.5.8 as well as the house 44px rule.

**Fix:** make the camera control a `<button>` that clicks the hidden input;
add `aria-activedescendant`; size fixes per #2.

### 16. Shared-venue rate limit will bite the room, not the abuser
**[code]** `/api/parse` allows 8/min **per IP**; a pub's NAT means the whole
club shares one bucket. Two or three people scanning at kickoff can 429 each
other ("Too many requests — try again shortly" — at least the copy is decent).
**Fix:** raise the per-IP window or key on a client-generated id + IP pair;
show the retry-after countdown in the UI.

---

## 🟡 Low / polish

17. **Identity mismatch:** tab title is "UT Request Board Parser" while the app
    calls itself "Whiteboard of Wishes"; favicon 404s (verified in console);
    no web manifest / apple-touch-icon / theme-color — for a weekly-use tool,
    add-to-home-screen is the natural install path and currently looks broken.
18. **Contrast:** `.raw`/`.added-by` text is #777 on white at ~13px (≈4.5:1,
    borderline AA fail); drag handle #999 ≈ 2.8:1 (< 3:1 non-text minimum);
    "or" divider #999 is decorative and fine.
19. **Lightbox can't do its job:** it exists to let you *read handwriting*, but
    the image is capped at 80vh with no zoom affordance, and "tap anywhere to
    close" means the first attempt to pinch/pan usually dismisses it.
    Suggest close-on-✕/backdrop only when zoomed, or double-tap to zoom.
20. **Edition dropdown shows raw ids** ("current", "wexford-2026") though the
    API returns display titles; the footer provenance line, by contrast, is
    excellent.
21. **Review sheet noise:** every row—including 99% matches—carries a full-width
    "Correct song…" input, doubling row height on a 25-row board. Collapse it
    behind an "edit" affordance on confirmed rows.
22. **Scan progress is static:** "Reading the board…" for a 6–20s wait (cold
    start + parse). Rotating copy or elapsed feedback reduces perceived time;
    also revoke the photo's object URL when review closes (currently leaked).
23. **Session privacy is guessable-by-design** (~10k two-word ids) and the
    panel does say "Anyone with the link can view and edit" — good copy; worth
    keeping in mind if the club ever grows beyond low-stakes lists.

---

## What's working well

Worth preserving through any redesign:

- The **Requests → Up next promote model** matches how request nights actually
  run, and the review-before-merge step is exactly right for OCR output.
- **Swipe implementation quality** is high: pointer-events (works cross-device),
  vertical-intent detection, remote-snapshot deferral during gestures, and
  reduced-motion support are all done carefully.
- **Review explanations with confidence** ("Title and page both match … (99%)")
  are genuinely trustworthy-feeling; the one live scan matched 4/5 rows
  correctly, flagged the misspelled one, and correctly refused the off-book one.
- Friendly, say-aloud **session ids** (`misty-penguin`); confirm-before-clobber
  when joining with local data; graceful "expired session" handling.
- Accent-insensitive search, safe-area insets, `capture="environment"`, and
  localStorage persistence of both lists are all solid mobile fundamentals.

## Suggested priority order

1. #1 search states + #3 human error copy (small changes, biggest trust win)
2. #2 touch targets (mechanical CSS fix, violates the repo's own hard rule)
3. #4 client-side resize + cancel/timeout (biggest speed win at the venue)
4. #6 post-review correction + free-text add (closes the only dead ends)
5. #7 export out of settings; #9 dark mode + wake lock (gig ergonomics)
