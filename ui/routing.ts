// `?session=<id>` is the only source of truth for the view, so the phone's
// Back button and iOS edge-swipe work for free.

import type { NewSessionChoice } from "./NewSessionSheet.svelte";
import { catalogue, scopeCatalogueToEdition } from "./catalogue.svelte.js";
import { loadHistory } from "./history.svelte.js";
import { applyRemoteState } from "./live.js";
import { night } from "./night.svelte.js";
import { notices } from "./notices.svelte.js";
import { overlays } from "./overlays.svelte.js";
import * as presence from "./presence.js";
import { persist } from "./save.js";
import { isValidSessionId } from "./session-id.js";
import { readSync } from "./session.svelte.js";
import * as sync from "./sync.js";
import { loseOrganiserAccess } from "./organiser.svelte.js";
import { view } from "./view.svelte.js";

export function currentRouteId(): string | null {
  return new URLSearchParams(location.search).get("session");
}

export function setView(page: "home" | "session") {
  view.page = page;
  if (page === "home") {
    overlays.share = false;
    view.editingPast = false;
  }
  overlays.settings = false;
}

// pushState for anything the user did (so Back retraces it), replaceState for
// load-time normalisation and error recovery (which shouldn't be re-enterable).
export function navigateTo(
  id: string | null,
  { replace = false, cameFromHome = false } = {},
): Promise<void> {
  const url = new URL(location.href);
  if (id) url.searchParams.set("session", id);
  else url.searchParams.delete("session");
  const state = { cameFromHome };
  if (replace) history.replaceState(state, "", url.toString());
  else history.pushState(state, "", url.toString());
  return applyRoute(id);
}

async function applyRoute(id: string | null): Promise<void> {
  // A re-fired popstate and startSession's hop both land here.
  if (id && id === sync.getSessionId()) {
    setView("session");
    return;
  }

  if (!id) {
    // ORDER MATTERS: leave first, or persist() pushes the emptied lists and
    // wipes the session for everyone in it.
    sync.leaveSession();
    night.upNext = [];
    night.requests = [];
    persist();
    setView("home");
    loadHistory();
    return;
  }

  if (!isValidSessionId(id)) {
    sync.leaveSession();
    notices.home.show("That share link doesn’t look right.");
    await navigateTo(null, { replace: true });
    return;
  }

  try {
    await sync.joinSession(id, applyRemoteState);
    view.editingPast = false;
    readSync();
    persist();
    setView("session");
    // Sessions predating visibility get a listing row; a no-op otherwise,
    // crucially for one deliberately unlisted.
    if (view.mode === "full") sync.backfillListing();
  } catch (err) {
    sync.leaveSession();
    notices.home.show(
      err instanceof sync.SessionNotFoundError
        ? "That session wasn’t found. It may have been deleted."
        : `Couldn’t open that session: ${err instanceof Error ? err.message : String(err)}`,
    );
    await navigateTo(null, { replace: true });
  }
}

export function followBackButton() {
  window.addEventListener("popstate", () => applyRoute(currentRouteId()));
}

// "All sessions": a real history.back() when home is the previous entry, so
// bouncing between the list and a session doesn't grow the stack forever.
export function leaveToHome() {
  if (history.state?.cameFromHome) history.back();
  else navigateTo(null);
}

export function openSession(id: string) {
  return navigateTo(id, { cameFromHome: true });
}

export async function startSession({ createdAt, listed, editionId }: NewSessionChoice) {
  // Never null: every session names its book. If the listing never loaded,
  // the bare id will do (loadCatalogue enriches it).
  const chosenEdition = catalogue.editions.find((e) => e.id === editionId) || {
    id: editionId,
    title: "",
    description: "",
  };
  let id: string;
  try {
    id = await sync.createSession(
      () => ({ upNext: [], requests: [], edition: chosenEdition }),
      applyRemoteState,
      { createdBy: presence.displayName(night.name), listed, createdAt },
    );
  } catch (err) {
    if (sync.isPermissionDenied(err)) {
      overlays.newSession = false;
      loseOrganiserAccess();
    }
    throw err;
  }
  night.edition = chosenEdition;
  scopeCatalogueToEdition(editionId);
  night.upNext = [];
  night.requests = [];
  persist();
  overlays.newSession = false;
  await navigateTo(id, { cameFromHome: view.page === "home" });
  readSync();
}
