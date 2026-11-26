// Organiser phones (#150, #151). Tapping the organiser link signs this phone
// in anonymously and writes `organisers/{uid}` with the link's key; the rules
// accept it only if the key is the current one. Nothing is gated on it yet:
// #152 locks organiser-only writes and picks the view from `isOrganiser`.
//
// Room phones never sign in, and never download the Auth SDK: it loads only
// for an organiser link, or on a phone that registered before (ORGANISER_KEY).

import { getAuth, getFirestore } from "./firebase.js";
import { night } from "./night.svelte.js";
import { parseOrganiseKey, stripHash } from "./organiser-link.js";
import { overlays } from "./overlays.svelte.js";
import { setPlayerName } from "./player.js";

/** Where the registration sheet is, or null while it's closed. */
export type OrganiserStep = "name" | "working" | "done" | "stale" | "error";

class Organiser {
  /** This phone holds an organiser row. The client can't read the current
   * key, so a row made stale by a key change still counts here until a write
   * is denied (#152). */
  isOrganiser = $state(false);
  sheet = $state<OrganiserStep | null>(null);
  /** The last failure, for the "error" step. */
  error = $state("");
}

export const organiser = new Organiser();

// "This phone registered once": the only reason to load Auth on a plain open.
const ORGANISER_KEY = "setlister.organiser.v1";

// The key from this page load's link, kept for a retry after a failure.
let linkKey: string | null = null;

/** Boot, before anything else: take the key out of the URL at once. */
export function takeOrganiseLink(): void {
  linkKey = parseOrganiseKey(location.hash);
  if (location.hash) history.replaceState(history.state, "", stripHash(location.href));
}

/** Boot, after the name amnesty: register if this load came from the link. */
export function startRegistration(): void {
  if (!linkKey) return;
  // This sheet asks for the name itself, so the amnesty's would only stack.
  overlays.nameReset = false;
  if (night.name.trim()) register();
  else organiser.sheet = "name";
}

/** A link tapped while the app is already open in this tab changes only the
 * hash, with no page load: same steps. */
export function followOrganiseLinks(): void {
  window.addEventListener("hashchange", () => {
    takeOrganiseLink();
    startRegistration();
  });
}

/** The sheet's name step. */
export function registerAs(name: string): void {
  setPlayerName(name.trim().slice(0, 60));
  register();
}

export async function register(): Promise<void> {
  const key = linkKey;
  const name = night.name.trim().slice(0, 60);
  if (!key || !name) return;
  organiser.sheet = "working";
  try {
    const [{ auth, signInAnonymously }, { db, fx }] = await Promise.all([
      getAuth(),
      getFirestore(),
    ]);
    const user = auth.currentUser ?? (await signInAnonymously(auth)).user;
    // Also how a phone re-registers after a key change: same row, new key.
    await fx.setDoc(fx.doc(db, "organisers", user.uid), {
      name,
      createdAt: fx.serverTimestamp(),
      key,
    });
    writeRegistered(true);
    organiser.isOrganiser = true;
    organiser.sheet = "done";
  } catch (err) {
    // A wrong or replaced key is the rules saying no; anything else (offline,
    // Anonymous sign-in not enabled) is worth showing as is.
    if ((err as { code?: string }).code === "permission-denied") {
      organiser.sheet = "stale";
    } else {
      organiser.error = err instanceof Error ? err.message : String(err);
      organiser.sheet = "error";
    }
  }
}

/** Boot: a phone that registered before reads its own row back. Best-effort. */
export async function restoreOrganiser(): Promise<void> {
  if (linkKey || !readRegistered()) return;
  try {
    const [{ auth }, { db, fx }] = await Promise.all([getAuth(), getFirestore()]);
    if (!auth.currentUser) {
      // The sign-in is gone (Safari wiped the site's storage, or the account
      // was deleted): re-tapping the link is the only way back.
      writeRegistered(false);
      return;
    }
    const row = await fx.getDoc(fx.doc(db, "organisers", auth.currentUser.uid));
    organiser.isOrganiser = row.exists();
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
