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

// One formatter, reused: `Intl` is the whole date dependency. Device locale, so
// the name reads naturally wherever it's minted — and the FORMATTED STRING is
// what gets stored, never recomputed, so a name minted on an en-GB phone stays
// "Tuesday 4 August 2026" for everyone who sees it later.
const NAME_FORMAT = new Intl.DateTimeFormat(undefined, {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});

const TIME_FORMAT = new Intl.DateTimeFormat(undefined, {
  hour: "2-digit",
  minute: "2-digit",
});

export function defaultSessionName(date = new Date()) {
  return NAME_FORMAT.format(date);
}

// Used to tell apart two sessions started on the same day. Cheaper than
// suffixing at create time, which would cost a round trip on the critical path
// (and race two phones creating at once) for a name the user can edit anyway.
export function sessionTimeLabel(date) {
  return date ? TIME_FORMAT.format(date) : "";
}

// Sessions named the same thing are indistinguishable in the list, so append
// the start time to each member of a same-name run. Only the duplicates get the
// suffix — a lone "Tuesday 4 August 2026" stays clean.
export function disambiguate(entries) {
  const counts = new Map();
  for (const entry of entries) {
    counts.set(entry.name, (counts.get(entry.name) || 0) + 1);
  }
  return entries.map((entry) => {
    if (counts.get(entry.name) > 1 && entry.createdAt) {
      return { ...entry, label: `${entry.name} · ${sessionTimeLabel(entry.createdAt)}` };
    }
    return { ...entry, label: entry.name };
  });
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

// Heal history: sessions created before #77 have no listing row, so opening an
// old share link quietly writes one. They drift into the club's list as people
// touch them, instead of staying invisible forever. Best-effort — a failure
// here must never block opening the session.
export async function ensureIndexEntry(id, meta) {
  try {
    if (await getSessionMeta(id)) return;
    await putIndexEntry(id, meta);
  } catch {
    /* offline, denied, or racing another client that just wrote it */
  }
}
