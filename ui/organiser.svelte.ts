// Organiser registration (#151): sign in anonymously, write
// `organisers/{uid}` with the link's key. Room phones never load Auth.

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
import { notices } from "./notices.svelte.js";
import { organiserStatus, setOrganiser } from "./organiser-status.svelte.js";
import { overlays } from "./overlays.svelte.js";
import { setPlayerName } from "./player.js";
import * as sync from "./sync.js";

export type OrganiserStep = "name" | "working" | "done" | "stale" | "error";

class Organiser {
  sheet = $state<OrganiserStep | null>(null);
  failure = $state<RegistrationError | null>(null);
}

export const organiser = new Organiser();

// The link's key until it registers or is cancelled, so a reload resumes.
const PENDING_KEY = "setlister.organiseKey.v1";

const REGISTER_TIMEOUT_MS = 15_000;

let linkKey: string | null = null;
let registeredThisLoad = false;

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

/** A write was denied: the key changed, so this phone is the room's now. */
export function loseOrganiserAccess(): void {
  if (!organiserStatus.isOrganiser) return;
  setOrganiser(false);
  const message = "Organiser access has changed. Tap the latest organiser link.";
  notices.requests.show(message);
  notices.home.show(message);
  sync.refresh().catch(() => {});
}

export async function register(): Promise<void> {
  const key = linkKey;
  const name = night.name.trim().slice(0, 60);
  if (!key || !name) return;
  organiser.sheet = "working";
  organiser.failure = null;
  try {
    await withTimeout(writeRow(key, name), REGISTER_TIMEOUT_MS);
    writePending(null);
    linkKey = null;
    registeredThisLoad = true;
    setOrganiser(true, name);
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

/** Boot: read back this phone's row, if it registered before. Offline keeps
 * the stored status. */
export async function restoreOrganiser(): Promise<void> {
  if (!organiserStatus.isOrganiser) return;
  try {
    const [{ auth }, { db, fx }] = await Promise.all([getAuth(), getFirestore()]);
    if (!auth.currentUser) {
      // Sign-in lost, e.g. Safari wiped the site's storage.
      setOrganiser(false);
      return;
    }
    const row = await fx.getDoc(fx.doc(db, "organisers", auth.currentUser.uid));
    if (registeredThisLoad) return;
    setOrganiser(row.exists(), String(row.data()?.name ?? ""));
  } catch {
    /* best-effort */
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
