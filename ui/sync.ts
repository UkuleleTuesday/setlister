// Conflict model: last-write-wins per row and per order array, per-leaf merge
// for votes (see diff). Only organisers push the debounced diff; the room
// writes nothing but the two updates firestore.rules allows (see Room writes).
//
// firestore.rules checks the doc with hasOnly: a new field needs its rules
// entry in the same change. Metadata (createdBy, listed, blurb, requests*) stays out
// of serialize()/diff() so the debounced row push never touches it.
//
// Default in-memory cache: offline writes flush on reconnect, not after a reload.

import type { Firestore, Unsubscribe } from "firebase/firestore";
import { parseEdition } from "./editions.js";
import { type Fx, getFirestore } from "./firebase.js";
import { isRow } from "./row-shape.js";
import { generateSessionId } from "./session-id.js";
import { INDEX_COLLECTION, cleanBlurb, indexEntryData, timestampToDate } from "./session-index.js";
import type {
  Edition,
  ListState,
  RequestsSwitch,
  Row,
  SessionMeta,
  SyncFields,
  Votes,
} from "./types.js";

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

// Coalesces a drag's burst of moves, or rapid taps, into one write.
const PUSH_DEBOUNCE_MS = 300;

const MAX_ID_ATTEMPTS = 5;

// --- Module state ----------------------------------------------------------
let sessionId: string | null = null;
let unsubscribe: Unsubscribe | null = null;
// diff()'s base: the last state applied or pushed, as stored.
let lastRemote: SyncFields | null = null;
let applyState: ApplyState | null = null;

let pushTimer: ReturnType<typeof setTimeout> | null = null;
let pendingState: LocalState | null = null;

// During drags and swipes a snapshot is stashed until release, so a re-render
// can't yank the row from under the finger.
let gestureActive = false;
let deferredSnapshot: unknown = null;

let statusCallback: ((status: SyncStatus) => void) | null = null;
let metaCallback: ((meta: SessionMeta) => void) | null = null;

const EMPTY_META: SessionMeta = {
  createdBy: "",
  listed: false,
  blurb: "",
  requestsOpen: null,
  requestsOpensAt: null,
  requestsClosesAt: null,
  legacy: false,
};
let meta: SessionMeta = { ...EMPTY_META };

// The server's createdAt, copied into index rows: a fresh serverTimestamp on
// re-listing would re-date an old night as tonight.
let sessionCreatedAt: Date | null = null;

export function getCreatedAt(): Date | null {
  return sessionCreatedAt;
}

function asDoc(data: unknown): Record<string, unknown> {
  return data && typeof data === "object" ? (data as Record<string, unknown>) : {};
}

function readCreatedAt(data: unknown): Date | null {
  return timestampToDate(asDoc(data).createdAt);
}

// --- Status --------------------------------------------------------------
export function onStatusChange(cb: (status: SyncStatus) => void): void {
  statusCallback = cb;
}

function emitStatus(payload: SyncStatus): void {
  if (statusCallback) statusCallback(payload);
}

// --- Session metadata ------------------------------------------------------
export function onMetaChange(cb: (meta: SessionMeta) => void): void {
  metaCallback = cb;
}

export function getMeta(): SessionMeta {
  return { ...meta };
}

export function readMeta(data: unknown): SessionMeta {
  const doc = asDoc(data);
  return {
    createdBy: typeof doc.createdBy === "string" ? doc.createdBy : "",
    listed: doc.listed === true,
    blurb: typeof doc.blurb === "string" ? doc.blurb : "",
    requestsOpen: doc.requestsOpen === true ? true : doc.requestsOpen === false ? false : null,
    requestsOpensAt: timestampToDate(doc.requestsOpensAt),
    requestsClosesAt: timestampToDate(doc.requestsClosesAt),
    // Not the same as `listed: false`: backfillListing() firing on that would
    // re-list an unlisted night whenever its share link is opened.
    legacy: !data || !("listed" in doc),
  };
}

function emitMeta(data: unknown): void {
  const next = readMeta(data);
  const changed =
    next.createdBy !== meta.createdBy ||
    next.listed !== meta.listed ||
    next.blurb !== meta.blurb ||
    next.requestsOpen !== meta.requestsOpen ||
    next.requestsOpensAt?.getTime() !== meta.requestsOpensAt?.getTime() ||
    next.requestsClosesAt?.getTime() !== meta.requestsClosesAt?.getTime();
  meta = next;
  if (changed && metaCallback) metaCallback({ ...meta });
}

// Lists a pre-visibility session when it's opened. Legacy only: a deliberately
// unlisted session has no index row either (see readMeta).
export async function backfillListing(): Promise<void> {
  if (!sessionId || !meta.legacy) return;
  const id = sessionId;
  try {
    const { db, fx } = await getFirestore();
    if (sessionId !== id) return; // left while awaiting the SDK
    const indexRef = fx.doc(db, INDEX_COLLECTION, id);
    if ((await fx.getDoc(indexRef)).exists()) return; // another client got there first
    // One batch: an index row without `listed: true` reads as "Unlisted".
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

// A concurrent move+edit merge can leave the order arrays and row map
// disagreeing: heal it here rather than lose songs; the next push fixes the doc.
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
  return { upNext, requests, edition, votes };
}

// Unchecked, for diff()'s base only: whatever parseSyncFields() skips is then
// deleted by the next push.
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

// votes.ts validates votes.
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
// Ids have only ~10k combos, so claim one in a transaction and retry on a
// collision. A listed session's index row goes in the same transaction.
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
          // No requests* fields: absent reads as auto. PR previews run against
          // production's rules, where one unknown key fails hasOnly and so
          // breaks "New session"; keep new fields out of this write.
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
  if (!id) throw new Error("Session id was not allocated");

  sessionId = id;
  applyState = applyStateFn;
  lastRemote = deepCopy(serialized);
  meta = next;
  // Until the server's stamp echoes back, now is close enough.
  sessionCreatedAt = pickedAt ?? new Date();
  attachListener(db, fx);
  emitStatus({ status: "connected", id });
  if (metaCallback) metaCallback({ ...meta });
  return id;
}

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
// Advertising, not access control: an unlisted session stays readable by id.
export async function setSessionListed(listed: boolean): Promise<void> {
  if (!sessionId) return;
  const id = sessionId;
  const { db, fx } = await getFirestore();
  const batch = fx.writeBatch(db);
  batch.update(fx.doc(db, "sessions", id), { listed, updatedAt: fx.serverTimestamp() });
  const indexRef = fx.doc(db, INDEX_COLLECTION, id);
  if (listed) {
    batch.set(
      indexRef,
      indexEntryData(
        { createdBy: meta.createdBy, createdAt: sessionCreatedAt, blurb: meta.blurb },
        fx,
      ),
    );
  } else {
    batch.delete(indexRef);
  }
  await batch.commit();
  meta = { ...meta, listed };
}

// Mirrored onto the index row, which is all home reads. Empty deletes the field.
export async function setSessionBlurb(text: string): Promise<void> {
  if (!sessionId) return;
  const id = sessionId;
  const blurb = cleanBlurb(text);
  const { db, fx } = await getFirestore();
  const value = blurb || fx.deleteField();
  const batch = fx.writeBatch(db);
  batch.update(fx.doc(db, "sessions", id), { blurb: value, updatedAt: fx.serverTimestamp() });
  // update(), not set(): a set's Date-precision createdAt can fail the rules'
  // equality check against a server timestamp. A legacy night has no row yet.
  if (meta.listed) batch.update(fx.doc(db, INDEX_COLLECTION, id), { blurb: value });
  await batch.commit();
  meta = { ...meta, blurb };
}

// Honour-system: firestore.rules can't tell a room device from an organiser's,
// so this closes the request link, not the session. "auto" deletes the field.
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

// A missing boundary deletes its override, falling back to the derived default.
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
      // Skip the echo of our own optimistic writes: it could clobber newer
      // local state.
      if (snap.metadata.hasPendingWrites) return;

      if (!snap.exists()) {
        // Rules deny client deletes, but say so rather than silently stop syncing.
        const goneId = sessionId;
        teardown();
        emitStatus({ status: "expired", id: goneId });
        return;
      }

      const remote = snap.data();
      if (gestureActive) {
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
// Must match what firestore.rules' isRoomWrite accepts from a non-organiser.
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
  if (!sessionId) return; // left while awaiting the SDK

  const updates = diff(lastRemote, current, fx);
  if (!updates) return;

  updates.updatedAt = fx.serverTimestamp();
  // Legacy docs (before #77) carry a TTL field; strip it so the TTL policy
  // can't sweep them.
  updates.expiresAt = fx.deleteField();
  // Optimistic: the echo snapshot is skipped, so lastRemote advances here.
  lastRemote = deepCopy(current);

  try {
    const ref = fx.doc(db, "sessions", sessionId);
    await fx.updateDoc(ref, updates);
  } catch (err) {
    emitStatus({ status: "error", error: err });
  }
}

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
  // Votes go out per leaf: Firestore merges nested paths, so a room voting one
  // song at once keeps every vote; a whole-map write would keep only the last.
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
