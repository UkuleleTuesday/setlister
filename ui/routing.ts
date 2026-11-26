// Two views, one page, no router: `?session=<id>` in the URL means "show that
// session", no param means "show the history". The URL is the only source of
// truth, which is what makes the phone's Back button (and iOS edge-swipe)
// work for free.

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
import { readStoredMode, resolveMode, writeStoredMode } from "./view-mode.js";
import { view } from "./view.svelte.js";

export function currentRouteId(): string | null {
  return new URLSearchParams(location.search).get("session");
}

// Which view of a session this device gets: the full app or the read-mostly
// room view (#86). Resolved from the URL plus the sticky flag on every route
// change, so `?mode=request` / `?mode=full` links work whenever they arrive
// and a room device stays a room device across plain-link reloads.
export function applyViewMode() {
  const resolved = resolveMode(new URLSearchParams(location.search), readStoredMode());
  writeStoredMode(resolved.store);
  view.mode = resolved.mode;
}

export function setView(page: "home" | "session") {
  view.page = page;
  applyViewMode();
  if (page === "home") overlays.share = false;
  overlays.settings = false; // reachable in both views, just closed
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

// Apply whatever the URL says. Safe to call repeatedly: popstate can re-fire
// the route we're already on.
async function applyRoute(id: string | null): Promise<void> {
  // Already connected to this session: nothing to join, but make sure it's
  // showing. Both a re-fired popstate and the hop from startSession land here.
  if (id && id === sync.getSessionId()) {
    setView("session");
    return;
  }

  if (!id) {
    // ORDER MATTERS. leaveSession() first: clearing the lists before detaching
    // would push the empty lists through persist() -> notifyLocalChange() and
    // wipe the session for everyone still in it. Once sync has torn down, its
    // pending push is cleared and flushPush early-returns, so nothing escapes.
    sync.leaveSession(); // also clears the session's createdAt
    night.upNext = [];
    night.requests = [];
    persist();
    setView("home");
    loadHistory();
    return;
  }

  // A malformed share link can't be a real session: say so without touching
  // Firestore.
  if (!isValidSessionId(id)) {
    sync.leaveSession();
    notices.home.show("That share link doesn’t look right.");
    await navigateTo(null, { replace: true });
    return;
  }

  try {
    await sync.joinSession(id, applyRemoteState);
    readSync();
    persist();
    setView("session");
    // Sessions predating visibility have no listing row; give them one so they
    // stop being invisible. A no-op for everything else, crucially including a
    // session someone deliberately unlisted. Best-effort, never blocks opening.
    sync.backfillListing();
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

/** Android's hardware Back and iOS's edge-swipe. */
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

// Starting a night: NewSessionSheet.svelte owns the fields, the planned-night
// gate and Start's states; this creates the session and goes there.
export async function startSession({ createdAt, listed, editionId }: NewSessionChoice) {
  // The session's songbook, picked on the sheet. Resolved through the editions
  // listing so the doc carries a real {id, title}; when the listing never
  // loaded the id alone is enough (loadCatalogue enriches it). Never null:
  // every session names its book explicitly.
  const chosenEdition = catalogue.editions.find((e) => e.id === editionId) || {
    id: editionId,
    title: "",
    description: "",
  };
  const id = await sync.createSession(
    () => ({ upNext: [], requests: [], edition: chosenEdition }),
    applyRemoteState,
    { createdBy: presence.displayName(night.name), listed, createdAt },
  );
  night.edition = chosenEdition;
  scopeCatalogueToEdition(editionId);
  night.upNext = [];
  night.requests = [];
  persist();
  overlays.newSession = false;
  await navigateTo(id, { cameFromHome: view.page === "home" });
  readSync();
}
