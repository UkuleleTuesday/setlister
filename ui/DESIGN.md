# Design system

Foundations (the tokens) and components live at the top of `style.css`. The
rest of the file composes them; Patterns says how they make a page. The UI is
mobile-first: phone and touch come first, desktop is a bonus.

## Rules

1. **Tokens only.** No raw colours, font sizes, weights, radii, shadows or
   z-indexes outside `:root`. Spacing uses `--space-*`. Off-grid values are
   for optical nudges and component geometry, such as icon sizes and badge
   offsets.
2. **Reuse a component before writing a one-off rule.** Keep the old
   class next to it when tests or mode CSS select on it, for example
   `class="songbook-trigger btn btn-primary btn-lg"`.
3. **One primary action per view.** Everything else is `btn-soft` or
   `link-button`.
4. **Every tappable thing is at least 44px and gives feedback when pressed.**
   The global `button:active` dims it. The platform's tap flash is off, so
   don't bring it back. Keyboard focus shows `--focus-ring`. No hover-only
   affordances.
5. **Anything that opens something shows it.** A row or pill that opens a
   view or sheet ends in a `forward` chevron; a heading that opens details
   ends in `chevron`. Lists you open things from are `.inset-list`; lists you
   act on (swipe, vote, reorder) are row cards.
6. **Status colours carry meaning.** Green is played or matched, orange needs
   a look, red is binned or an error, and purple is the brand and votes. Don't
   rely on colour alone: pair it with an icon, a dot or text.
7. **Chevrons navigate, arrows move.** `back`, `forward` and `chevron` go
   somewhere or open something; arrows only move a row (`earlier`, `later`).
8. **A visible way out, no instructions.** Every sheet has a Close or Cancel
   button. Tapping outside also closes sheets and popovers: it's a shortcut
   people already know, so don't label it. Hint only when nothing on screen
   shows the way out, as in the photo lightbox. A tap outside never throws
   away what someone typed. Escape is a desktop bonus.
9. **Small screens.** Size overlays with `max-height`/`max-width` (`dvh` for
   height) and scroll inside them. Anything pinned to an edge pads with
   `env(safe-area-inset-*)`, as in Page structure.
10. **One header for every view.** `.app-header` says where you are and what
    you can do. The way out and the night's status sit under it, in
    `.session-bar`. See Page structure.

## Foundations

| Group       | Tokens                                                                                     | Notes                                                                                 |
| ----------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| Brand       | `--accent`, `--accent-fill`, `--accent-soft`, `--on-accent(-muted, -divider)`              | `--accent-fill` is the primary gradient. `--accent-bright` only feeds it.             |
| Surfaces    | `--bg`, `--card`, `--surface-sunken`, `--border`, `--divider`, `--scrim`, `--scrim-strong` | `--border` outlines controls and cards. `--divider` is for hairlines inside them.     |
| Text        | `--text`, `--text-secondary`, `--muted`                                                    | `--muted` is the lightest text that passes AA.                                        |
| Status      | `--confirmed(-strong, -soft)`, `--review`, `--conflict(-soft)`, `--unmatched`              | `-soft` for backgrounds, `-strong` for text on `-soft`.                               |
| Type        | `--text-micro` … `--text-3xl`, `--text-display`, `--weight-*`, `--tracking-caps/-tight`    | `--text-display` is the home hero's night only. Inputs never go below `--text-base`.  |
| Space       | `--space-1` (0.2rem) … `--space-10` (2rem)                                                 | Steps of 0.2rem.                                                                      |
| Radius      | `--radius-xs` 6, `-sm` 8, `-md` 12, `-lg` 16, `-full`                                      | Badges `xs`, inputs and menus `sm`, cards and buttons `md`, sheets and big CTAs `lg`. |
| Elevation   | `--shadow-xs`, `-card`, `-raised`, `-cta`, `-popover`, `-modal`                            | Lowest to highest. `-raised` marks "next" and "upcoming".                             |
| Layers      | `--z-lifted`, `-bar`, `-popover`, `-menu`, `-sheet`, `-lightbox`                           | `-bar` is the pinned add bar: over rows, under popovers.                              |
| Motion      | `--duration-fast`, `--duration-base`, `--ease`                                             | Animations go inside a `prefers-reduced-motion` guard.                                |
| Interaction | `--tap-min`, `--pressed-opacity`, `--disabled-opacity`, `--focus-ring`                     |                                                                                       |
| Layout      | `--page-max`, `--control-size`                                                             | The column every view shares. Icon-buttons and the pills beside them.                 |

## Components

| Class                                      | Use for                                                                                           |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| `.btn` + `.btn-primary`                    | The view's main action.                                                                           |
| `.btn` + `.btn-soft`                       | Secondary actions such as Cancel or Close, and the second big button.                             |
| `.btn-lg`                                  | Hero actions on the page, such as Add a tune or New session. Not inside sheets.                   |
| `.btn` + `.btn-on-accent`                  | The one action on an `--accent-fill` surface, such as Request a tune on tonight's card.           |
| `.link-button`                             | Text-only actions inline with content. The hit area is built in.                                  |
| `.icon-button`                             | Round, bordered icon-only button, such as the header's share and settings. Needs an `aria-label`. |
| `.app-header`                              | Every view's top: title stack, then actions. See Page structure.                                  |
| `.session-bar`                             | A session's way out and status, under the header. See Page structure.                             |
| `.badge` (`.badge-dot`)                    | A count, or a dot, on a button's corner. Status colour, and say it in the `aria-label` too.       |
| `.tap-target`                              | Grows a small control's hit area to 44px without moving the layout.                               |
| `.eyebrow`                                 | Uppercase label: section headings, kickers, the club name.                                        |
| `.popover`                                 | A panel under the header, anchored right below its actions. Set `width` per instance.             |
| `Sheet.svelte`                             | Modal dialogs. Stack actions in `.actions`: primary first, then soft.                             |
| `.field`                                   | Label, then control, then an optional `.note`.                                                    |
| `.note`, `.error`                          | Help text and failures.                                                                           |
| `.callout`                                 | A tinted note: a confirmation, a status, the edit-mode notice. Set its margin per use.            |
| `.inset-list`                              | Rows in one card, split by hairlines, for lists you open things from.                             |
| `.date-tile` (`.date-tile-lg`)             | Small caps label over a number, leading a row: a night's weekday and day, or a tune's page.       |
| `.numbered`                                | Numbers a list of row cards, such as the played order. Use it on an `<ol>`.                       |
| `.page-badge`, `.window-pill`, `.next-tag` | Badges and status pills. A `button.window-pill` ends in `forward` and hits at 44px.               |
| `.settings-group`                          | An `.eyebrow` naming who the settings affect, over its rows and fields.                           |
| `.setting-row`                             | A `<label>`: `.setting-text` (and `.setting-help`) on the left, its control on the right.         |
| `.switch`                                  | On/off that applies at once: `<input type="checkbox" role="switch">`.                             |
| `.disclosure`                              | A named, collapsed `<details>` with a `disclosure-chevron` in its summary.                        |

## Patterns

### Page structure

Every view is `.app-header`, then `main`, in one `--page-max` column.

1. **Header.** `.title-stack` (the club name as `.eyebrow` over the h1), then
   `.header-actions`: icon-buttons and pills at `--control-size`, settings
   last. Actions align to the top, so a title can wrap; it never truncates.
   `.title-tail` keeps a title's chevron on its last word.
2. **Header popovers** hang from the header's bottom edge, anchored right.
3. **Session bar.** First in a session's `main`: "All sessions", always
   labelled, then one status item. That's the request pill on a live night,
   Edit/Done on a past one (organisers), nothing in room mode. It wraps rather
   than squeeze.
4. **Room mode** hides the header's actions and the title's chevron. Nothing
   else moves.
5. **Badges** sit inside their button: `.badge-dot` for news, a count for
   people. A count of one is only you, so it hides.
6. **Notches.** Edge padding is `max(<token>, env(safe-area-inset-*))`. The
   insets read 0 until `index.html` sets `viewport-fit=cover`.
7. **Add bar.** On a live night, organisers' Add a tune and Snap the board
   pin to the bottom edge (`.manual-add`, `--z-bar`). The session pads its
   bottom so the last row clears it.

### Setlist rows

1. **The page leads**, in a `.date-tile` (`.page-tile`): it's what gets
   called out to the room. Title over artist, then one muted meta line.
2. **Every queued row is equal.** Each keeps its own played and move
   buttons: tunes get played out of order, chained or ticked late. Next is a
   label and the tile's accent tint, never a bigger button.

### Settings

1. **Put a setting where its effect lives.** The gear holds this phone's
   settings only. A control that changes the session for everyone sits where
   that session's status shows, such as the request link behind its pill,
   and says in its help text that it affects everyone.
2. **Prefer no setting.** If a sensible default or the situation can decide,
   don't ask. The API owns scan tuning, and runner-up matches show only where
   the reader was unsure.
3. **Changes apply at once.** No Save button. While a shared change saves, its
   control is disabled; a failure shows as `.error` under it.
4. **Pick the control by the choice:** on/off is a `.switch`, never a bare
   checkbox; a long list is a `<select>`; free text is a `.field`.
5. **Short label, effect underneath.** Add a `.setting-help` line when the
   label doesn't say what happens. Offer "Use default" once a value is
   overridden.
6. **Rare settings go in a named `.disclosure`**, collapsed by default.

## Exceptions

The scan overlay (`.scan-*`) and the photo lightbox sit on top of a photo and
use their own dark violet palette on purpose.
