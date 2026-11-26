// Realtime sync for shared sessions (epic #25).
//
// Mirrors the night's synced state (the two lists, edition and votes) to one
// Firestore document at `sessions/{id}` and applies remote changes back live.
// UI-free: live.ts, routing.ts and the actions drive it through the exports.
//
// It is also the parse boundary for the session doc: Firestore data enters as
// `unknown` through parseSyncFields() / readMeta() / readCreatedAt(), and
// leaves as the shapes in types.ts. Only diff()'s base reads raw doc fields
// (see rawSyncFields).
//
// firestore.rules (#26) validates the doc's schema: adding a field here means
// adding it to the rules' hasOnly list in the same change:
//   { v: 1, rows: {uid: Row}, upNextOrder: [uid], requestsOrder: [uid],
//     edition, votes: {uid: {clientId: true}}, createdBy, listed, requestsOpen,
//     requestsOpensAt, requestsClosesAt, createdAt, updatedAt }
//
// `createdBy` / `listed` / `requestsOpen` / `requestsOpensAt` /
// `requestsClosesAt` are session METADATA (#77, #86, #127), not list state:
// they're deliberately outside serialize()/parseSyncFields()/diff() so the
// debounced row push never touches them, and their own small helpers write
// them. A listed session also has a `sessionIndex/{id}` row (see
// session-index.ts) written in the same transaction that mints the session.
// Sessions have no names: their identity is `createdAt`, rendered live (legacy
// docs may carry a `name` field, which is tolerated and ignored).
//
// Sessions have no expiry. Docs created before #77 may carry an
// `expiresAt` TTL field, stripped on their next push (see flushPush).
//
// Firebase loads lazily through firebase.ts (#27): importing this module
// doesn't pull the Firestore SDK; the first getFirestore() call does. ids
// come from session-id.ts (#28).
//
// Conflict model (accepted per the epic): per-row last-write-wins for row
// content, whole-array last-write-wins for the two order arrays, per-leaf
// merge for votes (see diff).
//
// Only organiser phones push the debounced diff. The room writes nothing but
// the two narrow updates firestore.rules allows it (addRoomRequest,
// setRoomVote) and takes everything else from snapshots.
//
// Firestore's default in-memory cache, not persistentLocalCache: writes made
// while briefly offline queue in memory and flush on reconnect, enough for a
// live-in-the-room session. persistentLocalCache (surviving a reload while
// offline) is a possible follow-up.

import type { Firestore, Unsubscribe } from "firebase/firestore";
import { parseEdition } from "./editions.js";
import { type Fx, getFirestore } from "./firebase.js";
import { isRow } from "./row-shape.js";
import { generateSessionId } from "./session-id.js";
import { INDEX_COLLECTION, indexEntryData, timestampToDate } from "./session-index.js";
import type {
  Edition,
  ListState,
  RequestsSwitch,
  Row,
  SessionMeta,
  SyncFields,
  Votes,
} from "./types.js";

/** What the app hands over to push: votes and edition may be missing. */
export type LocalState = Pick<ListState, "upNext" | "requests"> &
  Partial<Pick<ListState, "edition" | "votes">>;

export type ApplyState = (state: ListState) => void;

export type SyncStatus =
  | { status: "connected"; id: string }
  | { status: "expired"; id: string | null }
  | { status: "left" }
  | { status: "error"; error: unknown };

/** An updateDoc payload: dotted field paths to values or sentinels. */
export type Updates = Record<string, unknown>;

// Coalesce a burst of local mutations (e.g. a drag that fires many moves, or
// rapid taps) into a single remote write.
const PUSH_DEBOUNCE_MS = 300;

const MAX_ID_ATTEMPTS = 5;

// --- Module state ----------------------------------------------------------
let sessionId: string | null = null;
let unsubscribe: Unsubscribe | null = null;
// A deep copy of the last server state we applied or pushed, in serialized
// shape (SyncFields). The push diff compares against this so a single toggle
// writes only that row's path.
let lastRemote: SyncFields | null = null;
// Hands fresh remote state to the app (live.ts's applyRemoteState). Shared by
// the snapshot listener and the gesture-deferral flush.
let applyState: ApplyState | null = null;

let pushTimer: ReturnType<typeof setTimeout> | null = null;
let pendingState: LocalState | null = null;

// True during drags and swipes, so an incoming snapshot doesn't yank the row
// out from under the finger; the snapshot is stashed and applied when the
// gesture ends (setGestureActive).
let gestureActive = false;
let deferredSnapshot: unknown = null;

let statusCallback: ((status: SyncStatus) => void) | null = null;
let metaCallback: ((meta: SessionMeta) => void) | null = null;

// The session's metadata as last seen on the server (or just written), so
// getMeta() answers without a re-read and setSessionListed() /
// backfillListing() know what to copy into an index row.
const EMPTY_META: SessionMeta = {
  createdBy: "",
  listed: false,
  // Tri-state (#127): true = forced open, false = forced closed, null = auto
  // (follow requestsOpensAt/requestsClosesAt below, see request-window.ts).
  requestsOpen: null,
  requestsOpensAt: null,
  requestsClosesAt: null,
  legacy: false,
};
let meta: SessionMeta = { ...EMPTY_META };

// When the session was created, per the server. The history list is dated from
// this, so it must survive a session being listed/un-listed/re-listed: a fresh
// serverTimestamp would re-date an old night to the top of the history,
// claiming to be tonight.
let sessionCreatedAt: Date | null = null;

export function getCreatedAt(): Date | null {
  return sessionCreatedAt;
}

// A plain object to read fields off, or an empty one: snapshot data is
// unvalidated, so `null`, arrays and primitives must all read as "no fields".
function asDoc(data: unknown): Record<string, unknown> {
  return data && typeof data === "object" ? (data as Record<string, unknown>) : {};
}

function readCreatedAt(data: unknown): Date | null {
  return timestampToDate(asDoc(data).createdAt);
}

// --- Status --------------------------------------------------------------
// live.ts follows this. Payload shapes:
//   { status: "connected", id }   create/join succeeded, listener attached
//   { status: "expired", id }     remote doc vanished (it was deleted)
//   { status: "left" }            leaveSession()
//   { status: "error", error }    snapshot/write error
export function onStatusChange(cb: (status: SyncStatus) => void): void {
  statusCallback = cb;
}

function emitStatus(payload: SyncStatus): void {
  if (statusCallback) statusCallback(payload);
}

// --- Session metadata ------------------------------------------------------
// Metadata travels on the session doc but outside the synced list state, so
// it gets its own channel: the snapshot listener emits it whenever it
// changes, which is what makes a peer's toggle land live.
export function onMetaChange(cb: (meta: SessionMeta) => void): void {
  metaCallback = cb;
}

export function getMeta(): SessionMeta {
  return { ...meta };
}

// Exported for ui/tests: the legacy-vs-explicitly-false distinction below is the
// whole of whether Unlisted works, and it is worth pinning down.
export function readMeta(data: unknown): SessionMeta {
  const doc = asDoc(data);
  return {
    createdBy: typeof doc.createdBy === "string" ? doc.createdBy : "",
    listed: doc.listed === true,
    // Tri-state (#127): true/false are a deliberate override (forced open or
    // closed, regardless of the window); absent (or any other value) is AUTO,
    // resolved against the window in request-window.ts. Sessions that predate
    // the field read as auto too, so a finished night reads as closed.
    requestsOpen: doc.requestsOpen === true ? true : doc.requestsOpen === false ? false : null,
    requestsOpensAt: timestampToDate(doc.requestsOpensAt),
    requestsClosesAt: timestampToDate(doc.requestsClosesAt),
    // A session created before visibility existed has NO `listed` field, which
    // is emphatically not the same as an explicit `false`. Collapsing the two
    // would make backfillListing() fire on both, so opening an *unlisted*
    // session's own share link would re-advertise it to the whole club.
    legacy: !data || !("listed" in doc),
  };
}

function emitMeta(data: unknown): void {
  const next = readMeta(data);
  const changed =
    next.createdBy !== meta.createdBy ||
    next.listed !== meta.listed ||
    next.requestsOpen !== meta.requestsOpen ||
    next.requestsOpensAt?.getTime() !== meta.requestsOpensAt?.getTime() ||
    next.requestsClosesAt?.getTime() !== meta.requestsClosesAt?.getTime();
  meta = next;
  if (changed && metaCallback) metaCallback({ ...meta });
}

// Sessions from before visibility existed have no listing row, so opening an
// old share link quietly writes one and marks the session listed: they drift
// into the club's history as people touch them.
//
// Only LEGACY sessions. A session someone deliberately created Unlisted has
// `listed: false` and no row either, and must stay that way; see readMeta.
export async function backfillListing(): Promise<void> {
  if (!sessionId || !meta.legacy) return;
  const id = sessionId;
  try {
    const { db, fx } = await getFirestore();
    if (sessionId !== id) return; // left while awaiting the SDK
    const indexRef = fx.doc(db, INDEX_COLLECTION, id);
    if ((await fx.getDoc(indexRef)).exists()) return; // another client got there first
    // Both documents together: a listing row without the session flag would
    // make the share panel say "Unlisted" for a session plainly in the list.
    const batch = fx.writeBatch(db);
    batch.update(fx.doc(db, "sessions", id), { listed: true });
    batch.set(
      indexRef,
      indexEntryData({ createdBy: meta.createdBy, createdAt: sessionCreatedAt }, fx),
    );
    await batch.commit();
  } catch {
    /* offline, denied, or racing another client: the next open retries */
  }
}

export function getSessionId(): string | null {
  return sessionId;
}

// --- Serialization ---------------------------------------------------------
// App state {upNext, requests, edition, votes} <-> the Firestore doc's row map
// + two order arrays. Rows carry stable uids and embed their catalogue match,
// so the map is self-contained.
export function serialize(state: LocalState): SyncFields {
  const rows: Record<string, Row> = {};
  for (const row of state.upNext) rows[row.uid] = row;
  for (const row of state.requests) rows[row.uid] = row;
  return {
    rows,
    upNextOrder: state.upNext.map((row) => row.uid),
    requestsOrder: state.requests.map((row) => row.uid),
    edition: state.edition ?? null,
    votes: state.votes ?? {},
  };
}

// Defensive by design: order arrays and the row map can disagree after a
// concurrent move+edit merge (per-row + whole-array LWW). Drop order uids with
// no row, dedupe, and append any orphan rows (in neither order array) to
// requests so nothing silently disappears; the next push heals the doc.
// Exported for ui/tests: this healing is the safety net that stops a merge
// losing songs, and it's worth pinning down without a live Firestore.
export function deserialize(remote: unknown): ListState {
  const { rows, upNextOrder, requestsOrder, edition, votes } = parseSyncFields(remote);
  const seen = new Set<string>();
  const take = (order: string[]) => {
    const out: Row[] = [];
    for (const uid of order) {
      if (rows[uid] && !seen.has(uid)) {
        seen.add(uid);
        out.push(rows[uid]);
      }
    }
    return out;
  };
  const upNext = take(upNextOrder);
  const requests = take(requestsOrder);
  for (const uid of Object.keys(rows)) {
    if (!seen.has(uid)) {
      seen.add(uid);
      requests.push(rows[uid]);
    }
  }
  // Votes (#83) are keyed by row uid rather than living on the row, so they
  // ride alongside the lists rather than inside them. No healing needed: a vote
  // for a row that no longer exists simply counts for nothing.
  return { upNext, requests, edition, votes };
}

// The synced content as stored (no v, timestamps or metadata), contents
// unchecked. Only diff()'s base: keeping what parseSyncFields() skips lets the
// next push delete it.
function rawSyncFields(data: unknown): SyncFields {
  const doc = asDoc(data);
  const map = (value: unknown) => (value && typeof value === "object" ? value : {});
  return {
    rows: map(doc.rows) as Record<string, Row>,
    upNextOrder: Array.isArray(doc.upNextOrder) ? doc.upNextOrder : [],
    requestsOrder: Array.isArray(doc.requestsOrder) ? doc.requestsOrder : [],
    edition: (doc.edition ?? null) as Edition | null,
    votes: map(doc.votes) as Votes,
  };
}

// What the app runs on (#157): rows filed under their own uid, an edition with
// a string id. Bad entries are skipped, not repaired. votes.ts checks votes.
function parseSyncFields(data: unknown): SyncFields {
  const raw = rawSyncFields(data);
  const rows: Record<string, Row> = {};
  for (const [uid, row] of Object.entries(raw.rows as Record<string, unknown>)) {
    if (isRow(row) && row.uid === uid) rows[uid] = row;
  }
  return { ...raw, rows, edition: parseEdition(raw.edition) };
}

function deepCopy<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

// --- Create / join / leave -------------------------------------------------
// Generate an id and claim it atomically. Inside the transaction: read the
// candidate doc; if it already exists, regenerate and retry (ids are only
// ~10k combos, so collisions are rare but possible); otherwise write the full
// serialized state and return the id. `applyStateFn` powers the live listener.
//
// `sessionMeta.createdAt` is a Date only when the creator picked a day other
// than today; absent, the server stamps the moment of creation. Every night
// starts in auto mode on the default request window (see the tx.set below).
// When listed, the history row is written in the SAME transaction, so there can
// never be a session without its listing or a listing without its session.
export async function createSession(
  getState: () => LocalState,
  applyStateFn: ApplyState,
  sessionMeta: { createdBy?: string; listed?: boolean; createdAt?: Date | null },
): Promise<string> {
  const { db, fx } = await getFirestore();
  const serialized = serialize(getState());
  const next = readMeta(sessionMeta);
  const pickedAt = sessionMeta?.createdAt instanceof Date ? sessionMeta.createdAt : null;
  let id: string | null = null;

  await fx.runTransaction(db, async (tx) => {
    for (let attempt = 0; attempt < MAX_ID_ATTEMPTS; attempt++) {
      const candidate = generateSessionId();
      const ref = fx.doc(db, "sessions", candidate);
      const snap = await tx.get(ref);
      if (!snap.exists()) {
        tx.set(ref, {
          v: 1,
          rows: serialized.rows,
          upNextOrder: serialized.upNextOrder,
          requestsOrder: serialized.requestsOrder,
          edition: serialized.edition,
          createdBy: next.createdBy,
          listed: next.listed,
          // No `requestsOpen`, `requestsOpensAt` or `requestsClosesAt` here,
          // deliberately. Absent reads as auto (readMeta), and the default
          // window is derived from createdAt, so writing them would buy only
          // a dependency on the rules being live: firestore.rules deploys
          // from main while the UI also ships to PR previews, unordered, and
          // hasOnly rejects the WHOLE write over one unknown key, turning
          // "start a session" into a permission error. Each field appears on
          // its first explicit write (setRequestsMode / setRequestsWindow).
          createdAt: pickedAt ? fx.Timestamp.fromDate(pickedAt) : fx.serverTimestamp(),
          updatedAt: fx.serverTimestamp(),
        });
        if (next.listed) {
          tx.set(
            fx.doc(db, INDEX_COLLECTION, candidate),
            indexEntryData({ createdBy: next.createdBy, createdAt: pickedAt }, fx),
          );
        }
        id = candidate;
        return;
      }
    }
    throw new Error(`Could not allocate a free session id after ${MAX_ID_ATTEMPTS} tries`);
  });
  // The transaction either set `id` or threw.
  if (!id) throw new Error("Session id was not allocated");

  sessionId = id;
  applyState = applyStateFn;
  lastRemote = deepCopy(serialized);
  meta = next;
  // A picked date is the real value; on the server-stamped path, now is close
  // enough until the first snapshot echoes back (same evening either way).
  sessionCreatedAt = pickedAt ?? new Date();
  attachListener(db, fx);
  emitStatus({ status: "connected", id });
  if (metaCallback) metaCallback({ ...meta });
  return id;
}

// Error thrown by joinSession when the doc is missing (never created, or since
// deleted). Flagged so routing can show its "not found" copy instead of a raw
// error.
export class SessionNotFoundError extends Error {
  readonly notFound = true;
  readonly sessionId: string;

  constructor(id: string) {
    super(`Session "${id}" was not found (it may have been deleted)`);
    this.name = "SessionNotFoundError";
    this.sessionId = id;
  }
}

export async function joinSession(id: string, applyStateFn: ApplyState): Promise<void> {
  const { db, fx } = await getFirestore();
  const ref = fx.doc(db, "sessions", id);
  const snap = await fx.getDoc(ref);
  if (!snap.exists()) {
    throw new SessionNotFoundError(id);
  }
  const remote = snap.data();
  sessionId = id;
  applyState = applyStateFn;
  lastRemote = deepCopy(rawSyncFields(remote));
  applyStateFn(deserialize(remote));
  attachListener(db, fx);
  emitStatus({ status: "connected", id });
  meta = readMeta(remote);
  sessionCreatedAt = readCreatedAt(remote);
  if (metaCallback) metaCallback({ ...meta });
}

// --- Metadata writes -------------------------------------------------------
// List / un-list. Unlisted only removes the history row: the session is
// world-readable by id, exactly like every other session. This is
// advertising, not access control (see firestore.rules).
export async function setSessionListed(listed: boolean): Promise<void> {
  if (!sessionId) return;
  const id = sessionId;
  const { db, fx } = await getFirestore();
  const batch = fx.writeBatch(db);
  batch.update(fx.doc(db, "sessions", id), { listed, updatedAt: fx.serverTimestamp() });
  const indexRef = fx.doc(db, INDEX_COLLECTION, id);
  if (listed) {
    // Carry the session's REAL createdAt across (see sessionCreatedAt).
    batch.set(
      indexRef,
      indexEntryData({ createdBy: meta.createdBy, createdAt: sessionCreatedAt }, fx),
    );
  } else {
    batch.delete(indexRef);
  }
  await batch.commit();
  meta = { ...meta, listed };
}

// Force open / force closed / back to auto for the room's request link (#86,
// #127). No index row to keep in step, so a plain update; like `listed` it
// rides outside the debounced row push, and the snapshot listener carries the
// flip to every room phone on the session.
//
// Honour-system, deliberately: firestore.rules can't tell a room device from an
// organiser's, so this closes the door on the link, not on the session.
//
// "auto" deletes the field rather than writing a third sentinel: the same
// absent-means-X convention as the window overrides below.
export async function setRequestsMode(mode: RequestsSwitch): Promise<void> {
  if (!sessionId) return;
  const id = sessionId;
  const { db, fx } = await getFirestore();
  const value = mode === "open" ? true : mode === "closed" ? false : fx.deleteField();
  await fx.updateDoc(fx.doc(db, "sessions", id), {
    requestsOpen: value,
    updatedAt: fx.serverTimestamp(),
  });
  meta = { ...meta, requestsOpen: mode === "open" ? true : mode === "closed" ? false : null };
}

// Overrides the request window's smart default (#127, see request-window.ts).
// Either boundary may be omitted/null to clear it back to its derived
// default; the two resolve independently. Called only from the share panel,
// never from createSession (see the comment in its tx.set).
export async function setRequestsWindow({
  opensAt,
  closesAt,
}: { opensAt?: Date | null; closesAt?: Date | null } = {}): Promise<void> {
  if (!sessionId) return;
  const id = sessionId;
  const { db, fx } = await getFirestore();
  await fx.updateDoc(fx.doc(db, "sessions", id), {
    requestsOpensAt: opensAt ? fx.Timestamp.fromDate(opensAt) : fx.deleteField(),
    requestsClosesAt: closesAt ? fx.Timestamp.fromDate(closesAt) : fx.deleteField(),
    updatedAt: fx.serverTimestamp(),
  });
  meta = { ...meta, requestsOpensAt: opensAt ?? null, requestsClosesAt: closesAt ?? null };
}

// Stop listening and forget everything. Idempotent, so the snapshot listener
// can call it on remote deletion without recursing back through it.
function teardown(): void {
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }
  if (pushTimer) {
    clearTimeout(pushTimer);
    pushTimer = null;
  }
  sessionId = null;
  lastRemote = null;
  applyState = null;
  pendingState = null;
  deferredSnapshot = null;
  meta = { ...EMPTY_META };
  sessionCreatedAt = null;
}

export function leaveSession(): void {
  const had = sessionId !== null;
  teardown();
  if (had) emitStatus({ status: "left" });
}

// --- Apply (remote -> local) ----------------------------------------------
function attachListener(db: Firestore, fx: Fx): void {
  if (!sessionId) return;
  const ref = fx.doc(db, "sessions", sessionId);
  unsubscribe = fx.onSnapshot(
    ref,
    (snap) => {
      // Our own optimistic writes echo back as a snapshot first; skip them so
      // we don't re-apply (and clobber) state we already have locally.
      if (snap.metadata.hasPendingWrites) return;

      if (!snap.exists()) {
        // The doc was deleted remotely. With client deletes denied by the
        // rules this should be unreachable, but a session that silently stops
        // syncing is far worse than one that says so.
        const goneId = sessionId;
        teardown();
        emitStatus({ status: "expired", id: goneId });
        return;
      }

      const remote = snap.data();
      if (gestureActive) {
        // Defer: applying now would re-render mid-drag and yank the row.
        deferredSnapshot = remote;
        return;
      }
      applyRemote(remote);
    },
    (err) => {
      emitStatus({ status: "error", error: err });
    },
  );
}

function applyRemote(remote: unknown): void {
  lastRemote = deepCopy(rawSyncFields(remote));
  applyState?.(deserialize(remote));
  sessionCreatedAt = readCreatedAt(remote) ?? sessionCreatedAt;
  emitMeta(remote);
}

// Row.svelte and UpNextSection.svelte flip this around swipes and drags (via
// rowActions.gesture). On release, apply whatever snapshot arrived meanwhile
// so the two clients converge.
export function setGestureActive(active: boolean): void {
  gestureActive = active;
  if (!active && deferredSnapshot && sessionId) {
    const remote = deferredSnapshot;
    deferredSnapshot = null;
    applyRemote(remote);
  } else if (!active) {
    deferredSnapshot = null;
  }
}

/** The rules said no: for an organiser, the key changed. */
export function isPermissionDenied(err: unknown): boolean {
  return (err as { code?: unknown } | null)?.code === "permission-denied";
}

/** Re-read the doc after a denied write, so local state drops what didn't land. */
export async function refresh(): Promise<void> {
  if (!sessionId) return;
  const id = sessionId;
  const { db, fx } = await getFirestore();
  const snap = await fx.getDoc(fx.doc(db, "sessions", id));
  if (sessionId === id && snap.exists()) applyRemote(snap.data());
}

// --- Room writes -------------------------------------------------------------
// The only shapes firestore.rules (isRoomWrite) accepts from a non-organiser.
export function roomRequestUpdates(
  row: Row,
  clientId: string,
  fx: Pick<Fx, "arrayUnion" | "serverTimestamp">,
): Updates {
  return {
    [`rows.${row.uid}`]: row,
    requestsOrder: fx.arrayUnion(row.uid),
    [`votes.${row.uid}.${clientId}`]: true,
    updatedAt: fx.serverTimestamp(),
  };
}

export function roomVoteUpdates(
  uid: string,
  clientId: string,
  on: boolean,
  fx: Pick<Fx, "deleteField" | "serverTimestamp">,
): Updates {
  return {
    [`votes.${uid}.${clientId}`]: on ? true : fx.deleteField(),
    updatedAt: fx.serverTimestamp(),
  };
}

export async function addRoomRequest(row: Row, clientId: string): Promise<void> {
  await roomWrite((fx) => roomRequestUpdates(row, clientId, fx));
}

export async function setRoomVote(uid: string, clientId: string, on: boolean): Promise<void> {
  await roomWrite((fx) => roomVoteUpdates(uid, clientId, on, fx));
}

async function roomWrite(build: (fx: Fx) => Updates): Promise<void> {
  if (!sessionId) return;
  const id = sessionId;
  const { db, fx } = await getFirestore();
  await fx.updateDoc(fx.doc(db, "sessions", id), build(fx));
}

// --- Push (local -> remote) ------------------------------------------------
export function notifyLocalChange(state: LocalState): void {
  if (!sessionId) return;
  pendingState = state;
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    pushTimer = null;
    flushPush();
  }, PUSH_DEBOUNCE_MS);
}

async function flushPush(): Promise<void> {
  if (!sessionId || !pendingState) return;
  const state = pendingState;
  pendingState = null;

  const current = serialize(state);
  const { db, fx } = await getFirestore();
  // The session may have been left while getFirestore() awaited.
  if (!sessionId) return;

  const updates = diff(lastRemote, current, fx);
  if (!updates) return; // nothing actually changed: don't churn the doc

  updates.updatedAt = fx.serverTimestamp();
  // Strip the legacy TTL field from docs created before #77, so the TTL
  // policy can't sweep them. A no-op on docs without it, and it only rides
  // along with a real edit (diff() returned non-null above).
  updates.expiresAt = fx.deleteField();
  // Optimistic: assume the write lands so the next diff is against what we just
  // sent. The echo snapshot (hasPendingWrites) is skipped, so this is the only
  // place lastRemote advances on the push side.
  lastRemote = deepCopy(current);

  try {
    const ref = fx.doc(db, "sessions", sessionId);
    await fx.updateDoc(ref, updates);
  } catch (err) {
    emitStatus({ status: "error", error: err });
  }
}

// One updateDoc payload with dotted paths: changed/added rows as
// `rows.<uid>`, removed rows as deleteField(), order arrays only when changed.
// Returns null when nothing changed so the caller can skip the write entirely.
// Exported for ui/tests (a stub `fx` is enough to exercise it: diff only
// passes deleteField()'s sentinel through, so any value will do).
export function diff(
  prev: SyncFields | null,
  next: SyncFields,
  fx: { deleteField(): unknown },
): Updates | null {
  const updates: Updates = {};
  let changed = false;
  const prevRows = prev?.rows || {};
  const nextRows = next.rows || {};

  for (const uid of Object.keys(nextRows)) {
    if (JSON.stringify(nextRows[uid]) !== JSON.stringify(prevRows[uid])) {
      updates["rows." + uid] = nextRows[uid];
      changed = true;
    }
  }
  for (const uid of Object.keys(prevRows)) {
    if (!(uid in nextRows)) {
      updates["rows." + uid] = fx.deleteField();
      changed = true;
    }
  }
  if (JSON.stringify(prev?.upNextOrder) !== JSON.stringify(next.upNextOrder)) {
    updates.upNextOrder = next.upNextOrder;
    changed = true;
  }
  if (JSON.stringify(prev?.requestsOrder) !== JSON.stringify(next.requestsOrder)) {
    updates.requestsOrder = next.requestsOrder;
    changed = true;
  }
  if (JSON.stringify(prev?.edition) !== JSON.stringify(next.edition)) {
    updates.edition = next.edition;
    changed = true;
  }
  // Votes (#83) go out as individual leaves, `votes.<rowUid>.<clientId>`,
  // never as a whole map: Firestore merges nested paths per key, so everyone
  // voting the same song at once converges, where a wholesale write would be
  // last-writer-wins and lose all but one (see votes.ts). tests/rules.test.ts
  // proves the merge against the emulator.
  const prevVotes = prev?.votes || {};
  const nextVotes = next.votes || {};
  const voters = (map: Votes, uid: string) =>
    map[uid] && typeof map[uid] === "object" ? map[uid] : {};
  for (const uid of new Set([...Object.keys(prevVotes), ...Object.keys(nextVotes)])) {
    const before = voters(prevVotes, uid);
    const after = voters(nextVotes, uid);
    for (const clientId of Object.keys(after)) {
      if (!before[clientId]) {
        updates[`votes.${uid}.${clientId}`] = true;
        changed = true;
      }
    }
    for (const clientId of Object.keys(before)) {
      if (!after[clientId]) {
        updates[`votes.${uid}.${clientId}`] = fx.deleteField();
        changed = true;
      }
    }
  }
  return changed ? updates : null;
}
