// The request time window: when the room's request link takes tunes on its
// own, with no organiser action (#NEW). Pure and DOM-free like
// session-index.js/room-limits.js — app.js owns all the DOM, this module only
// answers "what does the schedule say right now".
//
// The window has two independent boundaries, each either an explicit override
// (stored on the session doc, see sync.js's requestsOpensAt/requestsClosesAt)
// or a smart default derived from the session's own start time
// (sessionCreatedAt, already stored on every session — no new field needed
// for the common case). The manual requestsOpen toggle in sync.js sits above
// both: forced open/closed always wins over the schedule.
//
// `now` is always injected, never read from the wall clock in here, so every
// branch is testable with a pinned clock (see session-index.js's tests).

import { NIGHT_BOUNDARY_HOUR, sessionTimeLabel, startOfNight } from "./session-index.js";

// The window opens this long before the session's own start — early enough
// that people arriving can get a request in before the first song, not so
// early it's indistinguishable from "always open".
const DEFAULT_OPEN_LEAD_MS = 30 * 60 * 1000;

// How far ahead of the open instant the room view starts saying "soon"
// instead of just "closed" — half an hour of notice, same as the lead time
// above (so, by default, an hour before the session itself).
const OPENING_SOON_LEAD_MS = 30 * 60 * 1000;

// --- Smart defaults ---------------------------------------------------------

export function defaultOpensAt(sessionCreatedAt) {
  return new Date(sessionCreatedAt.getTime() - DEFAULT_OPEN_LEAD_MS);
}

// 04:00 (NIGHT_BOUNDARY_HOUR) the calendar day after the night starts, built
// from startOfNight() so the boundary hour has exactly one place to move —
// the same "end of night" every other date label in the app already uses.
export function defaultClosesAt(sessionCreatedAt) {
  const d = startOfNight(sessionCreatedAt);
  d.setDate(d.getDate() + 1);
  d.setHours(NIGHT_BOUNDARY_HOUR, 0, 0, 0);
  return d;
}

// --- Resolution --------------------------------------------------------------

// Each boundary resolves independently: an override on one side never pins
// the other to its default. `sessionCreatedAt` may be null (not yet resolved
// from a fresh snapshot) — treated as "no window" rather than guessing, since
// there's nothing to anchor a default to.
//
// A misconfigured window (close at or before open) resolves to null —
// unrestricted — rather than a window nothing can ever fall inside. Same call
// as room-limits.js's clock-skew guard: a broken restriction costs one extra
// request, a window nobody can ever be inside costs a room that can never
// request at all.
export function resolveWindow({ sessionCreatedAt, opensAtOverride, closesAtOverride }) {
  if (!sessionCreatedAt) return null;
  const opensAt = opensAtOverride ?? defaultOpensAt(sessionCreatedAt);
  const closesAt = closesAtOverride ?? defaultClosesAt(sessionCreatedAt);
  if (closesAt <= opensAt) return null;
  return { opensAt, closesAt };
}

// Open boundary inclusive, close boundary exclusive — a request landing in
// the same instant the window opens is fine, one at the close instant is not.
// No window at all means unrestricted.
//
// Named `win`, not `window`: this runs in the browser, where `window` is the
// global object — shadowing it here would be legal JS but a trap for the next
// edit.
export function isWithinWindow(win, now) {
  if (!win) return true;
  return now >= win.opensAt && now < win.closesAt;
}

// The manual toggle (mode: true = forced open, false = forced closed, null =
// auto) layered over the window. A deliberate override always outranks the
// schedule; auto defers to it entirely.
export function effectiveRequestsOpen({ mode, window: win, now }) {
  if (mode === true) return true;
  if (mode === false) return false;
  return isWithinWindow(win, now);
}

// Minutes until the window opens, only within the "opening soon" notice
// period — null once it's open, once it's more than half an hour out, or when
// there's no window to open. Ceil so "40 seconds to go" reads as "in a
// minute", never "in 0 minutes".
export function minutesUntilOpen(win, now) {
  if (!win) return null;
  const ms = win.opensAt - now;
  if (ms <= 0 || ms > OPENING_SOON_LEAD_MS) return null;
  return Math.ceil(ms / 60000);
}

// "a minute" / "12 minutes" — said in a room view note, mirrors
// room-limits.js's cooldownLabel.
export function openingSoonLabel(minutes) {
  return minutes <= 1 ? "a minute" : `${minutes} minutes`;
}

// The New Session sheet's read-only preview of the smart default — nothing is
// stored at create time (see sync.js's createSession), so this is the only
// place the default window is ever shown before the session exists.
export function defaultWindowLabel(sessionCreatedAt) {
  const opensAt = defaultOpensAt(sessionCreatedAt);
  const closesAt = defaultClosesAt(sessionCreatedAt);
  return `Requests open ${sessionTimeLabel(opensAt)} to ${sessionTimeLabel(closesAt)}`;
}

// The <input type="datetime-local"> bridge, local time only — same footgun
// toDateInputValue/fromDateInputValue in session-index.js already dodge for
// the date-only picker (toISOString renders UTC, new Date(string) parses as
// UTC midnight). A datetime-local value has no timezone of its own, so both
// directions just read/write the Date's local getters.
export function toDateTimeInputValue(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// "" (a cleared picker) and malformed values both come back null — the caller
// treats that as "clear the override, fall back to the default".
export function fromDateTimeInputValue(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value || "");
  if (!m) return null;
  return new Date(
    Number(m[1]),
    Number(m[2]) - 1,
    Number(m[3]),
    Number(m[4]),
    Number(m[5])
  );
}
