// Core realtime sync engine for multiplayer session sharing (epic #25).
//
// This module mirrors the app's durable state (the two lists + edition) to a
// single Firestore document at `sessions/{id}` and applies remote changes back
// live. It is deliberately UI-free: app.js drives it through a tiny API and the
// real sharing UI arrives in #30. Until then a debug hook
// (`window.setlisterSync`) lets the console and Playwright exercise it.
//
// The Firestore doc is the complete v1 schema validated by firestore.rules
// (#26) — do NOT add fields:
//   { v: 1, rows: {uid: Row}, upNextOrder: [uid], requestsOrder: [uid],
//     edition, createdAt, updatedAt, expiresAt }
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

// Sessions live for 30 days; firestore.rules caps expiresAt at now + 31d, so
// this stays comfortably under the limit even with a little clock skew.
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

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

// --- Status --------------------------------------------------------------
// #30 consumes this to reflect connection state in the UI. Payload shapes:
//   { status: "connected", id }   — create/join succeeded, listener attached
//   { status: "expired", id }     — remote doc vanished (TTL); now local-only
//   { status: "left" }            — leaveSession()
//   { status: "error", error }    — snapshot/write error
export function onStatusChange(cb) {
  statusCallback = cb;
}

function emitStatus(payload) {
  if (statusCallback) statusCallback(payload);
}

export function getSessionId() {
  return sessionId;
}

// --- Serialization ---------------------------------------------------------
// App state {upNext, requests, edition} <-> the Firestore doc's row map + two
// order arrays. Rows carry stable uids and embed their catalogue match, so the
// map is self-contained.
function serialize(state) {
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
function deserialize(remote) {
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
export async function createSession(getState, applyStateFn) {
  const { db, fx } = await getFirestore();
  const serialized = serialize(getState());
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
          createdAt: fx.serverTimestamp(),
          updatedAt: fx.serverTimestamp(),
          expiresAt: expiresAt(fx),
        });
        id = candidate;
        return;
      }
    }
    throw new Error(`Could not allocate a free session id after ${MAX_ID_ATTEMPTS} tries`);
  });

  sessionId = id;
  applyState = applyStateFn;
  lastRemote = deepCopy(serialized);
  attachListener(db, fx);
  emitStatus({ status: "connected", id });
  return id;
}

// Error thrown by joinSession when the doc is missing (never created or
// TTL-expired). Flagged so #30 can show "session not found or expired".
export class SessionNotFoundError extends Error {
  constructor(id) {
    super(`Session "${id}" was not found (it may have expired)`);
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
        // The doc was deleted remotely — only the TTL can do this (rules deny
        // client deletes). Leave gracefully but keep local state so the user
        // keeps working; #30 surfaces the "expired" status.
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
  updates.expiresAt = expiresAt(fx);
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
function diff(prev, next, fx) {
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

function expiresAt(fx) {
  return fx.Timestamp.fromMillis(Date.now() + SESSION_TTL_MS);
}
