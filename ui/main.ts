// Everything that changes the night: the lists, sync and presence, routing,
// the catalogue, the request window's clock and the adds (by name and by
// photo). The state lives in the *.svelte.ts modules and App.svelte draws it;
// this file mounts the page and changes the state. Each change edits the
// state in place, then persist()s, which also pushes it to the session's
// peers.

import { flushSync, mount } from "svelte";
import App, { type AppHandlers } from "./App.svelte";
import type { NewSessionChoice } from "./NewSessionSheet.svelte";
import type { RequestAnswer } from "./RoomRequestSheet.svelte";
import type { RowActions } from "./Row.svelte";
import type { ScanOutcome } from "./ScanFlow.svelte";
import { API_BASE, type CatalogueResponse } from "./api.js";
import {
  catalogueNeedsRefresh,
  getCachedCatalogue,
  readCatalogueStore,
  saveCachedCatalogue,
} from "./catalogue-cache.js";
import { catalogue } from "./catalogue.svelte.js";
import { downscaleImage, resolveMaxEdge } from "./downscale.js";
import { duplicateLabel, findDuplicate, matchKey } from "./dupes.js";
import { parseEditions } from "./editions.js";
import { exportPayload, exportText, exportedRows } from "./export.js";
import { setBinned, setPlayed } from "./gig-state.js";
import { loadHistory } from "./history.svelte.js";
import {
  NAME_RESET_MESSAGE,
  readNameResetDone,
  resolveNameReset,
  writeNameResetDone,
} from "./name-reset.js";
import { night, nightSnapshot } from "./night.svelte.js";
import * as presence from "./presence.js";
import {
  cooldownLabel,
  cooldownRemaining,
  readLastRoomAdd,
  writeLastRoomAdd,
} from "./room-limits.js";
import { hasSavedState, readSavedState, writeSavedState } from "./saved-state.js";
import { planScan, requestParse } from "./scan.js";
import { isValidSessionId } from "./session-id.js";
import { linkNow, readSync, session } from "./session.svelte.js";
import { applySettings, settings, settingsSnapshot } from "./settings.svelte.js";
import { copyToClipboard, offerLink } from "./share-link.js";
import * as sync from "./sync.js";
import type { CatalogueEntry, ListState, RequestsSwitch, Row } from "./types.js";
import { buildSessionUrl, readStoredMode, resolveMode, writeStoredMode } from "./view-mode.js";
import { view } from "./view.svelte.js";
import { ASKER, hasVoted, seedAsker, toggleVote } from "./votes.js";

// --- The page ----------------------------------------------------------------
const rowActions: RowActions = {
  togglePlayed: (uid) => withRow(uid, (row) => setPlayed(row, !row.played)),
  toggleBinned: (uid) => withRow(uid, (row) => setBinned(row, !row.binned)),
  promote,
  demote,
  vote: toggleRowVote,
  setMatch: (uid, entry) => withRow(uid, (row) => setMatch(row, entry)),
  moveBy: (uid, delta) => {
    // Re-look-up the live index each time: the list shifts as it moves.
    const index = night.upNext.findIndex((e) => e.uid === uid);
    if (index !== -1) moveEntry(index, delta);
  },
  // Hold remote snapshots while a finger is on a row (see sync.ts).
  gesture: (active) => sync.setGestureActive(active),
};

const handlers: AppHandlers = {
  onBack: leaveToHome,
  onPickSession: (id) => navigateTo(id, { cameFromHome: true }),
  onStartSession: createNewSession,
  onAddTune: openSongbook,
  onChangeRoomName: () => requestSheet.open(null, night.name),
  onVisibility: changeVisibility,
  onRequestsMode: changeRequestsMode,
  onWindow: changeRequestsWindow,
  onShareLink: shareSessionLink,
  onShareRoomLink: shareRoomLink,
  onName: setPlayerName,
  // Settings survive a reload like the lists do: losing a toggle you set last
  // Tuesday reads as a bug at the club.
  onSettingChange: () => persist(),
  // Switching the book mid-session: cache-first swap like any other re-scope,
  // and an immediate persist() so a cached switch reaches the session's peers
  // even if the background refresh never lands (pub wifi).
  onEdition: (editionId) => {
    scopeCatalogueToEdition(editionId);
    persist();
  },
  onRequestConfirm,
  onSongbookPick,
  scan: runScan,
  onReviewConfirm,
  rowActions,
  onReorder: commitOrder,
  onCopy: copySetlist,
  onDownload: downloadSetlist,
};

// mount() doesn't run effects (bind:this among them); flushing hands back
// every part bound.
const page = mount(App, { target: document.body, props: { handlers } });
flushSync();
const {
  home,
  newSessionSheet,
  sharePanel,
  settingsPanel,
  requestSheet,
  songbookSheet,
  scanFlow,
  requestsSection,
  nameResetSheet,
} = page.parts();

// --- Saving ------------------------------------------------------------------
// Every change ends here: this device's copy (so a reload or an accidental
// close loses nothing) and, in a session, the debounced push to every peer.
// Both get plain copies, never the live state.
function persist() {
  const lists = nightSnapshot();
  writeSavedState({
    ...lists,
    name: night.name,
    // So a reload silently rejoins (see init()).
    sessionId: sync.getSessionId(),
    settings: settingsSnapshot(),
  });
  if (sync.getSessionId()) sync.notifyLocalChange(lists);
}

function restore() {
  const saved = readSavedState();
  if (saved.upNext) night.upNext = saved.upNext;
  if (saved.requests) night.requests = saved.requests;
  if (saved.votes) night.votes = saved.votes;
  if (saved.edition) night.edition = saved.edition;
  if (saved.name !== undefined) night.name = saved.name;
  applySettings(saved.settings);
}

function newUid(): string {
  return crypto.randomUUID
    ? crypto.randomUUID()
    : `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// --- The player's name -------------------------------------------------------
// Remembered across sessions so provenance survives a reload. In a session,
// also pushed to the presence roster, so overriding the generated name shows
// up for everyone at once. Three surfaces set it (the settings field, room
// mode's name sheet, the name amnesty), all through here.
function setPlayerName(value: string) {
  night.name = value;
  persist();
  presence.refreshPresence();
}

// The names saved in the full app drifted into jokes, so this build runs a
// name amnesty: once per device, the typed name is cleared and a sheet asks
// for a real one. The rules and the copy live in name-reset.ts, including why
// room devices are exempt and why a first-ever visitor never sees it. Runs at
// boot, before presence can broadcast the name anywhere.
function maybeResetName() {
  const plan = resolveNameReset({
    mode: view.mode,
    done: readNameResetDone(),
    hasSavedState: hasSavedState(),
  });
  if (plan.clearName && night.name) setPlayerName("");
  if (plan.markDone) writeNameResetDone();
  if (plan.showSheet) nameResetSheet.open(NAME_RESET_MESSAGE);
}

// --- The catalogue -------------------------------------------------------------
// Which edition the LOADED catalogue belongs to. Distinct from night.edition:
// on joining a session, night.edition names the session's book the instant
// the doc arrives, while the catalogue in memory is still whatever this
// device last searched. This is how applyRemoteState notices the gap.
let loadedCatalogueEditionId: string | null = null;

// Search should work the moment the app opens: hydrate from the last-seen
// catalogue for ONE edition, then let the network replace it. Returns whether
// it hit, so callers know if search is live or still waiting on the network.
function restoreCatalogueCache(editionId: string): boolean {
  const entry = getCachedCatalogue(readCatalogueStore(), editionId);
  if (!entry) return false;
  catalogue.entries = entry.catalogue;
  // Adopt the cached edition info when switching books (or starting blank),
  // but don't clobber a same-id edition that arrived with the session doc:
  // its title can be fresher than the cache's.
  if (!night.edition || night.edition.id !== editionId) night.edition = entry.edition;
  catalogue.generatedAt = entry.generatedAt || "";
  loadedCatalogueEditionId = editionId;
  catalogue.status = "ready";
  return true;
}

function saveCatalogueCache() {
  if (!night.edition?.id) return;
  saveCachedCatalogue(night.edition.id, {
    edition: night.edition,
    catalogue: catalogue.entries,
    generatedAt: catalogue.generatedAt,
  });
}

// Point the pickers at ONE edition's catalogue: cache first for instant
// search, network refresh behind it. On a cache miss the picker says "Loading
// the songbook…": better honest than quietly serving matches from the WRONG
// book while the fetch runs.
function scopeCatalogueToEdition(editionId: string) {
  catalogue.editionId = editionId;
  if (editionId !== loadedCatalogueEditionId) {
    if (!restoreCatalogueCache(editionId)) {
      catalogue.entries = [];
      catalogue.status = "loading";
    }
    loadCatalogue(editionId);
  } else {
    // Same book, but this tab may have been open since before the weekly
    // regen: joining or starting tonight's session is exactly when stale
    // pages would start landing in the shared list.
    refreshCatalogueIfStale();
  }
}

async function loadEditions() {
  try {
    const res = await fetch(`${API_BASE}/api/editions`);
    const editions = parseEditions(await res.json());
    if (!editions.length) return;
    catalogue.editions = editions;
    // Point the select at the session's book, now the listing can name it.
    catalogue.editionId = night.edition?.id || "current";
  } catch {
    /* keep the hardcoded "current" options */
  }
}

// Load the catalogue for an edition independently of any photo, so adding by
// name works before (or without) a scan. Never wipes the lists. Requests are
// sequenced: hopping between sessions with different books can leave two
// fetches in flight, and the slower (stale) one must not win.
let catalogueLoadSeq = 0;
// The edition the latest fetch asked for, and when: what a staleness re-check
// re-fetches. Not loadedCatalogueEditionId, which lags a switch still in
// flight, and re-fetching it would supersede the switch.
let catalogueLoadEditionId: string | null = null;
let catalogueLoadAttemptAt = 0;

async function loadCatalogue(edition: string) {
  const seq = ++catalogueLoadSeq;
  catalogueLoadEditionId = edition;
  catalogueLoadAttemptAt = Date.now();
  const failed = () => {
    catalogueLoadAttemptAt = 0; // retry on the next foreground, not in 15 min
    if (!catalogue.entries.length) catalogue.status = "error";
  };
  try {
    const res = await fetch(`${API_BASE}/api/catalogue?edition=${encodeURIComponent(edition)}`);
    if (seq !== catalogueLoadSeq) return;
    if (!res.ok) return failed();
    const data: CatalogueResponse = await res.json();
    if (seq !== catalogueLoadSeq) return;
    adoptCatalogue(data);
    loadedCatalogueEditionId = data.edition?.id || edition;
    // The edition is session state: pushing here is what makes a mid-session
    // book switch reach every peer at once, instead of riding along on the
    // next unrelated list edit. A no-op write when nothing changed.
    persist();
  } catch {
    // Leave any previously loaded catalogue in place.
    if (seq === catalogueLoadSeq) failed();
  }
}

// A catalogue fresh from the API (the catalogue endpoint, or a scan).
function adoptCatalogue(data: CatalogueResponse) {
  night.edition = data.edition;
  catalogue.entries = data.catalogue;
  catalogue.generatedAt = data.catalogue_generated_at || "";
  catalogue.status = "ready";
  saveCatalogueCache();
}

// Re-fetch the book in play if the last try is old. The weekly regen shifts
// every page after a rotated song, and a phone tab can live for days.
function refreshCatalogueIfStale() {
  if (!catalogueLoadEditionId) return;
  if (catalogueNeedsRefresh(catalogueLoadAttemptAt, Date.now())) {
    loadCatalogue(catalogueLoadEditionId);
  }
}

// A phone "reopens" the app by foregrounding a tab it never reloaded, so this,
// not a page load, is when a new night usually starts.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") refreshCatalogueIfStale();
});

// --- Sync --------------------------------------------------------------------
// Called by sync when a remote change arrives: swap in the fresh lists.
// persist() writes them back to localStorage (and is a no-op push, since sync
// just set lastRemote to this same state).
function applyRemoteState(state: ListState) {
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

// Presence and the request window's clock share the session's lifecycle:
// started on connect, stopped (presence retracting our doc) on leave. A
// deleted session says so and goes home.
sync.onStatusChange((status) => {
  readSync();
  if (status.status === "connected") {
    presence.startPresence(status.id, () => night.name);
    startClock();
  } else if (status.status === "expired") {
    presence.stopPresence();
    stopClock();
    showHomeError("That session is no longer there. It looks like it was deleted.");
    navigateTo(null, { replace: true });
  } else if (status.status === "left") {
    presence.stopPresence();
    stopClock();
  }
  if (!session.id) sharePanel.setOpen(false); // no session, nothing to share
});
sync.onMetaChange(readSync);
presence.onRoster((roster) => (session.roster = roster));

// Best-effort: retract our presence when the tab closes so peers see us go
// promptly. pagehide fires more reliably than beforeunload on mobile; if it's
// missed, the staleness window retires the doc anyway.
window.addEventListener("pagehide", presence.removeOnUnload);

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

// --- Routing -----------------------------------------------------------------
// Two views, one page, no router: `?session=<id>` in the URL means "show that
// session", no param means "show the history". The URL is the only source of
// truth, which is what makes the phone's Back button (and iOS edge-swipe) work
// for free; see the popstate listener below.
function currentRouteId(): string | null {
  return new URLSearchParams(location.search).get("session");
}

// Which view of a session this device gets: the full app or the read-mostly
// room view (#86). Resolved from the URL plus the sticky flag on every route
// change, so `?mode=request` / `?mode=full` links work whenever they arrive
// and a room device stays a room device across plain-link reloads.
function applyViewMode() {
  const resolved = resolveMode(new URLSearchParams(location.search), readStoredMode());
  writeStoredMode(resolved.store);
  view.mode = resolved.mode;
}

function setView(page: "home" | "session") {
  view.page = page;
  applyViewMode();
  if (page === "home") sharePanel.setOpen(false);
  settingsPanel.setOpen(false); // reachable in both views, just closed
}

// pushState for anything the user did (so Back retraces it), replaceState for
// load-time normalisation and error recovery (which shouldn't be re-enterable).
function navigateTo(
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
  // showing. Both a re-fired popstate and the hop from createSession land here.
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
    scanFlow.closeReview();
    persist();
    setView("home");
    loadHistory();
    return;
  }

  // A malformed share link can't be a real session: say so without touching
  // Firestore.
  if (!isValidSessionId(id)) {
    sync.leaveSession();
    showHomeError("That share link doesn’t look right.");
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
    showHomeError(
      err instanceof sync.SessionNotFoundError
        ? "That session wasn’t found. It may have been deleted."
        : `Couldn’t open that session: ${errorMessage(err)}`,
    );
    await navigateTo(null, { replace: true });
  }
}

// Android's hardware Back and iOS's edge-swipe both land here.
window.addEventListener("popstate", () => {
  applyRoute(currentRouteId());
});

// "All sessions": a real history.back() when home is the previous entry, so
// bouncing between the list and a session doesn't grow the stack forever.
function leaveToHome() {
  if (history.state?.cameFromHome) history.back();
  else navigateTo(null);
}

function showSessionError(message: string) {
  scanFlow.showError(message);
}

function showHomeError(message: string) {
  home.showError(message);
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// --- Sharing -----------------------------------------------------------------
// The full-app link. Carries the night's date in the share payload, so the
// recipient sees which session this is, not a generic app title. The
// explicit `mode=full` is what lets it pull a sticky room phone into the app.
async function shareSessionLink(): Promise<boolean> {
  const id = sync.getSessionId();
  if (!id) return false;
  const label = session.label;
  return offerLink(
    buildSessionUrl(location.href, id),
    label ? `${label} · Ukulele Tuesday` : "Ukulele Tuesday setlist",
  );
}

// The room-view link (#86): what goes to the room's WhatsApp group.
async function shareRoomLink(): Promise<boolean> {
  const id = sync.getSessionId();
  if (!id) return false;
  const label = session.label;
  return offerLink(
    buildSessionUrl(location.href, id, { room: true }),
    label ? `Requests for ${label} · Ukulele Tuesday` : "Ukulele Tuesday requests",
  );
}

// The share panel's three metadata writes. Each shows the pick at once and
// reverts it if this rejects: one tap that has to survive a flaky pub wifi.
// Shared / Unlisted removes the row from the club's list only: the link keeps
// working, which the panel says out loud.
async function changeVisibility(listed: boolean) {
  await metadataWrite("the session’s visibility", () => sync.setSessionListed(listed));
}

// Auto / Taking requests / View only. View only takes the add button off
// every room phone on the session (live, through onMetaChange) and points
// them at the whiteboard; forcing it open does the opposite whatever the
// schedule; auto hands control back to the window.
async function changeRequestsMode(mode: RequestsSwitch) {
  await metadataWrite("the request link", () => sync.setRequestsMode(mode));
}

// The two override time fields. The panel always sends both sides' current
// values, so one save can't silently clear the other.
async function changeRequestsWindow(times: { opensAt: Date | null; closesAt: Date | null }) {
  await metadataWrite("the request window", () => sync.setRequestsWindow(times));
}

async function metadataWrite(what: string, write: () => Promise<void>) {
  scanFlow.clearError();
  try {
    await write();
  } catch (err) {
    showSessionError(`Couldn’t change ${what}: ${errorMessage(err)}`);
    throw err;
  }
  // sync applies its own write to its copy at once; the snapshot announcing
  // it can take a round trip, and the panel shouldn't wait for that.
  readSync();
}

// --- New session -------------------------------------------------------------
// NewSessionSheet.svelte owns the fields, the planned-night gate and Start's
// states; creating the session is app state, so it happens here.
async function createNewSession({ createdAt, listed, editionId }: NewSessionChoice) {
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
  newSessionSheet.close();
  await navigateTo(id, { cameFromHome: view.page === "home" });
  readSync();
}

// --- Adding by name ----------------------------------------------------------
// SongbookSheet.svelte: the whole book, browsable, with tonight's state on
// every tune. A tap does whatever actually helps: a new tune goes to the
// confirm sheet, one already asked for gets this phone's thumbs up, a played
// one says so and stays put. Those decisions are app state, so they're here.
function openSongbook() {
  songbookSheet.open();
}

// The same flow in both modes. The one room-only part is the request link's
// brakes (open/closed and the one-a-minute wait, see room-limits.ts): they
// govern that link, and an organiser adds whatever the switch says.
function onSongbookPick(entry: CatalogueEntry) {
  const room = view.mode === "room";
  // Belt and braces: App closes this sheet when the door shuts, but a tap can
  // race the change.
  if (room && !linkNow().open) {
    songbookSheet.close();
    requestsSection.flash("Requests are closed. Try the whiteboard of wishes!");
    return;
  }
  const existing = findDuplicate(night.upNext, night.requests, matchKey(entry));
  if (existing?.where === "played") {
    songbookSheet.note(`“${entry.title}” was played earlier tonight. Pick another?`);
    return;
  }
  if (existing) {
    // Already asked for: what this person wants is for it to be played, and
    // the thumbs up says exactly that. Add-only, never a toggle, so a second
    // tap can't quietly take the vote back.
    const clientId = presence.getClientId();
    const already = hasVoted(night.votes, existing.row.uid, clientId);
    if (!already) {
      night.votes = seedAsker(night.votes, existing.row.uid, clientId);
      persist();
    }
    songbookSheet.close();
    requestsSection.flash(
      already
        ? `You already want “${entry.title}”. Fingers crossed!`
        : `Your thumbs up is on “${entry.title}”.`,
    );
    return;
  }
  // The wait only gates new requests, so it's checked last: thumbs up and
  // browsing carry on through it.
  const waiting = room ? cooldownRemaining(readLastRoomAdd(), Date.now()) : 0;
  if (waiting) {
    songbookSheet.note(`One at a time! You can add another in ${cooldownLabel(waiting)}.`);
    return;
  }
  songbookSheet.close();
  requestSheet.open(entry, night.name);
}

// RoomRequestSheet.svelte confirms a pick (and asks the name on the first
// one), or renames from "change". The name is committed here, not per
// keystroke, so an abandoned sheet leaves it untouched. The request then goes
// in as part of the same tap, so it can't be lost between the two.
function onRequestConfirm({ entry, name, comment }: RequestAnswer) {
  if (name !== null) setPlayerName(name);
  // The door can shut (or the window lapse) while this sheet is open. App
  // dismisses it when that happens, but a tap racing the change gets here.
  if (entry && view.mode === "room" && !linkNow().open) {
    requestsSection.flash("Requests just closed. Try the whiteboard of wishes!");
    return;
  }
  // addManualEntry re-runs the duplicate guard (the pool may have moved while
  // the sheet was open) and flashes its own note if it refuses. On success say
  // so (the sheet just covered the pool where the row landed) and set the
  // expectation for the cool-down before it bites.
  if (entry && addManualEntry(entry, comment)) {
    requestsSection.flash(
      view.mode === "room"
        ? `Added “${entry.title}”. Next one in a minute.`
        : `Added “${entry.title}”.`,
    );
  }
}

// Returns whether a row was actually added, so the request sheet can tell a
// completed pick from a refusal. `comment` reuses the row's `notes` slot: the
// same field a scanned board annotation ("please NO!!!") lands in, so it
// syncs and renders with no new schema.
function addManualEntry(entry: CatalogueEntry, comment: string): boolean {
  // Same song already on the night's lists (#52)? Say where it is instead of
  // quietly doubling it. Binned copies don't block; see dupes.ts.
  const existing = findDuplicate(night.upNext, night.requests, matchKey(entry));
  if (existing) {
    requestsSection.flash(duplicateLabel(existing.where));
    return false;
  }
  const uid = newUid();
  night.requests.push({
    uid,
    source: view.mode === "room" ? "room" : "manual",
    addedBy: presence.displayName(night.name),
    raw_title: entry.display,
    raw_page: entry.page,
    notes: (comment || "").trim().slice(0, 120) || null,
    crossed_out: false,
    status: "confirmed",
    method: "none",
    confidence: 1,
    match: entry,
    alternatives: [],
    explanation: "Added manually",
    removed: false,
    played: false,
    binned: false,
  });
  // Asking for a song IS wanting it, so it counts as this device's vote (#83).
  // One row added by one person, so it's attributed rather than anonymous:
  // their thumb lights up, and the tap they'd otherwise spend upvoting their
  // own request is already spent.
  night.votes = seedAsker(night.votes, uid, presence.getClientId());
  // Start the cool-down from the moment a request actually lands, not from the
  // pick that opened the sheet: a slow typist shouldn't spend their wait
  // inside the dialog. Persisted, so a reload isn't a way around it.
  if (view.mode === "room") writeLastRoomAdd(Date.now());
  persist();
  return true;
}

// --- The photo scan ----------------------------------------------------------
// ScanFlow.svelte owns the screens (photo, overlay, cancel and timeout,
// errors, the review sheet); this is what a scan does to the night.
function rowToEntry(row: Omit<Row, "uid">): Row {
  return {
    ...row,
    uid: newUid(),
    source: "scan",
    addedBy: presence.displayName(night.name),
    removed: false,
    played: false,
    binned: false,
  };
}

// One photo, start to finish: shrink it, send it, take the catalogue it
// brings back, and add the confident rows straight to Requests. Returns what's
// left for review. Rejects (abort included) for ScanFlow to word.
async function runScan(file: File, signal: AbortSignal): Promise<ScanOutcome> {
  // The long edge governs the upload, not just the server's resize: the
  // camera's 3–8MB original would be thrown away server-side anyway (#44).
  const { maxImageEdge, model, disableThinking, sendCatalogue } = settings;
  const maxEdge = resolveMaxEdge(maxImageEdge);
  const upload = await downscaleImage(file, { maxEdge });
  const data = await requestParse(
    API_BASE,
    upload,
    {
      // The session's book, not the select: night.edition is the source of
      // truth and the two only diverge for the beat before the select syncs.
      edition: night.edition?.id || catalogue.editionId,
      // Tuning knobs from the settings panel: the API clamps or ignores
      // anything out of range and falls back to its configured defaults.
      model,
      disableThinking,
      sendCatalogue,
      maxImageEdge: maxEdge,
    },
    signal,
  );
  adoptCatalogue(data);
  const { fresh, flagged, skipped } = planScan(
    data.rows.map(rowToEntry),
    night.upNext,
    night.requests,
  );
  if (fresh.length) {
    night.requests.push(...fresh);
    // Whoever wrote each of these on the board counts as its asker, so board
    // requests start level with app ones (#83). Anonymous, not attributed to
    // the person holding the camera: one photo makes many rows and they asked
    // for none of them.
    for (const row of fresh) night.votes = seedAsker(night.votes, row.uid, ASKER);
    persist();
  }
  return { flagged, autoAdded: fresh.length, autoSkipped: skipped };
}

// What review kept goes to Requests, each row its board asker's vote.
function onReviewConfirm(kept: Row[]) {
  night.requests.push(...kept);
  for (const row of kept) night.votes = seedAsker(night.votes, row.uid, ASKER);
  persist();
}

// --- Row changes -------------------------------------------------------------
// The row behind a uid, changed in place and saved.
function withRow(uid: string, change: (row: Row) => void) {
  const row = [...night.upNext, ...night.requests].find((e) => e.uid === uid);
  if (!row) return;
  change(row);
  persist();
}

// diff() turns a vote into a single `votes.<uid>.<clientId>` leaf write, so
// two people voting at once both land.
function toggleRowVote(uid: string) {
  night.votes = toggleVote(night.votes, uid, presence.getClientId());
  persist();
}

function setMatch(row: Row, entry: CatalogueEntry | null) {
  row.match = entry;
  row.status = entry ? "confirmed" : "unmatched";
  row.explanation = entry ? "Manually selected" : "";
  row.alternatives = [];
}

function promote(uid: string) {
  const index = night.requests.findIndex((e) => e.uid === uid);
  if (index === -1) return;
  const [item] = night.requests.splice(index, 1);
  night.upNext.push(item);
  persist();
}

function demote(uid: string) {
  const index = night.upNext.findIndex((e) => e.uid === uid);
  if (index === -1) return;
  const [item] = night.upNext.splice(index, 1);
  night.requests.push(item);
  persist();
}

// Played/binned rows sit interleaved in the array but not in the visible list,
// so a one-slot move must land past the next *visible* neighbour; otherwise
// the row burrows invisibly through a hidden cluster one keypress at a time.
function moveEntry(index: number, delta: number) {
  const hidden = (e: Row) => e.played || e.binned;
  let target = index + delta;
  while (target >= 0 && target < night.upNext.length && hidden(night.upNext[target])) {
    target += delta;
  }
  if (target < 0 || target >= night.upNext.length) return;
  const [item] = night.upNext.splice(index, 1);
  night.upNext.splice(target, 0, item);
  persist();
}

// A drag ended (UpNextSection.svelte): the visible rows' uids in their new
// order. Played/binned rows aren't among them, so indexOf gives them -1 and
// the (stable) sort parks them at the front in their existing order. That's
// relied on: played songs belong at the top conceptually, and binned rows are
// position-agnostic until un-binned.
function commitOrder(uids: string[]) {
  night.upNext.sort((a, b) => uids.indexOf(a.uid) - uids.indexOf(b.uid));
  persist();
}

// --- Export ------------------------------------------------------------------
function currentExport(): Row[] {
  return exportedRows(night.upNext, night.requests, settings.includeCrossed);
}

async function copySetlist() {
  await copyToClipboard(exportText(currentExport()));
}

function downloadSetlist() {
  const lists = nightSnapshot();
  const rows = exportedRows(lists.upNext, lists.requests, settings.includeCrossed);
  const payload = exportPayload(lists.edition, catalogue.generatedAt, rows);
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "requests.json";
  a.click();
  URL.revokeObjectURL(a.href);
}

// --- Boot --------------------------------------------------------------------
async function init() {
  restore();
  // Resolve the view mode before the first paint: the lists key row
  // interactivity off it, so a sticky room device must know before painting.
  applyViewMode();
  // After restore() (there must be a name to clear) and applyViewMode() (the
  // amnesty is full-view only), before any presence write.
  maybeResetName();
  // Hydrate search from the cached catalogue at once; the network fetch below
  // replaces it (a Cloud Function cold start can take several seconds). Keyed
  // by the edition restore() brought back: joining a session with a different
  // book re-scopes via applyRemoteState.
  catalogue.editionId = night.edition?.id || "current";
  restoreCatalogueCache(catalogue.editionId);

  // Paint the right view before any network work, so a cold open shows the
  // history (with its own loading note) straight away. The route lives in the
  // URL, so a mid-gig reload lands back in the session it was in.
  const routeId = currentRouteId();
  setView(routeId ? "session" : "home");

  // Routing, editions and the catalogue are independent requests: don't
  // waterfall them. Firestore is on the critical path for every user (the
  // history needs it), so it must not gate the catalogue.
  await Promise.all([
    navigateTo(routeId, { replace: true }),
    loadEditions(),
    loadCatalogue(catalogue.editionId),
  ]);
}

init();
