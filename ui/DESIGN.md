# Design system

Tokens and primitives live at the top of `style.css`. The rest of the file
composes them. Mobile-first rules (touch, dismissal, notches) are in
`AGENTS.md`.

## Rules

1. **Tokens only.** No raw colours, font sizes, weights, radii, shadows or
   z-indexes outside `:root`. Spacing uses `--space-*`. Off-grid values are
   for optical nudges and component geometry, such as icon sizes and badge
   offsets.
2. **Reuse a primitive before writing a component rule.** Keep the old
   class next to it when tests or mode CSS select on it, for example
   `class="songbook-trigger btn btn-primary btn-lg"`.
3. **One primary action per view.** Everything else is `btn-soft` or
   `link-button`.
4. **Every tappable thing is at least 44px and gives feedback when pressed.**
   The global `button:active` dims it. The platform's tap flash is off, so
   don't bring it back. Keyboard focus shows `--focus-ring`.
5. **Rows you open lead somewhere visibly.** A row that navigates ends in a
   `forward` chevron. Lists you open things from are `.inset-list`; lists you
   act on (swipe, vote, reorder) are row cards.
6. **Status colours carry meaning.** Green is played or matched, orange needs
   a look, red is binned or an error, and purple is the brand and votes. Don't
   rely on colour alone: pair it with an icon, a dot or text.

## Tokens

| Group       | Tokens                                                                                     | Notes                                                                                 |
| ----------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| Brand       | `--accent`, `--accent-fill`, `--accent-soft`, `--on-accent`                                | `--accent-fill` is the primary gradient. `--accent-bright` only feeds it.             |
| Surfaces    | `--bg`, `--card`, `--surface-sunken`, `--border`, `--divider`, `--scrim`, `--scrim-strong` | `--border` outlines controls and cards. `--divider` is for hairlines inside them.     |
| Text        | `--text`, `--text-secondary`, `--muted`                                                    | `--muted` is the lightest text that passes AA.                                        |
| Status      | `--confirmed(-strong, -soft)`, `--review`, `--conflict(-soft)`, `--unmatched`              | `-soft` for backgrounds, `-strong` for text on `-soft`.                               |
| Type        | `--text-micro` … `--text-3xl`, `--weight-medium/semibold/bold`, `--tracking-caps`          | Inputs never go below `--text-base`, or iOS zooms in on focus.                        |
| Space       | `--space-1` (0.2rem) … `--space-10` (2rem)                                                 | Steps of 0.2rem.                                                                      |
| Radius      | `--radius-xs` 6, `-sm` 8, `-md` 12, `-lg` 16, `-full`                                      | Badges `xs`, inputs and menus `sm`, cards and buttons `md`, sheets and big CTAs `lg`. |
| Elevation   | `--shadow-xs`, `-card`, `-raised`, `-cta`, `-popover`, `-modal`                            | Lowest to highest. `-raised` marks "next" and "upcoming".                             |
| Layers      | `--z-lifted`, `-popover`, `-menu`, `-sheet`, `-lightbox`                                   |                                                                                       |
| Motion      | `--duration-fast`, `--duration-base`, `--ease`                                             | Animations go inside a `prefers-reduced-motion` guard.                                |
| Interaction | `--tap-min`, `--pressed-opacity`, `--disabled-opacity`, `--focus-ring`                     |                                                                                       |

## Primitives

| Class                                      | Use for                                                                                           |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| `.btn` + `.btn-primary`                    | The view's main action.                                                                           |
| `.btn` + `.btn-soft`                       | Secondary actions such as Cancel or Close, and the second big button.                             |
| `.btn-lg`                                  | Hero actions on the page, such as Add a tune or New session. Not inside sheets.                   |
| `.link-button`                             | Text-only actions inline with content. The hit area is built in.                                  |
| `.icon-button`                             | Round, bordered icon-only button, such as the header's share and settings. Needs an `aria-label`. |
| `.tap-target`                              | Grows a small control's hit area to 44px without moving the layout.                               |
| `.eyebrow`                                 | Uppercase label: section headings, kickers, the club name.                                        |
| `.popover`                                 | A panel anchored under a header button. Set `left`/`right` and `width` per instance.              |
| `Sheet.svelte`                             | Modal dialogs. Stack actions in `.actions`: primary first, then soft.                             |
| `.field`                                   | Label, then control, then an optional `.note`.                                                    |
| `.note`, `.error`                          | Help text and failures.                                                                           |
| `.callout`                                 | A tinted note: a confirmation, a status, the edit-mode notice. Set its margin per use.            |
| `.inset-list`                              | Rows in one card, split by hairlines, for lists you open things from.                             |
| `.date-tile` (`.date-tile-lg`)             | Weekday over day number, leading a row about a night. Large, on the accent fill, for the hero.    |
| `.numbered`                                | Numbers a list of row cards, such as the played order. Use it on an `<ol>`.                       |
| `.page-badge`, `.window-pill`, `.next-tag` | Badges and status pills.                                                                          |
| `.settings-group`                          | An `.eyebrow` naming who the settings affect, over its rows and fields.                           |
| `.setting-row`                             | A `<label>`: `.setting-text` (and `.setting-help`) on the left, its control on the right.         |
| `.switch`                                  | On/off that applies at once: `<input type="checkbox" role="switch">`.                             |
| `.disclosure`                              | A named, collapsed `<details>` with a `disclosure-chevron` in its summary.                        |

## Settings

1. **Put a setting where its effect lives.** The gear holds this phone's
   settings only. Anything that changes the session for everyone belongs in
   the share panel, and says so in its help text.
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
