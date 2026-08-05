// Core realtime sync engine for multiplayer session sharing (epic #25).
//
// This module mirrors the app's durable state (the two lists + edition) to a
// single Firestore document at `sessions/{id}` and applies remote changes back
// live. It is deliberately UI-free: app.js owns all DOM and drives it through
// a tiny API (the sharing UI from #30).
//
// The Firestore doc's schema is validated by firestore.rules (#26) — adding a
// field here means editing the rules' hasOnly list in the same change:
//   { v: 1, rows: {uid: Row}, upNextOrder: [uid], requestsOrder: [uid],
//     edition, createdBy, listed, createdAt, updatedAt }
//
// `createdBy` / `listed` are session METADATA (#77), not list state: they're
// deliberately outside serialize()/syncFields()/diff() so the debounced row
// push never touches them, and they're written by their own small helpers
// instead. A listed session also has a `sessionIndex/{id}` row (see
// session-index.js) written in the same transaction that mints the session.
// Sessions have no names: their identity is `createdAt`, rendered live (legacy
// docs may still carry a `name` field, which is tolerated and ignored).
//
// Sessions are kept forever, so nothing writes `expiresAt` any more; legacy
// docs get theirs stripped on first push (see flushPush).
//
// Firebase loads lazily through firebase.js (#27): importing this module does
// NOT pull the Firestore SDK — only the first create/join call does, via
// getFirestore(). ids come from session-id.js (#28).
//
// Conflict model (accepted per the epic): per-row last-write-wins for row
// content, whole-array last-write-wins for the two order arrays.
//
// We use Firestore's default (in-memory) cache rather than persistentLocalCache:
// writes made while briefly offline still queue in memory and flush on
// reconnect, which is enough for a live-in-the-room gig session. Swapping in
// persistentLocalCache (survives a full reload while offline) is a possible
// follow-up if that ever matters.

import { getFirestore } from "./firebase.js";
import { generateSessionId } from "./session-id.js";
import { INDEX_COLLECTION, indexEntryData } from "./session-index.js";

// Coalesce a burst of local mutations (e.g. a drag that fires many moves, or
// rapid taps) into a single remote write.
const PUSH_DEBOUNCE_MS = 300;

const MAX_ID_ATTEMPTS = 5;

// --- Module state ----------------------------------------------------------
let sessionId = null;
let unsubscribe = null;
// A deep copy of the last server state we applied or pushed, in serialized
// shape ({rows, upNextOrder, requestsOrder, edition}). The push diff compares
// against this so a single toggle writes only that row's path.
let lastRemote = null;
// Callback that writes a fresh {upNext, requests, edition} back into app.js,
// re-rendering + persisting. Shared by the snapshot listener and the
// gesture-deferral flush, so it is stored module-level.
let applyState = null;

let pushTimer = null;
let pendingState = null;

// app.js sets this true during drags/swipes so an incoming snapshot doesn't
// yank the row out from under the user's finger; the snapshot is stashed and
// applied when the gesture ends.
let gestureActive = false;
let deferredSnapshot = null;

let statusCallback = null;
let metaCallback = null;

// The session's display metadata as last seen on the server. Kept so the UI can
// ask without a re-read, and so setSessionListed() knows what to copy into a
// freshly created index row.
let meta = { createdBy: "", listed: false, legacy: false };

// When the session was created, per the server. The history list is dated from
// this, so it must survive a session being listed/un-listed/re-listed — writing
// a fresh serverTimestamp instead would make an old night claim to be tonight.
let sessionCreatedAt = null;

export function getCreatedAt() {
  return sessionCreatedAt;
}

function readCreatedAt(data) {
  return data?.createdAt?.toDate ? data.createdAt.toDate() : null;
}

// --- Status --------------------------------------------------------------
// #30 consumes this to reflect connection state in the UI. Payload shapes:
//   { status: "connected", id }   — create/join succeeded, listener attached
//   { status: "expired", id }     — remote doc vanished (it was deleted)
//   { status: "left" }            — leaveSession()
//   { status: "error", error }    — snapshot/write error
export function onStatusChange(cb) {
  statusCallback = cb;
}

function emitStatus(payload) {
  if (statusCallback) statusCallback(payload);
}

// --- Session metadata ------------------------------------------------------
// Creator / listed-ness travel on the session doc but outside the synced list
// state, so they get their own channel: the snapshot listener emits them
// whenever they change, which is what makes a peer's visibility toggle land
// live.
export function onMetaChange(cb) {
  metaCallback = cb;
}

export function getMeta() {
  return { ...meta };
}

// Exported for ui/tests: the legacy-vs-explicitly-false distinction below is the
// whole of whether Unlisted works, and it is worth pinning down.
export function readMeta(data) {
  return {
    createdBy: typeof data?.createdBy === "string" ? data.createdBy : "",
    listed: data?.listed === true,
    // A session created before visibility existed has NO `listed` field, which
    // is emphatically not the same as an explicit `false`. Collapsing the two is
    // how opening an *unlisted* session's own share link came to re-advertise it
    // to the whole club: with no way to tell "never had the field" from
    // "deliberately turned off", the backfill fired on both.
    legacy: !data || !("listed" in data),
  };
}

function emitMeta(data) {
  const next = readMeta(data);
  const changed = next.createdBy !== meta.createdBy || next.listed !== meta.listed;
  meta = next;
  if (changed && metaCallback) metaCallback({ ...meta });
}

// Sessions from before visibility existed have no listing row, so opening an old
// share link quietly writes one and marks the session listed — they drift into
// the club's history as people touch them instead of staying invisible.
//
// Only LEGACY sessions. A session someone deliberately created Unlisted has
// `listed: false` and no row either, and must stay that way; see readMeta.
export async function backfillListing() {
  if (!sessionId || !meta.legacy) return;
  const id = sessionId;
  try {
    const { db, fx } = await getFirestore();
    if (sessionId !== id) return; // left while awaiting the SDK
    const indexRef = fx.doc(db, INDEX_COLLECTION, id);
    if ((await fx.getDoc(indexRef)).exists()) return; // another client got there first
    // Both documents together: a listing row without the session flag is what
    // made the share panel claim "Unlisted" for a session plainly in the list.
    const batch = fx.writeBatch(db);
    batch.update(fx.doc(db, "sessions", id), { listed: true });
    batch.set(
      indexRef,
      indexEntryData({ createdBy: meta.createdBy, createdAt: sessionCreatedAt }, fx)
    );
    await batch.commit();
  } catch {
    /* offline, denied, or racing another client — the next open retries */
  }
}

export function getSessionId() {
  return sessionId;
}

// --- Serialization ---------------------------------------------------------
// App state {upNext, requests, edition} <-> the Firestore doc's row map + two
// order arrays. Rows carry stable uids and embed their catalogue match, so the
// map is self-contained.
export function serialize(state) {
  const rows = {};
  for (const row of state.upNext) rows[row.uid] = row;
  for (const row of state.requests) rows[row.uid] = row;
  return {
    rows,
    upNextOrder: state.upNext.map((row) => row.uid),
    requestsOrder: state.requests.map((row) => row.uid),
    edition: state.edition ?? null,
  };
}

// Defensive by design: order arrays and the row map can disagree after a
// concurrent move+edit merge (per-row + whole-array LWW). Drop order uids with
// no row, dedupe, and append any orphan rows (in neither order array) to
// requests so nothing silently disappears — the next push heals the doc.
// Exported for ui/tests: this healing is the safety net that stops a merge
// losing songs, and it's worth pinning down without a live Firestore.
export function deserialize(remote) {
  const rows = remote && typeof remote.rows === "object" && remote.rows ? remote.rows : {};
  const upNextOrder = Array.isArray(remote?.upNextOrder) ? remote.upNextOrder : [];
  const requestsOrder = Array.isArray(remote?.requestsOrder) ? remote.requestsOrder : [];
  const seen = new Set();
  const take = (order) => {
    const out = [];
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
  return { upNext, requests, edition: remote?.edition ?? null };
}

// The doc carries v/createdAt/updatedAt/expiresAt too; the diff only cares
// about the mutable content, so pull just those fields for `lastRemote`.
function syncFields(data) {
  return {
    rows: data && typeof data.rows === "object" && data.rows ? data.rows : {},
    upNextOrder: Array.isArray(data?.upNextOrder) ? data.upNextOrder : [],
    requestsOrder: Array.isArray(data?.requestsOrder) ? data.requestsOrder : [],
    edition: data?.edition ?? null,
  };
}

function deepCopy(obj) {
  return JSON.parse(JSON.stringify(obj));
}

// --- Create / join / leave -------------------------------------------------
// Generate an id and claim it atomically. Inside the transaction: read the
// candidate doc; if it already exists, regenerate and retry (ids are only
// ~10k combos, so collisions are rare but possible); otherwise write the full
// serialized state and return the id. `applyStateFn` powers the live listener.
//
// `sessionMeta` is { createdBy, listed, createdAt }. `createdAt` is a Date only
// when the creator picked a day other than today (backfilling a missed night,
// or prepping a future one); absent, the server stamps the moment of creation.
// When listed, the history row is written in the SAME transaction, so there can
// never be a session without its listing or a listing without its session.
export async function createSession(getState, applyStateFn, sessionMeta) {
  const { db, fx } = await getFirestore();
  const serialized = serialize(getState());
  const next = readMeta(sessionMeta);
  const pickedAt = sessionMeta?.createdAt instanceof Date ? sessionMeta.createdAt : null;
  let id = null;

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
          createdAt: pickedAt ? fx.Timestamp.fromDate(pickedAt) : fx.serverTimestamp(),
          updatedAt: fx.serverTimestamp(),
        });
        if (next.listed) {
          tx.set(
            fx.doc(db, INDEX_COLLECTION, candidate),
            indexEntryData({ createdBy: next.createdBy, createdAt: pickedAt }, fx)
          );
        }
        id = candidate;
        return;
      }
    }
    throw new Error(`Could not allocate a free session id after ${MAX_ID_ATTEMPTS} tries`);
  });

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

// Error thrown by joinSession when the doc is missing (never created or since
// deleted — sessions are kept forever, so nothing expires any more). Flagged so
// app.js can show its "not found" copy instead of a raw error.
export class SessionNotFoundError extends Error {
  constructor(id) {
    super(`Session "${id}" was not found (it may have been deleted)`);
    this.name = "SessionNotFoundError";
    this.notFound = true;
    this.sessionId = id;
  }
}

export async function joinSession(id, applyStateFn) {
  const { db, fx } = await getFirestore();
  const ref = fx.doc(db, "sessions", id);
  const snap = await fx.getDoc(ref);
  if (!snap.exists()) {
    throw new SessionNotFoundError(id);
  }
  const remote = snap.data();
  sessionId = id;
  applyState = applyStateFn;
  lastRemote = deepCopy(syncFields(remote));
  applyStateFn(deserialize(remote));
  attachListener(db, fx);
  emitStatus({ status: "connected", id });
  meta = readMeta(remote);
  sessionCreatedAt = readCreatedAt(remote);
  if (metaCallback) metaCallback({ ...meta });
}

// --- Metadata writes -------------------------------------------------------
// List / un-list. Unlisted only removes the history row — the session stays
// world-readable by id, exactly like every other session. This is advertising,
// not access control (see firestore.rules).
export async function setSessionListed(listed) {
  if (!sessionId) return;
  const id = sessionId;
  const { db, fx } = await getFirestore();
  const batch = fx.writeBatch(db);
  batch.update(fx.doc(db, "sessions", id), { listed, updatedAt: fx.serverTimestamp() });
  const indexRef = fx.doc(db, INDEX_COLLECTION, id);
  if (listed) {
    // Carry the session's REAL createdAt across. Letting this fall through to a
    // fresh serverTimestamp would re-date a night every time it was re-listed,
    // sending a weeks-old session to the top of the history claiming to be
    // tonight.
    batch.set(
      indexRef,
      indexEntryData({ createdBy: meta.createdBy, createdAt: sessionCreatedAt }, fx)
    );
  } else {
    batch.delete(indexRef);
  }
  await batch.commit();
  meta = { ...meta, listed };
}

// Stop listening and forget everything. Kept idempotent so the snapshot
// listener can call it on remote deletion without recursing back through it.
function teardown() {
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
  meta = { createdBy: "", listed: false, legacy: false };
  sessionCreatedAt = null;
}

export function leaveSession() {
  const had = sessionId !== null;
  teardown();
  if (had) emitStatus({ status: "left" });
}

// --- Apply (remote -> local) ----------------------------------------------
function attachListener(db, fx) {
  const ref = fx.doc(db, "sessions", sessionId);
  unsubscribe = fx.onSnapshot(
    ref,
    (snap) => {
      // Our own optimistic writes echo back as a snapshot first; skip them so
      // we don't re-apply (and clobber) state we already have locally.
      if (snap.metadata.hasPendingWrites) return;

      if (!snap.exists()) {
        // The doc was deleted remotely. With the TTL gone and client deletes
        // denied by the rules this should be unreachable, but a session that
        // silently stops syncing is far worse than one that says so.
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
    }
  );
}

function applyRemote(remote) {
  lastRemote = deepCopy(syncFields(remote));
  applyState(deserialize(remote));
  sessionCreatedAt = readCreatedAt(remote) ?? sessionCreatedAt;
  emitMeta(remote);
}

// app.js flips this around drags/swipes (see wireDrag / wireSwipe). On release
// we apply whatever snapshot arrived meanwhile so the two clients converge.
export function setGestureActive(active) {
  gestureActive = active;
  if (!active && deferredSnapshot && sessionId) {
    const remote = deferredSnapshot;
    deferredSnapshot = null;
    applyRemote(remote);
  } else if (!active) {
    deferredSnapshot = null;
  }
}

// --- Push (local -> remote) ------------------------------------------------
export function notifyLocalChange(state) {
  if (!sessionId) return;
  pendingState = state;
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    pushTimer = null;
    flushPush();
  }, PUSH_DEBOUNCE_MS);
}

async function flushPush() {
  if (!sessionId || !pendingState) return;
  const state = pendingState;
  pendingState = null;

  const current = serialize(state);
  const { db, fx } = await getFirestore();
  // The session may have been left while getFirestore() awaited.
  if (!sessionId) return;

  const updates = diff(lastRemote, current, fx);
  if (!updates) return; // nothing actually changed — don't churn the doc

  updates.updatedAt = fx.serverTimestamp();
  // Drain the legacy TTL field: sessions are kept forever now, but a doc
  // created before #77 still carries an expiresAt that the (soon-disabled) TTL
  // policy would sweep. A no-op on docs that don't have it, and it never
  // triggers a write on its own — diff() still returns null when nothing
  // changed, so this only rides along with a real edit.
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
// Exported for ui/tests (a stub `fx` is enough to exercise it).
export function diff(prev, next, fx) {
  const updates = {};
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
  return changed ? updates : null;
}
