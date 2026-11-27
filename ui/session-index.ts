// `sessionIndex/{id}` exists because the web SDK has no field projection:
// listing `sessions` would download every night's rows on every app open.
// Writes live in sync.ts, batched with the session's `listed` flag.

import { getFirestore } from "./firebase.js";

export interface SessionEntry {
  id: string;
  createdBy: string;
  createdAt: Date | null;
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

export function pageTitle(label: string | null | undefined): string {
  return label ? `${label} · Setlister` : "Setlister · Ukulele Tuesday";
}

// Disambiguates at render time: suffixing at create time would cost a round
// trip and race two phones creating at once.
export function sessionTimeLabel(date: Date | null): string {
  return date ? TIME_FORMAT.format(date) : "";
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
    if (entry.createdAt && nightsBetween(entry.createdAt, now) <= 0) upcoming.push(entry);
    else past.push(entry);
  }
  upcoming.reverse();
  return { upcoming, past };
}

export function plannedSessionMessage(
  entry: Pick<SessionEntry, "createdAt">,
  now = new Date(),
): string {
  const label = sessionDateLabel(entry.createdAt, now) || "an upcoming night";
  return (
    `A session is already planned for ${label}. Open it from the home screen, ` +
    `or set Visibility to Unlisted to start a private session.`
  );
}

// Must pass firestore.rules: createdBy <= 60 chars, createdAt <= 60 days ahead.
export function indexEntryData(
  { createdBy, createdAt }: { createdBy?: unknown; createdAt?: Date | null },
  fx: { serverTimestamp(): unknown; Timestamp: { fromDate(date: Date): unknown } },
) {
  return {
    v: 1,
    createdBy: String(createdBy || "").slice(0, 60),
    createdAt: createdAt ? fx.Timestamp.fromDate(createdAt) : fx.serverTimestamp(),
  };
}

function toEntry(id: string, data: unknown): SessionEntry {
  const doc = (data ?? {}) as Record<string, unknown>;
  return {
    id,
    createdBy: typeof doc.createdBy === "string" ? doc.createdBy : "",
    createdAt: timestampToDate(doc.createdAt),
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
