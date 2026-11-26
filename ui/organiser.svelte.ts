// Organiser phones (#150, #151). Tapping the organiser link (or pasting it in
// Settings → Organisers) signs this phone in anonymously and writes
// `organisers/{uid}` with the link's key; the rules accept it only if the key
// is the current one. Nothing is gated on it yet:
// #152 locks organiser-only writes and picks the view from `isOrganiser`.
//
// Room phones never sign in, and never download the Auth SDK: it loads only
// for an organiser link, or on a phone that registered before (ORGANISER_KEY).

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

/** Where the registration sheet is, or null while it's closed. */
export type OrganiserStep = "name" | "working" | "done" | "stale" | "error";

class Organiser {
  /** This phone holds an organiser row. The client can't read the current
   * key, so a row made stale by a key change still counts here until a write
   * is denied (#152). */
  isOrganiser = $state(false);
  /** The name on this phone's row, for the status line in Settings. */
  name = $state("");
  sheet = $state<OrganiserStep | null>(null);
  /** Why the last attempt failed, for the "error" step. */
  failure = $state<RegistrationError | null>(null);
}

export const organiser = new Organiser();

// "This phone registered once": the only reason to load Auth on a plain open.
const ORGANISER_KEY = "setlister.organiser.v1";
// A link's key until it registers or is cancelled, so a reload (or the
// sheet's Reload button) picks it up again: the address bar no longer has it.
// sessionStorage: this tab only, gone when it closes.
const PENDING_KEY = "setlister.organiseKey.v1";

// Registering waits on the network; past this it's an error with a retry.
const REGISTER_TIMEOUT_MS = 15_000;

let linkKey: string | null = null;
// startRegistration() hid the name amnesty: give it back if no name comes.
let hidAmnesty = false;

/** Boot, before anything else: take the key out of the URL at once. Falls
 * back to a key this tab was still registering before a reload. */
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

/** Boot, after the name amnesty: open the sheet if there's a key to use. */
export function startRegistration(): void {
  if (!linkKey) return;
  // The name step asks for the name itself, so the amnesty's would only stack.
  hidAmnesty ||= overlays.nameReset;
  overlays.nameReset = false;
  organiser.failure = null;
  organiser.sheet = "name";
}

/** A link tapped while the app is already open in this tab changes only the
 * hash, with no page load: same steps. */
export function followOrganiseLinks(): void {
  window.addEventListener("hashchange", () => {
    const key = takeKeyFromHash();
    if (!key) return;
    linkKey = key;
    startRegistration();
  });
}

/** Settings → Organisers: the link pasted instead of tapped. False if it
 * isn't one. */
export function registerFromPaste(text: string): boolean {
  const key = parseOrganiseInput(text);
  if (!key) return false;
  linkKey = key;
  writePending(key);
  overlays.settings = false;
  startRegistration();
  return true;
}

/** The name step's button. */
export function registerAs(name: string): void {
  setPlayerName(name.trim().slice(0, 60));
  register();
}

/** The sheet closing (Cancel, or a tap outside). `forget` drops the key: a
 * tap outside keeps it, so a reload offers the sheet again. */
export function closeOrganiserSheet({ forget = false } = {}): void {
  if (forget || organiser.sheet === "done" || organiser.sheet === "stale") {
    linkKey = null;
    writePending(null);
  }
  organiser.sheet = null;
  if (hidAmnesty && !night.name.trim()) overlays.nameReset = true;
  hidAmnesty = false;
}

/** The error step's Reload: the key survives it in sessionStorage. */
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
    hidAmnesty = false;
    organiser.isOrganiser = true;
    organiser.name = name;
    organiser.sheet = "done";
  } catch (err) {
    // The raw reason is for whoever debugs it, not the organiser.
    console.warn("Organiser registration failed:", err);
    // A wrong or retired key, or no key set up at all, is the rules saying no.
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
  // Also how a phone re-registers after a key change: same row, new key.
  await fx.setDoc(fx.doc(db, "organisers", user.uid), {
    name,
    createdAt: fx.serverTimestamp(),
    key,
  });
}

/** Boot: a phone that registered before reads its own row back. Best-effort. */
export async function restoreOrganiser(): Promise<void> {
  if (!readRegistered()) return;
  try {
    const [{ auth }, { db, fx }] = await Promise.all([getAuth(), getFirestore()]);
    if (!auth.currentUser) {
      // The sign-in is gone (Safari wiped the site's storage, or the account
      // was deleted): the link is the only way back, and Settings now says so.
      writeRegistered(false);
      return;
    }
    const row = await fx.getDoc(fx.doc(db, "organisers", auth.currentUser.uid));
    // A registration that landed meanwhile already set these.
    if (organiser.isOrganiser) return;
    organiser.isOrganiser = row.exists();
    organiser.name = String(row.data()?.name ?? "");
  } catch {
    /* offline or Auth unavailable: stays false, nothing depends on it yet */
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
    /* storage blocked: the next open just won't restore the status */
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
    /* storage blocked: a reload just loses the link, as before */
  }
}
