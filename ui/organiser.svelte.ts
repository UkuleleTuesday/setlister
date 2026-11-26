// Organiser registration (#151): sign in anonymously, write
// `organisers/{uid}` with the link's key. Nothing is gated on it until #152.
// Room phones never load Auth.

import { getAuth, getFirestore } from "./firebase.js";
import { night } from "./night.svelte.js";
import {
  type RegistrationError,
  describeRegistrationError,
  parseOrganiseInput,
  parseOrganiseKey,
  stripHash,
  withTimeout,
} from "./organiser-link.js";
import { overlays } from "./overlays.svelte.js";
import { setPlayerName } from "./player.js";

export type OrganiserStep = "name" | "working" | "done" | "stale" | "error";

class Organiser {
  /** Has a row; whether its key is still current shows only as a denied
   * write (#152). */
  isOrganiser = $state(false);
  name = $state("");
  sheet = $state<OrganiserStep | null>(null);
  failure = $state<RegistrationError | null>(null);
}

export const organiser = new Organiser();

// Set once registered: the only reason to load Auth at boot.
const ORGANISER_KEY = "setlister.organiser.v1";
// The link's key until it registers or is cancelled, so a reload resumes.
const PENDING_KEY = "setlister.organiseKey.v1";

const REGISTER_TIMEOUT_MS = 15_000;

let linkKey: string | null = null;

/** Boot, first: strip the key from the URL, or resume a pending one. */
export function takeOrganiseLink(): void {
  const fromLink = takeKeyFromHash();
  linkKey = fromLink ?? readPending();
}

function takeKeyFromHash(): string | null {
  const key = parseOrganiseKey(location.hash);
  if (location.hash) history.replaceState(history.state, "", stripHash(location.href));
  if (key) writePending(key);
  return key;
}

/** Asks for a name only if the phone has none. */
export function startRegistration(): void {
  if (!linkKey) return;
  organiser.failure = null;
  if (night.name.trim()) register();
  else organiser.sheet = "name";
}

/** A tap while the app is open in this tab only changes the hash. */
export function followOrganiseLinks(): void {
  window.addEventListener("hashchange", () => {
    const key = takeKeyFromHash();
    if (!key) return;
    linkKey = key;
    startRegistration();
  });
}

/** Settings → Organisers. False if it isn't a link. */
export function registerFromPaste(text: string): boolean {
  const key = parseOrganiseInput(text);
  if (!key) return false;
  linkKey = key;
  writePending(key);
  overlays.settings = false;
  startRegistration();
  return true;
}

export function registerAs(name: string): void {
  setPlayerName(name.trim().slice(0, 60));
  register();
}

/** Cancel passes `forget`; a tap outside keeps the key for a reload. */
export function closeOrganiserSheet({ forget = false } = {}): void {
  if (forget || organiser.sheet === "done" || organiser.sheet === "stale") {
    linkKey = null;
    writePending(null);
  }
  organiser.sheet = null;
}

export function reloadToRegister(): void {
  location.reload();
}

export async function register(): Promise<void> {
  const key = linkKey;
  const name = night.name.trim().slice(0, 60);
  if (!key || !name) return;
  organiser.sheet = "working";
  organiser.failure = null;
  try {
    await withTimeout(writeRow(key, name), REGISTER_TIMEOUT_MS);
    writeRegistered(true);
    writePending(null);
    linkKey = null;
    organiser.isOrganiser = true;
    organiser.name = name;
    organiser.sheet = "done";
  } catch (err) {
    console.warn("Organiser registration failed:", err);
    // Wrong, retired or missing key.
    if ((err as { code?: string }).code === "permission-denied") {
      organiser.sheet = "stale";
    } else {
      organiser.failure = describeRegistrationError(err);
      organiser.sheet = "error";
    }
  }
}

async function writeRow(key: string, name: string): Promise<void> {
  const [{ auth, signInAnonymously }, { db, fx }] = await Promise.all([getAuth(), getFirestore()]);
  const user = auth.currentUser ?? (await signInAnonymously(auth)).user;
  await fx.setDoc(fx.doc(db, "organisers", user.uid), {
    name,
    createdAt: fx.serverTimestamp(),
    key,
  });
}

/** Boot: read back this phone's row, if it registered before. */
export async function restoreOrganiser(): Promise<void> {
  if (!readRegistered()) return;
  try {
    const [{ auth }, { db, fx }] = await Promise.all([getAuth(), getFirestore()]);
    if (!auth.currentUser) {
      // Sign-in lost, e.g. Safari wiped the site's storage.
      writeRegistered(false);
      return;
    }
    const row = await fx.getDoc(fx.doc(db, "organisers", auth.currentUser.uid));
    if (organiser.isOrganiser) return;
    organiser.isOrganiser = row.exists();
    organiser.name = String(row.data()?.name ?? "");
  } catch {
    /* best-effort */
  }
}

function readRegistered(): boolean {
  try {
    return localStorage.getItem(ORGANISER_KEY) === "1";
  } catch {
    return false;
  }
}

function writeRegistered(value: boolean): void {
  try {
    if (value) localStorage.setItem(ORGANISER_KEY, "1");
    else localStorage.removeItem(ORGANISER_KEY);
  } catch {
    /* storage blocked */
  }
}

function readPending(): string | null {
  try {
    return sessionStorage.getItem(PENDING_KEY);
  } catch {
    return null;
  }
}

function writePending(key: string | null): void {
  try {
    if (key) sessionStorage.setItem(PENDING_KEY, key);
    else sessionStorage.removeItem(PENDING_KEY);
  } catch {
    /* storage blocked */
  }
}
