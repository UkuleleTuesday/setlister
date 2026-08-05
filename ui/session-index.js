// The club's session history (#77).
//
// `sessionIndex/{id}` is a ~120-byte listing row per LISTED session, mirroring
// the id of the `sessions/{id}` doc it points at. The home screen queries this
// collection rather than `sessions` because the Firestore *web* SDK has no
// field projection (`select()` is server-side only): listing sessions directly
// would download every row of every night — and rows embed their full
// catalogue match — on every app open, forever.
//
//   { v: 1, name, createdBy, createdAt }
//
// Unlisted sessions simply have no doc here. That is NOT access control — the
// session stays world-readable by id like every other one (see
// firestore.rules). Unlisted means "not advertised in the club's list".
//
// UI-free, like sync.js and presence.js: app.js owns all DOM. Firebase still
// loads lazily through firebase.js, so importing this module pulls no SDK.

import { getFirestore } from "./firebase.js";

export const INDEX_COLLECTION = "sessionIndex";

// How many nights the home screen lists. ~60 is over a year of weekly clubs,
// which is deep enough that "show older" would be a feature nobody asks for.
const DEFAULT_MAX = 60;

// An unreachable Firestore leaves getDocs pending indefinitely (we use the
// default in-memory cache, so there's nothing local to resolve against). A
// spinner that never resolves is the worst failure mode on a phone at a gig, so
// the list query races a timeout and surfaces a retry instead.
const LIST_TIMEOUT_MS = 8000;

// `Intl` is the whole date dependency. Formatters are built against the
// VIEWER's locale at render time and nothing formatted is ever stored — which
// is the point: storing the formatted string (as this module used to) left one
// list mixing "Tuesday, August 4, 2026" from a US phone with
// "Tuesday 4 August 2026" from a UK one.
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

// The club plays on Tuesdays, so a weekday on a Tuesday session is pure noise
// on every row. On any OTHER night it's the most interesting thing about the
// date, so that's the only case that keeps it.
const CLUB_WEEKDAY = 2; // Date#getDay(): Sunday = 0
// The club is an evening thing; a session started after this reads as "tonight"
// rather than "today".
const EVENING_HOUR = 17;
// A night belongs to the evening it started, not to the calendar. Without this
// a session that kicks off at 21:00 and is still running at 00:30 — an entirely
// normal pub night — would relabel itself "Yesterday" while people are still
// adding songs to it.
const NIGHT_BOUNDARY_HOUR = 4;

// The start of the *night* `date` falls in, which is the previous calendar day
// for anything before 04:00.
function startOfNight(date) {
  const d = new Date(date);
  d.setHours(d.getHours() - NIGHT_BOUNDARY_HOUR);
  d.setHours(0, 0, 0, 0);
  return d;
}

function nightsBetween(then, now) {
  return Math.round((startOfNight(now) - startOfNight(then)) / 86_400_000);
}

function isEvening(date) {
  const h = date.getHours();
  return h >= EVENING_HOUR || h < NIGHT_BOUNDARY_HOUR;
}

// What a session is called when nobody has given it a name: a relative label
// near the present, an absolute date further back. `now` is injectable so the
// tests can pin the clock — every branch here is relative, and a test that
// reads the wall clock is a test that fails at midnight.
export function sessionDateLabel(date, now = new Date()) {
  if (!date) return "";
  const days = nightsBetween(date, now);

  if (days === 0) return isEvening(date) ? "Tonight" : "Today";
  if (days === 1) return "Yesterday";
  // Inside a week only one Tuesday can exist, so the bare weekday is
  // unambiguous — and it dodges the "last Tuesday means which Tuesday?"
  // argument that a "Last " prefix would start.
  if (days < 7) return WEEKDAY_FORMAT.format(date);

  const sameYear = date.getFullYear() === now.getFullYear();
  const stamp = sameYear ? DAY_MONTH_FORMAT.format(date) : FULL_DATE_FORMAT.format(date);
  return date.getDay() === CLUB_WEEKDAY ? stamp : `${WEEKDAY_FORMAT.format(date)} ${stamp}`;
}

// A session's display label: a title someone typed, else the date. Sessions
// created before naming moved to render time carry a stored full-date string;
// a non-empty name always wins, so those simply look manually named.
export function sessionLabel(entry, now = new Date()) {
  return entry?.name?.trim() || sessionDateLabel(entry?.createdAt, now);
}

// Used to tell apart two sessions started on the same day. Cheaper than
// suffixing at create time, which would cost a round trip on the critical path
// (and race two phones creating at once) for a name the user can edit anyway.
export function sessionTimeLabel(date) {
  return date ? TIME_FORMAT.format(date) : "";
}

// Sessions that render the same are indistinguishable in the list, so append
// the start time to each member of a matching run. Runs on the RENDERED label,
// not the stored name — two sessions the same evening both say "Tonight" while
// storing nothing at all. A label that's unique stays clean.
export function disambiguate(entries, now = new Date()) {
  const labelled = entries.map((entry) => ({ ...entry, label: sessionLabel(entry, now) }));
  const counts = new Map();
  for (const entry of labelled) {
    counts.set(entry.label, (counts.get(entry.label) || 0) + 1);
  }
  return labelled.map((entry) =>
    counts.get(entry.label) > 1 && entry.createdAt
      ? { ...entry, label: `${entry.label} · ${sessionTimeLabel(entry.createdAt)}` }
      : entry
  );
}

// The document shape, in one place, so sync.js can write an entry inside its
// id-claiming transaction without owning the schema. `createdAt` is passed in
// only when backfilling a session that already exists; otherwise the server
// stamps it (and firestore.rules rejects a future date either way).
export function indexEntryData({ name, createdBy, createdAt }, fx) {
  return {
    v: 1,
    name: String(name || "").slice(0, 80),
    createdBy: String(createdBy || "").slice(0, 60),
    createdAt: createdAt ? fx.Timestamp.fromDate(createdAt) : fx.serverTimestamp(),
  };
}

function toEntry(id, data) {
  return {
    id,
    name: typeof data?.name === "string" ? data.name : id,
    createdBy: typeof data?.createdBy === "string" ? data.createdBy : "",
    // Firestore hands back a Timestamp; a doc written moments ago by this
    // client can still have a null serverTimestamp locally.
    createdAt: data?.createdAt?.toDate ? data.createdAt.toDate() : null,
  };
}

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Timed out talking to Firestore")), ms)
    ),
  ]);
}

// Newest first — the night you want is almost always the most recent one.
export async function listSessions({ max = DEFAULT_MAX } = {}) {
  const { db, fx } = await getFirestore();
  const snap = await withTimeout(
    fx.getDocs(
      fx.query(
        fx.collection(db, INDEX_COLLECTION),
        fx.orderBy("createdAt", "desc"),
        fx.limit(max)
      )
    ),
    LIST_TIMEOUT_MS
  );
  // An unreachable server doesn't reject here — Firestore quietly answers from
  // its (empty, in-memory) cache, which would render as a confident "No
  // sessions yet". Telling a club its history is gone when we simply couldn't
  // ask is the worst thing this screen can do, so a cache-only answer is an
  // error, not an empty list.
  if (snap.metadata.fromCache) {
    throw new Error("Couldn’t reach Firestore — showing no sessions would be a lie");
  }
  return snap.docs.map((d) => toEntry(d.id, d.data()));
}

export async function getSessionMeta(id) {
  const { db, fx } = await getFirestore();
  const snap = await fx.getDoc(fx.doc(db, INDEX_COLLECTION, id));
  return snap.exists() ? toEntry(id, snap.data()) : null;
}

export async function putIndexEntry(id, meta) {
  const { db, fx } = await getFirestore();
  await fx.setDoc(fx.doc(db, INDEX_COLLECTION, id), indexEntryData(meta, fx));
}

export async function removeIndexEntry(id) {
  const { db, fx } = await getFirestore();
  await fx.deleteDoc(fx.doc(db, INDEX_COLLECTION, id));
}

export async function renameIndexEntry(id, name) {
  const { db, fx } = await getFirestore();
  await fx.updateDoc(fx.doc(db, INDEX_COLLECTION, id), {
    name: String(name || "").slice(0, 80),
  });
}

// Heal history: sessions created before session history shipped have no listing
// row, so opening an old share link quietly writes one. They drift into the
// club's list as people touch them, instead of staying invisible forever. The
// entry carries no name — the date renders from createdAt like any other.
// Best-effort: a failure here must never block opening the session.
export async function ensureIndexEntry(id, meta) {
  try {
    if (await getSessionMeta(id)) return;
    await putIndexEntry(id, meta);
  } catch {
    /* offline, denied, or racing another client that just wrote it */
  }
}
