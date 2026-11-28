// Each boundary is an override on the session doc or a default derived from
// createdAt, so the common case stores nothing.

import { NIGHT_BOUNDARY_HOUR, sessionTimeLabel, startOfNight } from "./session-index.js";
import type { SessionMeta } from "./types.js";

export interface RequestWindow {
  opensAt: Date;
  closesAt: Date;
}

/** The manual override: true = forced open, false = forced closed, null = auto. */
export type RequestsMode = boolean | null;

export type WindowState = "open" | "later" | "closed";

// Early enough to get a request in before the first song, late enough not to
// read as "always open".
const DEFAULT_OPEN_LEAD_MS = 30 * 60 * 1000;

const OPENING_SOON_LEAD_MS = 30 * 60 * 1000;

// --- Smart defaults ---------------------------------------------------------

export function defaultOpensAt(sessionCreatedAt: Date): Date {
  return new Date(sessionCreatedAt.getTime() - DEFAULT_OPEN_LEAD_MS);
}

const DEFAULT_CLOSE_HOUR = 22;
const DEFAULT_CLOSE_MINUTE = 30;

export function defaultClosesAt(sessionCreatedAt: Date): Date {
  const d = startOfNight(sessionCreatedAt);
  d.setHours(DEFAULT_CLOSE_HOUR, DEFAULT_CLOSE_MINUTE, 0, 0);
  if (d > defaultOpensAt(sessionCreatedAt)) return d;
  d.setDate(d.getDate() + 1);
  d.setHours(NIGHT_BOUNDARY_HOUR, 0, 0, 0);
  return d;
}

// --- Resolution --------------------------------------------------------------

// Close at or before open resolves to null (unrestricted): failing open costs
// extra requests, failing shut a room that can never request.
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

export function isWithinWindow(win: RequestWindow | null, now: Date): boolean {
  if (!win) return true;
  return now >= win.opensAt && now < win.closesAt;
}

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

// Ceil, so 40 seconds out reads "in a minute", never "in 0 minutes".
export function minutesUntilOpen(win: RequestWindow | null, now: Date): number | null {
  if (!win) return null;
  const ms = win.opensAt.getTime() - now.getTime();
  if (ms <= 0 || ms > OPENING_SOON_LEAD_MS) return null;
  return Math.ceil(ms / 60000);
}

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

export function openingSoonLabel(minutes: number): string {
  return minutes <= 1 ? "a minute" : `${minutes} minutes`;
}

export function defaultWindowLabel(sessionCreatedAt: Date): string {
  const opensAt = defaultOpensAt(sessionCreatedAt);
  const closesAt = defaultClosesAt(sessionCreatedAt);
  return `Requests open ${sessionTimeLabel(opensAt)} to ${sessionTimeLabel(closesAt)}`;
}

// <input type="datetime-local"> bridge, in local time for the same reason as
// toDateInputValue in session-index.ts.
export function toDateTimeInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function fromDateTimeInputValue(value: string | null | undefined): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value || "");
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]));
}

// --- The link as the UI shows it --------------------------------------------

export interface LinkState {
  open: boolean;
  soonMinutes: number | null;
  window: RequestWindow | null;
  status: { state: WindowState; at: Date | null };
}

type LinkMeta = Pick<SessionMeta, "requestsOpen" | "requestsOpensAt" | "requestsClosesAt">;

// Every gating site asks this with one `now`, so a slow tap can't straddle two
// answers.
export function linkState(meta: LinkMeta, sessionCreatedAt: Date | null, now: Date): LinkState {
  const win = resolveWindow({
    sessionCreatedAt,
    opensAtOverride: meta.requestsOpensAt,
    closesAtOverride: meta.requestsClosesAt,
  });
  const mode = meta.requestsOpen;
  const open = effectiveRequestsOpen({ mode, window: win, now });
  const soonMinutes = !open && mode === null ? minutesUntilOpen(win, now) : null;
  return { open, soonMinutes, window: win, status: windowStatus({ mode, window: win, now }) };
}

const OPEN_NOTE = "People on the link can add tunes and follow the set, not change it.";
const CLOSED_NOTE =
  "View only: people can follow tonight's set but can't add to it. The whiteboard carries on as usual.";

/** What the room can do on the link right now. */
export function roomNote(open: boolean): string {
  return open ? OPEN_NOTE : CLOSED_NOTE;
}

const WEEKDAY_FORMAT = new Intl.DateTimeFormat(undefined, { weekday: "long" });
const DAY_MONTH_FORMAT = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "long" });
const WEEKDAY_SHORT_FORMAT = new Intl.DateTimeFormat(undefined, { weekday: "short" });
const DAY_MONTH_SHORT_FORMAT = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  month: "short",
});

function calendarDaysBetween(from: Date, to: Date): number {
  const a = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const b = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

// A time alone reads as today, so name the day when it isn't (#241).
// No "tomorrow": the pill must fit a 320px phone, and "tomorrow" doesn't.
/** "" today, else a short weekday within the week, or a short date. */
function shortDay(at: Date, now: Date): string {
  const days = calendarDaysBetween(now, at);
  if (days <= 0) return "";
  return days < 7 ? WEEKDAY_SHORT_FORMAT.format(at) : DAY_MONTH_SHORT_FORMAT.format(at);
}

/** "at 7:30 PM" today, "Mon at 7:30 PM" on another day. */
function whenOpens(at: Date, now: Date): string {
  const day = shortDay(at, now);
  // Non-breaking, so a pill that wraps never splits "at 7:30 PM".
  const time = `at ${sessionTimeLabel(at)}`.replace(/ /g, "\u00a0");
  return `${day ? `${day} ` : ""}${time}`;
}

/** The help line under the request link switch: who set it, and when it next changes. */
export function switchHelp(mode: RequestsMode, link: LinkState, now: Date): string {
  if (mode !== null) return "Set by hand";
  const { state, at } = link.status;
  if (state === "later" && at) return `On schedule, opens ${whenOpens(at, now)}`;
  if (state === "open" && at) return `On schedule, closes at ${sessionTimeLabel(at)}`;
  if (state === "closed" && link.window) {
    return `On schedule, closed at ${sessionTimeLabel(link.window.closesAt)}`;
  }
  return "On schedule";
}

export function scheduleLabel(win: RequestWindow | null, now: Date): string {
  if (!win) return "";
  const day = shortDay(win.opensAt, now);
  const times = `${sessionTimeLabel(win.opensAt)} to ${sessionTimeLabel(win.closesAt)}`;
  return day ? `${day}, ${times}` : times;
}

export function windowChipText({ state, at }: LinkState["status"], now: Date): string {
  const time = at ? sessionTimeLabel(at) : "";
  if (state === "open") return time ? `Request link open until ${time}` : "Request link open";
  if (state === "later" && at) return `Request link opens ${whenOpens(at, now)}`;
  return "Request link is view only";
}

/** The link's state on its own, for rows already labelled "Request link". */
export function linkStateText({ state, at }: LinkState["status"], now: Date): string {
  const time = at ? sessionTimeLabel(at) : "";
  if (state === "open") return time ? `Open until ${time}` : "Open";
  if (state === "later" && at) return `Opens ${whenOpens(at, now)}`;
  return "View only";
}

/** Tonight's card on home: whether the room can request, and until or from when. */
export function homeStatusText({ state, at }: LinkState["status"], now: Date): string {
  if (state === "open") return at ? `Requests open until ${sessionTimeLabel(at)}` : "Requests open";
  if (state === "later" && at) return `Requests open ${whenOpens(at, now)}`;
  return "Requests closed";
}

export function roomWindowText({ state, at }: LinkState["status"]): string {
  return state === "open" && at ? `Requests open until ${sessionTimeLabel(at)}` : "Requests open";
}

// Days ahead, "closed here for tonight" read as if the night were over.
/** The room's line while it can't request: when it can, or that it's over. */
export function requestsClosedNote({ state, at }: LinkState["status"], now: Date): string {
  if (state === "later" && at) {
    const days = calendarDaysBetween(now, at);
    const day =
      days <= 0
        ? ""
        : days === 1
          ? "tomorrow "
          : days < 7
            ? `${WEEKDAY_FORMAT.format(at)} `
            : `on ${DAY_MONTH_FORMAT.format(at)} `;
    return `Requests open ${day}at ${sessionTimeLabel(at)}.`;
  }
  return "Requests are closed here for tonight. Pop your tune on the whiteboard of wishes instead.";
}

export function openingSoonNote(minutes: number): string {
  return `Requests open in ${openingSoonLabel(minutes)}. Pop your tune on the whiteboard of wishes for now.`;
}
