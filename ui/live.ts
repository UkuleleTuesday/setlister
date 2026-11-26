// The session as it happens: sync's remote changes landing in the night,
// presence and the request window's clock started and stopped with the
// session, and a deleted session sent home.

import { scopeCatalogueToEdition } from "./catalogue.svelte.js";
import { night } from "./night.svelte.js";
import { notices } from "./notices.svelte.js";
import { overlays } from "./overlays.svelte.js";
import * as presence from "./presence.js";
import { navigateTo } from "./routing.js";
import { persist } from "./save.js";
import { readSync, session } from "./session.svelte.js";
import * as sync from "./sync.js";
import type { ListState } from "./types.js";

// Called by sync when a remote change arrives: swap in the fresh lists.
// persist() writes them back to localStorage (and is a no-op push, since sync
// just set lastRemote to this same state).
export function applyRemoteState(state: ListState) {
  night.upNext = state.upNext;
  night.requests = state.requests;
  night.votes = state.votes || {};
  // The doc is authoritative even when it says null (a session predating
  // per-session books): keeping this device's old edition would push it into
  // the shared doc on the persist() below, hijacking the session's book.
  night.edition = state.edition ?? null;
  // The session's songbook is the one everyone searches: when the doc names a
  // different edition than the loaded catalogue (joining a themed night, or a
  // peer switching books mid-session), re-scope the pickers to it. Sessions
  // from before editions carry null; those read as the default book.
  scopeCatalogueToEdition(state.edition?.id || "current");
  persist();
}

/** Follow sync and presence for the life of the page. */
export function followSession() {
  // Presence and the clock share the session's lifecycle: started on
  // connect, stopped (presence retracting our doc) on leave.
  sync.onStatusChange((status) => {
    readSync();
    if (status.status === "connected") {
      presence.startPresence(status.id, () => night.name);
      startClock();
    } else if (status.status === "expired") {
      presence.stopPresence();
      stopClock();
      notices.home.show("That session is no longer there. It looks like it was deleted.");
      navigateTo(null, { replace: true });
    } else if (status.status === "left") {
      presence.stopPresence();
      stopClock();
    }
    if (!session.id) overlays.share = false; // no session, nothing to share
  });
  sync.onMetaChange(readSync);
  presence.onRoster((roster) => (session.roster = roster));
  // Best-effort: retract our presence when the tab closes so peers see us go
  // promptly. pagehide fires more reliably than beforeunload on mobile; if
  // it's missed, the staleness window retires the doc anyway.
  window.addEventListener("pagehide", presence.removeOnUnload);
}

// The request window can open or close with no snapshot arriving at all (an
// unattended auto session crossing its own boundary). A 1-minute tick is
// enough for a whole-minutes message and does no network I/O.
let clock: ReturnType<typeof setInterval> | null = null;
function startClock() {
  stopClock();
  clock = setInterval(() => (session.now = new Date()), 60_000);
}
function stopClock() {
  if (clock) clearInterval(clock);
  clock = null;
}
