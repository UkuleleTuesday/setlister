// Lightweight "who's here" presence for shared sessions (#32).
//
// The durable session doc (`sessions/{id}`) has a CLOSED v1 schema that
// firestore.rules locks down field-by-field, so presence deliberately lives
// OUTSIDE it, in a sibling subcollection: `sessions/{id}/presence/{clientId}`.
// Each connected browser owns exactly one presence doc (keyed by a stable
// per-device clientId), so a reload reuses the same doc instead of spawning a
// ghost. The doc is tiny and ephemeral:
//   { name: string, updatedAt: timestamp, expiresAt: timestamp }
//
// Liveness is a heartbeat: every HEARTBEAT_MS the client rewrites its own doc
// with a fresh server timestamp. Readers treat a peer as "here now" only while
// its updatedAt is within ONLINE_WINDOW_MS, so a client that closes the tab
// without cleanly leaving fades from every other roster within a minute. The
// short expiresAt lets Firestore's TTL sweep the abandoned doc from storage
// later (belt-and-braces on top of the client-side staleness filter and the
// best-effort delete on leave / pagehide).
//
// Firebase loads lazily through firebase.js — importing this module does NOT
// pull the Firestore SDK; only startPresence() does, and only inside an already
// active session. Kept UI-free: app.js renders the roster from onRoster().

import { getFirestore } from "./firebase.js";

// Rewrite our own heartbeat this often. Comfortably below ONLINE_WINDOW_MS so a
// single dropped write doesn't flap us offline in other people's rosters.
const HEARTBEAT_MS = 20 * 1000;

// A peer is "here now" while its last heartbeat is this recent. Must exceed
// HEARTBEAT_MS with margin to tolerate a missed beat / a little clock skew.
const ONLINE_WINDOW_MS = 50 * 1000;

// Cap the stored doc's lifetime so Firestore TTL can reap it if a client
// vanishes without deleting. Must be <= the 1h cap in firestore.rules.
const PRESENCE_TTL_MS = 5 * 60 * 1000;

const CLIENT_ID_KEY = "setlister.clientId.v1";
const ANON_NAME_KEY = "setlister.anonName.v1";

// Default identities for peers who haven't set a name:
// "Anonymous <Adjective> <Animal>". The "Anonymous" prefix reads clearly as a
// placeholder (not a chosen name), while the adjective + animal keep each one
// distinct and easy to say across a pub table.
const ANON_ADJECTIVES = [
  "Merry", "Sunny", "Jolly", "Breezy", "Mellow", "Chirpy", "Plucky", "Snappy",
  "Jazzy", "Funky", "Groovy", "Bouncy", "Lively", "Peppy", "Nifty", "Dandy",
  "Cosmic", "Dreamy", "Golden", "Ruby", "Minty", "Honey", "Spicy", "Zesty",
  "Brave", "Clever", "Witty", "Quirky", "Giddy", "Eager", "Bold", "Nimble",
  "Humming", "Dancing", "Skipping", "Roaming", "Glowing", "Sparkly", "Dapper",
  "Spiffy", "Jaunty", "Chipper", "Sprightly", "Wandering",
];

const ANON_ANIMALS = [
  "Otter", "Badger", "Hedgehog", "Robin", "Sparrow", "Finch", "Lark", "Wren",
  "Penguin", "Dolphin", "Walrus", "Seagull", "Fox", "Owl", "Heron", "Magpie",
  "Squirrel", "Mole", "Newt", "Toad", "Frog", "Hare", "Stoat", "Weasel",
  "Puffin", "Kestrel", "Swift", "Swan", "Goose", "Duck", "Moorhen", "Curlew",
  "Bumblebee", "Cricket", "Ladybird", "Dragonfly", "Seal", "Porpoise",
  "Dormouse", "Shrew", "Vole", "Ferret", "Pheasant", "Mallard",
];

function randomIndex(length) {
  const crypto = globalThis.crypto;
  if (crypto && crypto.getRandomValues) {
    const limit = Math.floor(0xffffffff / length) * length;
    const buf = new Uint32Array(1);
    let n;
    do {
      crypto.getRandomValues(buf);
      n = buf[0];
    } while (n >= limit);
    return n % length;
  }
  return Math.floor(Math.random() * length);
}

function pick(list) {
  return list[randomIndex(list.length)];
}

// Stable per-device id so a reload keeps the same presence doc (no ghosts) and
// so app.js can tell "you" apart from everyone else in the roster.
export function getClientId() {
  try {
    let id = localStorage.getItem(CLIENT_ID_KEY);
    if (!id) {
      id =
        globalThis.crypto?.randomUUID?.() ??
        `c-${randomIndex(0xffffffff)}-${randomIndex(0xffffffff)}`;
      localStorage.setItem(CLIENT_ID_KEY, id);
    }
    return id;
  } catch {
    // Private mode / storage blocked: fall back to a volatile id. It won't
    // survive a reload (a stale ghost lingers for ONLINE_WINDOW_MS) but
    // presence still works this session.
    if (!volatileClientId) {
      volatileClientId =
        globalThis.crypto?.randomUUID?.() ?? `c-${randomIndex(0xffffffff)}`;
    }
    return volatileClientId;
  }
}
let volatileClientId = null;

// The default display name for this device when "Your name" is left blank.
// Generated once and remembered, so you stay the same "Anonymous Bouncy Otter"
// across reloads until you type a real name to override it.
function makeAnonName() {
  return `Anonymous ${pick(ANON_ADJECTIVES)} ${pick(ANON_ANIMALS)}`;
}

export function getAnonName() {
  try {
    let name = localStorage.getItem(ANON_NAME_KEY);
    if (!name) {
      name = makeAnonName();
      localStorage.setItem(ANON_NAME_KEY, name);
    }
    return name;
  } catch {
    if (!volatileAnonName) {
      volatileAnonName = makeAnonName();
    }
    return volatileAnonName;
  }
}
let volatileAnonName = null;

// The name this device broadcasts: the user's typed name if they set one, else
// the stable anonymous default.
export function displayName(typedName) {
  const trimmed = (typedName || "").trim();
  return trimmed || getAnonName();
}

// --- Module state ----------------------------------------------------------
let sessionId = null;
let getName = null; // () => current typed name
let unsubscribe = null;
let heartbeatTimer = null;
let rosterCallback = null;
let lastRoster = [];

export function onRoster(cb) {
  rosterCallback = cb;
}

function emitRoster(roster) {
  lastRoster = roster;
  if (rosterCallback) rosterCallback(roster);
}

function presenceDocRef(fx, db) {
  return fx.doc(db, "sessions", sessionId, "presence", getClientId());
}

async function writeHeartbeat() {
  if (!sessionId) return;
  const { db, fx } = await getFirestore();
  if (!sessionId) return; // left while awaiting the SDK
  try {
    await fx.setDoc(presenceDocRef(fx, db), {
      name: displayName(getName?.()).slice(0, 60),
      updatedAt: fx.serverTimestamp(),
      expiresAt: fx.Timestamp.fromMillis(Date.now() + PRESENCE_TTL_MS),
    });
  } catch {
    // A dropped heartbeat is self-healing: the next beat retries, and other
    // clients only drop us after ONLINE_WINDOW_MS of silence.
  }
}

// Turn the presence subcollection snapshot into a roster the UI can render:
// { clientId, name, isSelf, online }, self first, then alphabetical. Peers
// whose last heartbeat is older than ONLINE_WINDOW_MS are dropped as ghosts.
function toRoster(snap) {
  const me = getClientId();
  const now = Date.now();
  const out = [];
  snap.forEach((docSnap) => {
    const data = docSnap.data();
    const isSelf = docSnap.id === me;
    // A just-written doc echoes back with updatedAt still null (server hasn't
    // stamped it yet). Trust our own heartbeat; for peers, no stamp means we
    // can't vouch for liveness, so skip until it lands.
    const ts = data?.updatedAt;
    const millis = ts && typeof ts.toMillis === "function" ? ts.toMillis() : null;
    const online = isSelf || (millis !== null && now - millis < ONLINE_WINDOW_MS);
    if (!online) return;
    out.push({
      clientId: docSnap.id,
      name: (data?.name || "").trim() || "Someone",
      isSelf,
      online: true,
    });
  });
  out.sort((a, b) => {
    if (a.isSelf !== b.isSelf) return a.isSelf ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return out;
}

// Join the session's presence: write our first heartbeat, listen to the roster,
// and start the heartbeat loop. Idempotent-ish — call stopPresence() first if a
// session is already active.
export async function startPresence(id, nameFn) {
  await stopPresence();
  sessionId = id;
  getName = nameFn;

  const { db, fx } = await getFirestore();
  if (sessionId !== id) return; // left/switched while awaiting the SDK

  await writeHeartbeat();

  const colRef = fx.collection(db, "sessions", sessionId, "presence");
  unsubscribe = fx.onSnapshot(
    colRef,
    (snap) => emitRoster(toRoster(snap)),
    () => {
      /* transient listen error — heartbeats keep flowing, listener retries */
    }
  );

  heartbeatTimer = setInterval(writeHeartbeat, HEARTBEAT_MS);
}

// Push a fresh heartbeat immediately so a name change (or override) shows up on
// other rosters without waiting for the next interval tick.
export function refreshPresence() {
  if (sessionId) writeHeartbeat();
}

// Leave presence: stop the heartbeat, detach the listener, and best-effort
// delete our own doc so peers see us go immediately (rather than after the
// staleness window). Safe to call when no session is active.
export async function stopPresence() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }
  const leavingId = sessionId;
  sessionId = null;
  getName = null;
  emitRoster([]);

  if (!leavingId) return;
  try {
    const { db, fx } = await getFirestore();
    await fx.deleteDoc(fx.doc(db, "sessions", leavingId, "presence", getClientId()));
  } catch {
    // Couldn't delete (offline, etc.) — the ONLINE_WINDOW_MS staleness filter
    // and the TTL both still retire the doc.
  }
}

// Best-effort removal when the tab is closing. pagehide/beforeunload can't await
// an async delete, so this fires a delete and lets it race the unload; if it
// loses, staleness + TTL clean up. app.js wires the event.
export function removeOnUnload() {
  if (!sessionId) return;
  getFirestore()
    .then(({ db, fx }) =>
      fx.deleteDoc(fx.doc(db, "sessions", sessionId, "presence", getClientId()))
    )
    .catch(() => {});
}
