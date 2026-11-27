// `sessionIndex/{id}` exists because the web SDK has no field projection:
// listing `sessions` would download every night's rows on every app open.
// Writes live in sync.ts, batched with the session's `listed` flag.

import { features } from "./features.js";
import { getFirestore } from "./firebase.js";

export interface SessionEntry {
  id: string;
  createdBy: string;
  createdAt: Date | null;
  blurb: string;
}

export const BLURB_MAX = 160;

/** One line, trimmed and capped: what firestore.rules accepts and the card shows. */
export function cleanBlurb(text: string): string {
  return text.replace(/\s+/g, " ").trim().slice(0, BLURB_MAX);
}

export type LabelledEntry<T extends Pick<SessionEntry, "createdAt">> = T & { label: string };

// Duck-typed: the lazily loaded SDK has no class to instanceof at import time,
// and a pending serverTimestamp reads as null locally.
export function timestampToDate(value: unknown): Date | null {
  const ts = value as { toDate?: unknown } | null | undefined;
  return typeof ts?.toDate === "function" ? (ts as { toDate(): Date }).toDate() : null;
}

export const INDEX_COLLECTION = "sessionIndex";

// Over a year of weekly nights.
const DEFAULT_MAX = 60;

// An unreachable Firestore can leave getDocs pending forever: show a retry, not
// an endless spinner.
const LIST_TIMEOUT_MS = 8000;

// The viewer's locale, at render time: a stored formatted date would mix
// locales in one list.
const TIME_FORMAT = new Intl.DateTimeFormat(undefined, {
  hour: "2-digit",
  minute: "2-digit",
});
const WEEKDAY_FORMAT = new Intl.DateTimeFormat(undefined, { weekday: "long" });
const DAY_MONTH_FORMAT = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  month: "long",
});
const FULL_DATE_FORMAT = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  month: "long",
  year: "numeric",
});

const WEEKDAY_SHORT_FORMAT = new Intl.DateTimeFormat(undefined, { weekday: "short" });
const MONTH_FORMAT = new Intl.DateTimeFormat(undefined, { month: "long" });
const MONTH_YEAR_FORMAT = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" });
const RELATIVE_FORMAT = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

const CLUB_WEEKDAY = 2; // Date#getDay(): Sunday = 0
const EVENING_HOUR = 17;
export const NIGHT_BOUNDARY_HOUR = 4;
// A picked day's stamp: evening, so it's "Tonight" on its night, and clear of
// NIGHT_BOUNDARY_HOUR, so it can't drift onto the previous night.
const PICKED_SESSION_HOUR = 20;

export function startOfNight(date: Date): Date {
  const d = new Date(date);
  d.setHours(d.getHours() - NIGHT_BOUNDARY_HOUR);
  d.setHours(0, 0, 0, 0);
  return d;
}

function nightsBetween(then: Date, now: Date): number {
  return Math.round((startOfNight(now).getTime() - startOfNight(then).getTime()) / 86_400_000);
}

function isEvening(date: Date): boolean {
  const h = date.getHours();
  return h >= EVENING_HOUR || h < NIGHT_BOUNDARY_HOUR;
}

// The same night arithmetic as the home list, so a night still running at 00:30
// stays live exactly as long as it stays "Tonight". A pending serverTimestamp
// (null) is a session just created, never a past one.
export function isPastNight(date: Date | null, now = new Date()): boolean {
  return date !== null && nightsBetween(date, now) > 0;
}

export function sessionDateLabel(date: Date | null, now = new Date()): string {
  if (!date) return "";
  const days = nightsBetween(date, now);

  if (days === 0) return isEvening(date) ? "Tonight" : "Today";
  if (days === 1) return "Yesterday";
  if (days === -1) return "Tomorrow";
  // A date, not "Next Tuesday": to a weekly club that says nothing. The list's
  // headings carry the tense.

  const sameYear = date.getFullYear() === now.getFullYear();
  const stamp = sameYear ? DAY_MONTH_FORMAT.format(date) : FULL_DATE_FORMAT.format(date);
  return date.getDay() === CLUB_WEEKDAY ? stamp : `${WEEKDAY_FORMAT.format(date)} ${stamp}`;
}

const capitalise = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/**
 * A past night's title: how long ago, while that's what you'd say ("Yesterday",
 * "3 weeks ago"), then the date, since "2 months ago" four times running tells
 * the nights apart no better than nothing.
 */
export function pastSessionTitle(date: Date, now = new Date()): string {
  const days = nightsBetween(date, now);
  if (days < 7) return capitalise(RELATIVE_FORMAT.format(-days, "day"));
  if (days < 56) return capitalise(RELATIVE_FORMAT.format(-Math.floor(days / 7), "week"));
  return sessionDateLabel(date, now);
}

/** A calendar tile's two lines. */
export function dateTile(date: Date): { weekday: string; day: string } {
  return { weekday: WEEKDAY_SHORT_FORMAT.format(date), day: String(date.getDate()) };
}

export interface MonthGroup<T> {
  /** "" for sessions still awaiting their server timestamp. */
  label: string;
  entries: T[];
}

/** Consecutive runs of the same month, in the given order. */
export function groupByMonth<T extends Pick<SessionEntry, "createdAt">>(
  entries: T[],
  now = new Date(),
): MonthGroup<T>[] {
  const groups: (MonthGroup<T> & { key: string })[] = [];
  for (const entry of entries) {
    const night = entry.createdAt && startOfNight(entry.createdAt);
    const key = night ? `${night.getFullYear()}-${night.getMonth()}` : "";
    const last = groups.at(-1);
    if (last && last.key === key) {
      last.entries.push(entry);
      continue;
    }
    const label = !night
      ? ""
      : night.getFullYear() === now.getFullYear()
        ? MONTH_FORMAT.format(night)
        : MONTH_YEAR_FORMAT.format(night);
    groups.push({ key, label, entries: [entry] });
  }
  return groups.map(({ label, entries }) => ({ label, entries }));
}

export function pageTitle(label: string | null | undefined): string {
  return label ? `${label} · Setlister` : "Setlister · Ukulele Tuesday";
}

// Disambiguates at render time: suffixing at create time would cost a round
// trip and race two phones creating at once.
export function sessionTimeLabel(date: Date | null): string {
  return date ? TIME_FORMAT.format(date) : "";
}

/** The whole date, never relative: where "Tonight" would hide which night it is. */
export function sessionLongDate(date: Date | null): string {
  return date ? `${WEEKDAY_FORMAT.format(date)} ${FULL_DATE_FORMAT.format(date)}` : "";
}

// <input type="date"> bridge, in local time: toISOString() and
// new Date("YYYY-MM-DD") are both UTC, so they land on the wrong day.
export function toDateInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function fromDateInputValue(value: string | null | undefined): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || "");
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), PICKED_SESSION_HOUR);
}

export function disambiguate<T extends Pick<SessionEntry, "createdAt">>(
  entries: T[],
  now = new Date(),
): LabelledEntry<T>[] {
  const labelled = entries.map((entry) => ({
    ...entry,
    label: sessionDateLabel(entry.createdAt, now),
  }));
  const counts = new Map<string, number>();
  for (const entry of labelled) {
    counts.set(entry.label, (counts.get(entry.label) || 0) + 1);
  }
  return labelled.map((entry) =>
    (counts.get(entry.label) ?? 0) > 1 && entry.createdAt
      ? { ...entry, label: `${entry.label} · ${sessionTimeLabel(entry.createdAt)}` }
      : entry,
  );
}

// Expects newest-first (listSessions), so reversing makes upcoming soonest-first.
export function partitionSessions<T extends Pick<SessionEntry, "createdAt">>(
  entries: T[],
  now = new Date(),
): { upcoming: T[]; past: T[] } {
  const upcoming: T[] = [];
  const past: T[] = [];
  for (const entry of entries) {
    if (entry.createdAt && !isPastNight(entry.createdAt, now)) upcoming.push(entry);
    else past.push(entry);
  }
  upcoming.reverse();
  return { upcoming, past };
}

export function plannedSessionMessage(
  entry: Pick<SessionEntry, "createdAt">,
  now = new Date(),
  offerUnlisted = features.unlistedSessions,
): string {
  const label = sessionDateLabel(entry.createdAt, now) || "an upcoming night";
  const open = `A session is already planned for ${label}. Open it from the home screen`;
  return offerUnlisted
    ? `${open}, or set Visibility to Unlisted to start a private session.`
    : `${open}.`;
}

// Must pass firestore.rules: createdBy <= 60 chars, createdAt <= 60 days ahead.
// No blurb key when empty: production's rules reject it until they're deployed.
export function indexEntryData(
  { createdBy, createdAt, blurb }: { createdBy?: unknown; createdAt?: Date | null; blurb?: string },
  fx: { serverTimestamp(): unknown; Timestamp: { fromDate(date: Date): unknown } },
) {
  const note = cleanBlurb(blurb || "");
  return {
    v: 1,
    createdBy: String(createdBy || "").slice(0, 60),
    createdAt: createdAt ? fx.Timestamp.fromDate(createdAt) : fx.serverTimestamp(),
    ...(note && { blurb: note }),
  };
}

function toEntry(id: string, data: unknown): SessionEntry {
  const doc = (data ?? {}) as Record<string, unknown>;
  return {
    id,
    createdBy: typeof doc.createdBy === "string" ? doc.createdBy : "",
    createdAt: timestampToDate(doc.createdAt),
    blurb: typeof doc.blurb === "string" ? doc.blurb : "",
  };
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Timed out talking to Firestore")), ms),
    ),
  ]);
}

export async function listSessions({ max = DEFAULT_MAX } = {}): Promise<SessionEntry[]> {
  const { db, fx } = await getFirestore();
  const snap = await withTimeout(
    fx.getDocs(
      fx.query(fx.collection(db, INDEX_COLLECTION), fx.orderBy("createdAt", "desc"), fx.limit(max)),
    ),
    LIST_TIMEOUT_MS,
  );
  // Offline, Firestore answers from its empty cache rather than rejecting, which
  // would read as "No sessions yet".
  if (snap.metadata.fromCache) {
    throw new Error("Couldn’t reach Firestore. Showing no sessions would be a lie");
  }
  return snap.docs.map((d) => toEntry(d.id, d.data()));
}
