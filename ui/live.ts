import { scopeCatalogueToEdition } from "./catalogue.svelte.js";
import { night } from "./night.svelte.js";
import { notices } from "./notices.svelte.js";
import { overlays } from "./overlays.svelte.js";
import * as presence from "./presence.js";
import { navigateTo } from "./routing.js";
import { persist } from "./save.js";
import { readSync, session } from "./session.svelte.js";
import { loseOrganiserAccess } from "./organiser.svelte.js";
import * as sync from "./sync.js";
import type { ListState } from "./types.js";

// persist()'s push is a no-op here: sync just set lastRemote to this state.
export function applyRemoteState(state: ListState) {
  night.upNext = state.upNext;
  night.requests = state.requests;
  night.votes = state.votes || {};
  // The doc wins even when its edition is unreadable (null): keeping this
  // device's edition would push it into the shared doc on the persist() below.
  night.edition = state.edition ?? null;
  scopeCatalogueToEdition(state.edition?.id || "current");
  persist();
}

export function followSession() {
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
    } else if (status.status === "error" && sync.isPermissionDenied(status.error)) {
      loseOrganiserAccess();
    }
    if (!session.id) overlays.share = false;
  });
  sync.onMetaChange(readSync);
  presence.onRoster((roster) => (session.roster = roster));
  // pagehide is more reliable than beforeunload on mobile; if it's missed,
  // the staleness window retires the presence doc anyway.
  window.addEventListener("pagehide", presence.removeOnUnload);
}

// The request window can open or close with no snapshot arriving (an
// unattended auto session). Its message is in whole minutes.
let clock: ReturnType<typeof setInterval> | null = null;
function startClock() {
  stopClock();
  clock = setInterval(() => (session.now = new Date()), 60_000);
}
function stopClock() {
  if (clock) clearInterval(clock);
  clock = null;
}
