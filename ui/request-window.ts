// The request time window: when the room's request link takes tunes on its
// own, with no organiser action (#127). Pure and DOM-free: this module only
// answers "what does the schedule say right now".
//
// The window has two independent boundaries, each either an explicit override
// (the session doc's requestsOpensAt/requestsClosesAt, see sync.ts) or a
// smart default derived from the session's createdAt, so the common case
// stores nothing. The manual requestsOpen switch sits above both: forced
// open/closed always wins over the schedule.
//
// `now` is always injected, never read from the wall clock in here, so every
// branch is testable with a pinned clock.

import { NIGHT_BOUNDARY_HOUR, sessionTimeLabel, startOfNight } from "./session-index.js";
import type { SessionMeta } from "./types.js";

/** When the room's request link takes tunes on its own. */
export interface RequestWindow {
  opensAt: Date;
  closesAt: Date;
}

/** The manual override: true = forced open, false = forced closed, null = auto. */
export type RequestsMode = boolean | null;

export type WindowState = "open" | "later" | "closed";

// The window opens this long before the session's own start: early enough
// that people arriving can get a request in before the first song, not so
// early it's indistinguishable from "always open".
const DEFAULT_OPEN_LEAD_MS = 30 * 60 * 1000;

// How far ahead of the open instant the room view says "soon" rather than
// "closed": by default, an hour before the session itself.
const OPENING_SOON_LEAD_MS = 30 * 60 * 1000;

// --- Smart defaults ---------------------------------------------------------

export function defaultOpensAt(sessionCreatedAt: Date): Date {
  return new Date(sessionCreatedAt.getTime() - DEFAULT_OPEN_LEAD_MS);
}

const DEFAULT_CLOSE_HOUR = 22;
const DEFAULT_CLOSE_MINUTE = 30;

// 22:30 on the night's evening; a session starting after that closes at the
// end of the night instead.
export function defaultClosesAt(sessionCreatedAt: Date): Date {
  const d = startOfNight(sessionCreatedAt);
  d.setHours(DEFAULT_CLOSE_HOUR, DEFAULT_CLOSE_MINUTE, 0, 0);
  if (d > defaultOpensAt(sessionCreatedAt)) return d;
  d.setDate(d.getDate() + 1);
  d.setHours(NIGHT_BOUNDARY_HOUR, 0, 0, 0);
  return d;
}

// --- Resolution --------------------------------------------------------------

// Each boundary resolves independently: an override on one side never pins
// the other to its default. `sessionCreatedAt` may be null (not yet resolved
// from a fresh snapshot): treated as "no window" rather than guessing, since
// there's nothing to anchor a default to.
//
// A misconfigured window (close at or before open) resolves to null
// (unrestricted) rather than a window nothing can fall inside. Same call as
// room-limits.ts's clock-skew guard: failing open costs extra requests,
// failing shut costs a room that can never request at all.
export function resolveWindow({
  sessionCreatedAt,
  opensAtOverride,
  closesAtOverride,
}: {
  sessionCreatedAt: Date | null;
  opensAtOverride?: Date | null;
  closesAtOverride?: Date | null;
}): RequestWindow | null {
  if (!sessionCreatedAt) return null;
  const opensAt = opensAtOverride ?? defaultOpensAt(sessionCreatedAt);
  const closesAt = closesAtOverride ?? defaultClosesAt(sessionCreatedAt);
  if (closesAt <= opensAt) return null;
  return { opensAt, closesAt };
}

// Open boundary inclusive, close boundary exclusive. No window at all means
// unrestricted. Named `win`, not `window`, so it doesn't shadow the browser
// global.
export function isWithinWindow(win: RequestWindow | null, now: Date): boolean {
  if (!win) return true;
  return now >= win.opensAt && now < win.closesAt;
}

// The manual toggle (mode: true = forced open, false = forced closed, null =
// auto) layered over the window. A deliberate override always outranks the
// schedule; auto defers to it entirely.
export function effectiveRequestsOpen({
  mode,
  window: win,
  now,
}: {
  mode: RequestsMode;
  window: RequestWindow | null;
  now: Date;
}): boolean {
  if (mode === true) return true;
  if (mode === false) return false;
  return isWithinWindow(win, now);
}

// Minutes until the window opens, only within the "opening soon" notice
// period: null once it's open, when it's further out, or when there's no
// window. Ceil so "40 seconds to go" reads as "in a minute", never "in 0
// minutes".
export function minutesUntilOpen(win: RequestWindow | null, now: Date): number | null {
  if (!win) return null;
  const ms = win.opensAt.getTime() - now.getTime();
  if (ms <= 0 || ms > OPENING_SOON_LEAD_MS) return null;
  return Math.ceil(ms / 60000);
}

// The request link's state for the pill both views show (the room's rules
// line, the full app's session bar): "open" (until `at` when a schedule will
// close it), "later" (opens at `at`) or "closed". A forced open has no end to
// name; a forced close, or a window that has passed, is simply closed.
export function windowStatus({
  mode,
  window: win,
  now,
}: {
  mode: RequestsMode;
  window: RequestWindow | null;
  now: Date;
}): { state: WindowState; at: Date | null } {
  if (mode === true) return { state: "open", at: null };
  if (mode === false) return { state: "closed", at: null };
  if (!win) return { state: "open", at: null };
  if (now < win.opensAt) return { state: "later", at: win.opensAt };
  if (now < win.closesAt) return { state: "open", at: win.closesAt };
  return { state: "closed", at: null };
}

// "a minute" / "12 minutes", for the room view's note; mirrors room-limits.ts's
// cooldownLabel.
export function openingSoonLabel(minutes: number): string {
  return minutes <= 1 ? "a minute" : `${minutes} minutes`;
}

// The new-session sheet's read-only preview of the smart default: nothing is
// stored at create time (see sync.ts's createSession).
export function defaultWindowLabel(sessionCreatedAt: Date): string {
  const opensAt = defaultOpensAt(sessionCreatedAt);
  const closesAt = defaultClosesAt(sessionCreatedAt);
  return `Requests open ${sessionTimeLabel(opensAt)} to ${sessionTimeLabel(closesAt)}`;
}

// The <input type="datetime-local"> bridge, local time only: the same UTC
// footguns toDateInputValue/fromDateInputValue in session-index.ts dodge. A
// datetime-local value has no timezone of its own, so both directions use the
// Date's local fields.
export function toDateTimeInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// "" (a cleared picker) and malformed values both come back null: the caller
// treats that as "clear the override, fall back to the default".
export function fromDateTimeInputValue(value: string | null | undefined): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value || "");
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]));
}

// --- The link as the UI shows it --------------------------------------------

/** Everything the UI says about the request link at one instant. */
export interface LinkState {
  /** Taking tunes right now. */
  open: boolean;
  /** Minutes until an auto window opens, within the notice period; else null. */
  soonMinutes: number | null;
  window: RequestWindow | null;
  /** The pill both views show. */
  status: { state: WindowState; at: Date | null };
}

type LinkMeta = Pick<SessionMeta, "requestsOpen" | "requestsOpensAt" | "requestsClosesAt">;

// The one composed answer to "is the room's request link taking tunes": a
// forced override always wins, otherwise the window decides. Every gating
// site asks this with a single `now`, so a slow tap can't straddle two
// answers.
export function linkState(meta: LinkMeta, sessionCreatedAt: Date | null, now: Date): LinkState {
  const win = resolveWindow({
    sessionCreatedAt,
    opensAtOverride: meta.requestsOpensAt,
    closesAtOverride: meta.requestsClosesAt,
  });
  const mode = meta.requestsOpen;
  const open = effectiveRequestsOpen({ mode, window: win, now });
  // Only auto mode has a meaningful "opening soon": a forced-closed room
  // isn't about to open whatever the clock says.
  const soonMinutes = !open && mode === null ? minutesUntilOpen(win, now) : null;
  return { open, soonMinutes, window: win, status: windowStatus({ mode, window: win, now }) };
}

const OPEN_NOTE =
  "The request link is a view for the room: people can add tunes and follow the set, not change it.";
const CLOSED_NOTE =
  "View only: people can open tonight's pool and set and watch them, but can't add to them. The whiteboard carries on as usual.";

// The share panel's note describes the link's CURRENT state, so the panel
// can't promise people can add tunes while the switch says they can't (and
// it tells the organiser the whiteboard is unaffected). Forced open/closed
// get fixed copy; auto names the resolved boundary so the organiser sees the
// schedule without reading the time fields.
export function requestNote(mode: RequestsMode, link: LinkState): string {
  if (mode === true) return OPEN_NOTE;
  if (mode === false || !link.window) return link.open ? OPEN_NOTE : CLOSED_NOTE;
  return link.open
    ? `Auto: taking requests until ${sessionTimeLabel(link.window.closesAt)}. People can add tunes and follow the set, not change it.`
    : `Auto: not open yet, opens at ${sessionTimeLabel(link.window.opensAt)}. View only until then.`;
}

// The link's state, worded once for both views: the full app's chip names
// the link the organiser controls; the request view's rules line says what
// the room can do (it only shows while requests are open).
export function windowChipText({ state, at }: LinkState["status"]): string {
  const time = at ? sessionTimeLabel(at) : "";
  if (state === "open") return time ? `Request link open until ${time}` : "Request link open";
  if (state === "later") return `Request link opens at ${time}`;
  return "Request link is view only";
}

export function roomWindowText({ state, at }: LinkState["status"]): string {
  return state === "open" && at ? `Requests open until ${sessionTimeLabel(at)}` : "Requests open";
}

/** The room's note while the link is about to open. */
export function openingSoonNote(minutes: number): string {
  return `Requests open in ${openingSoonLabel(minutes)}. Pop your tune on the whiteboard of wishes for now.`;
}
