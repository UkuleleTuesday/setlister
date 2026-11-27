// Presence lives in `sessions/{id}/presence/{clientId}`, outside the session
// doc's closed schema. Liveness is a heartbeat; leaving deletes the doc, and
// expiresAt lets Firestore's TTL sweep abandoned ones.

import type { Firestore, QuerySnapshot, Unsubscribe } from "firebase/firestore";
import { type Fx, getFirestore } from "./firebase.js";

export interface RosterEntry {
  clientId: string;
  name: string;
  isSelf: boolean;
  online: true;
}

// Under ONLINE_WINDOW_MS so a dropped beat doesn't flap us offline; rare enough
// to keep writes cheap for a page left open.
const HEARTBEAT_MS = 2 * 60 * 1000;

// Generous: people glance at the setlist occasionally, and a locked phone
// shouldn't drop someone who's still in the room.
const ONLINE_WINDOW_MS = 5 * 60 * 1000;

// Above ONLINE_WINDOW_MS, so TTL never reaps a doc peers still count online,
// and under firestore.rules' 1h cap.
const PRESENCE_TTL_MS = 10 * 60 * 1000;

const CLIENT_ID_KEY = "setlister.clientId.v1";
const ANON_NAME_KEY = "setlister.anonName.v1";

// "Anonymous" reads as a placeholder; adjective + animal stay distinct and easy
// to say across a pub table.
const ANON_ADJECTIVES = [
  "Merry",
  "Sunny",
  "Jolly",
  "Breezy",
  "Mellow",
  "Chirpy",
  "Plucky",
  "Snappy",
  "Jazzy",
  "Funky",
  "Groovy",
  "Bouncy",
  "Lively",
  "Peppy",
  "Nifty",
  "Dandy",
  "Cosmic",
  "Dreamy",
  "Golden",
  "Ruby",
  "Minty",
  "Honey",
  "Spicy",
  "Zesty",
  "Brave",
  "Clever",
  "Witty",
  "Quirky",
  "Giddy",
  "Eager",
  "Bold",
  "Nimble",
  "Humming",
  "Dancing",
  "Skipping",
  "Roaming",
  "Glowing",
  "Sparkly",
  "Dapper",
  "Spiffy",
  "Jaunty",
  "Chipper",
  "Sprightly",
  "Wandering",
];

const ANON_ANIMALS = [
  "Otter",
  "Badger",
  "Hedgehog",
  "Robin",
  "Sparrow",
  "Finch",
  "Lark",
  "Wren",
  "Penguin",
  "Dolphin",
  "Walrus",
  "Seagull",
  "Fox",
  "Owl",
  "Heron",
  "Magpie",
  "Squirrel",
  "Mole",
  "Newt",
  "Toad",
  "Frog",
  "Hare",
  "Stoat",
  "Weasel",
  "Puffin",
  "Kestrel",
  "Swift",
  "Swan",
  "Goose",
  "Duck",
  "Moorhen",
  "Curlew",
  "Bumblebee",
  "Cricket",
  "Ladybird",
  "Dragonfly",
  "Seal",
  "Porpoise",
  "Dormouse",
  "Shrew",
  "Vole",
  "Ferret",
  "Pheasant",
  "Mallard",
];

function randomIndex(length: number): number {
  const crypto = globalThis.crypto;
  if (crypto && crypto.getRandomValues) {
    const limit = Math.floor(0xffffffff / length) * length;
    const buf = new Uint32Array(1);
    let n: number;
    do {
      crypto.getRandomValues(buf);
      n = buf[0];
    } while (n >= limit);
    return n % length;
  }
  return Math.floor(Math.random() * length);
}

function pick<T>(list: readonly T[]): T {
  return list[randomIndex(list.length)];
}

// Stable per device, so a reload reuses its presence doc instead of leaving a ghost.
export function getClientId(): string {
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
    // Storage blocked: a reload leaves a ghost for ONLINE_WINDOW_MS.
    if (!volatileClientId) {
      volatileClientId = globalThis.crypto?.randomUUID?.() ?? `c-${randomIndex(0xffffffff)}`;
    }
    return volatileClientId;
  }
}
let volatileClientId: string | null = null;

function makeAnonName(): string {
  return `Anonymous ${pick(ANON_ADJECTIVES)} ${pick(ANON_ANIMALS)}`;
}

function getAnonName(): string {
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
let volatileAnonName: string | null = null;

export function displayName(typedName: string | null | undefined): string {
  const trimmed = (typedName || "").trim();
  return trimmed || getAnonName();
}

// --- Module state ----------------------------------------------------------
let sessionId: string | null = null;
let getName: (() => string) | null = null;
let unsubscribe: Unsubscribe | null = null;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let rosterCallback: ((roster: RosterEntry[]) => void) | null = null;

export function onRoster(cb: (roster: RosterEntry[]) => void): void {
  rosterCallback = cb;
}

function emitRoster(roster: RosterEntry[]): void {
  if (rosterCallback) rosterCallback(roster);
}

function presenceDocRef(fx: Fx, db: Firestore, id: string) {
  return fx.doc(db, "sessions", id, "presence", getClientId());
}

async function writeHeartbeat(): Promise<void> {
  if (!sessionId) return;
  const { db, fx } = await getFirestore();
  if (!sessionId) return; // left while awaiting the SDK
  try {
    await fx.setDoc(presenceDocRef(fx, db, sessionId), {
      name: displayName(getName?.()).slice(0, 60),
      updatedAt: fx.serverTimestamp(),
      expiresAt: fx.Timestamp.fromMillis(Date.now() + PRESENCE_TTL_MS),
    });
  } catch {
    // Self-healing: the next beat retries.
  }
}

function toRoster(snap: QuerySnapshot): RosterEntry[] {
  const me = getClientId();
  const now = Date.now();
  const out: RosterEntry[] = [];
  snap.forEach((docSnap) => {
    const data = docSnap.data();
    const isSelf = docSnap.id === me;
    // A fresh write echoes back with updatedAt still null: trust our own, skip
    // a peer's until the server stamps it.
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

export async function startPresence(id: string, nameFn: () => string): Promise<void> {
  await stopPresence();
  sessionId = id;
  getName = nameFn;

  const { db, fx } = await getFirestore();
  if (sessionId !== id) return; // left/switched while awaiting the SDK

  await writeHeartbeat();
  if (sessionId !== id) return; // stopPresence() ran mid-await

  const colRef = fx.collection(db, "sessions", id, "presence");
  unsubscribe = fx.onSnapshot(
    colRef,
    (snap) => emitRoster(toRoster(snap)),
    () => {
      /* transient listen error: heartbeats keep flowing, listener retries */
    },
  );

  heartbeatTimer = setInterval(writeHeartbeat, HEARTBEAT_MS);
}

// So a name change reaches other rosters without waiting for the next beat.
export function refreshPresence(): void {
  if (sessionId) writeHeartbeat();
}

export async function stopPresence(): Promise<void> {
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
    // Staleness and TTL retire the doc anyway.
  }
}

// pagehide can't await: fire the delete and let it race the unload.
export function removeOnUnload(): void {
  const id = sessionId;
  if (!id) return;
  getFirestore()
    .then(({ db, fx }) => fx.deleteDoc(presenceDocRef(fx, db, id)))
    .catch(() => {});
}
