// The night's state and everything that changes it: the two lists, sync and
// presence, routing, the catalogue, the request link's window and the adds
// (by name and by photo). App.svelte draws the page; this file mounts it,
// keeps `shell` (the chrome) current and drives the parts through their
// exports. Each change follows the same pattern: mutate `app`, re-render the
// parts that show it, persist() (which also pushes to the session's peers).

import { flushSync, mount } from "svelte";
import App, { type AppHandlers } from "./App.svelte";
import type { NewSessionChoice } from "./NewSessionSheet.svelte";
import type { RequestAnswer } from "./RoomRequestSheet.svelte";
import type { RowActions } from "./Row.svelte";
import type { ScanContext, ScanOutcome } from "./ScanFlow.svelte";
import type { Settings } from "./SettingsPanel.svelte";
import type { RequestsMode } from "./SharePanel.svelte";
import { API_BASE, type CatalogueResponse } from "./api.js";
import {
  catalogueNeedsRefresh,
  getCachedCatalogue,
  readCatalogueStore,
  saveCachedCatalogue,
} from "./catalogue-cache.js";
import { downscaleImage, resolveMaxEdge } from "./downscale.js";
import { duplicateLabel, findDuplicate, matchKey } from "./dupes.js";
import { editionLabel } from "./editions.js";
import { exportPayload, exportText, exportedRows } from "./export.js";
import { setBinned, setPlayed } from "./gig-state.js";
import type { ListsData } from "./lists.js";
import {
  NAME_RESET_MESSAGE,
  readNameResetDone,
  resolveNameReset,
  writeNameResetDone,
} from "./name-reset.js";
import * as presence from "./presence.js";
import {
  type RequestWindow,
  effectiveRequestsOpen,
  minutesUntilOpen,
  openingSoonLabel,
  resolveWindow,
  windowStatus,
} from "./request-window.js";
import {
  cooldownLabel,
  cooldownRemaining,
  readLastRoomAdd,
  writeLastRoomAdd,
} from "./room-limits.js";
import { hasSavedState, readSavedState, writeSavedState } from "./saved-state.js";
import { planScan, requestParse } from "./scan.js";
import { isValidSessionId } from "./session-id.js";
import { pageTitle, sessionDateLabel, sessionTimeLabel } from "./session-index.js";
import { copyToClipboard, offerLink } from "./share-link.js";
import { BRAND_TITLE, shell } from "./shell.svelte.js";
import type { CatalogueStatus } from "./songbook.js";
import * as sync from "./sync.js";
import type { CatalogueEntry, Edition, ListState, Row, SessionMeta, Votes } from "./types.js";
import {
  type ViewMode,
  buildSessionUrl,
  readStoredMode,
  resolveMode,
  writeStoredMode,
} from "./view-mode.js";
import { ASKER, hasVoted, seedAsker, toggleVote } from "./votes.js";

// The two lists are the durable, primary objects. Adds (by name or snap) land
// in `requests`, the incoming pool; the organiser promotes entries into
// `upNext`, the running order. The catalogue is loaded per edition,
// independently of any scan, and feeds matching and the songbook.
interface Night {
  edition: Edition | null;
  catalogue: CatalogueEntry[];
  catalogueGeneratedAt: string;
  // The name the user typed, or "": the raw setting, not the identity. Every
  // surface that shows a person resolves it through presence.displayName(),
  // which falls back to this device's stable anonymous name, so an unnamed
  // player reads the same in `addedBy`, "Here now" and "Started by".
  name: string;
  upNext: Row[];
  requests: Row[];
  // Upvotes on requests (#83), keyed by row rather than stored on it: see the
  // header in votes.ts for why that is a correctness requirement.
  votes: Votes;
}

const app: Night = {
  edition: null,
  catalogue: [],
  catalogueGeneratedAt: "",
  name: "",
  upNext: [],
  requests: [],
  votes: {},
};

// --- The page ----------------------------------------------------------------
const rowActions: RowActions = {
  togglePlayed: (uid) => withRow(uid, togglePlayed),
  toggleBinned: (uid) => withRow(uid, toggleBinned),
  promote,
  demote,
  vote: toggleRowVote,
  setMatch: (uid, entry) => withRow(uid, (row) => setMatch(row, entry)),
  moveBy: (uid, delta) => {
    // Re-look-up the live index each time: the list shifts as it moves.
    const index = app.upNext.findIndex((e) => e.uid === uid);
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
  onChangeRoomName: () => openRequestSheet(null),
  onVisibility: changeVisibility,
  onRequestsMode: changeRequestsMode,
  onWindow: changeRequestsWindow,
  onShareLink: shareSessionLink,
  onShareRoomLink: shareRoomLink,
  onName: setPlayerName,
  // Settings survive a reload like the lists do: losing a toggle you set last
  // Tuesday reads as a bug at the club.
  onSettingChange: (key: keyof Settings) => {
    if (key === "showSuggestions") rerender();
    persist();
  },
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
  onReviewChange,
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
  upNextSection,
  requestsSection,
  binGroup,
  nameResetSheet,
} = page.parts();

// --- The player's name -------------------------------------------------------
// Remembered across sessions so provenance survives a reload. In a session,
// also pushed to the presence roster, so overriding the generated name shows
// up for everyone at once. Three surfaces set it (the settings field, room
// mode's name sheet, the name amnesty), all through here so none can leave a
// stale value.
function setPlayerName(value: string) {
  app.name = value;
  settingsPanel.setName(value);
  persist();
  presence.refreshPresence();
}

// Room mode's name, once set, is fire-and-forget: this one quiet line is all
// that remains of it.
function renderRoomIdentity() {
  const name = app.name.trim();
  shell.roomIdentity = name ? `As ${name}` : "";
}

// RoomRequestSheet.svelte confirms a pick (and asks the name on the first
// one); `null` opens it as a plain rename, from "change".
function openRequestSheet(entry: CatalogueEntry | null) {
  requestSheet.open(entry, app.name);
}

// Confirming: the name is committed here, not per keystroke, so an abandoned
// sheet leaves app.name untouched. The request then goes in as part of the
// same tap, so it can't be lost between the two.
function onRequestConfirm({ entry, name, comment }: RequestAnswer) {
  if (name !== null) setPlayerName(name);
  renderRoomIdentity();
  // The door can shut (or the window lapse) while this sheet is open.
  // applyRequestsOpen() dismisses it when that happens, but a tap racing the
  // change gets here.
  if (entry && viewMode === "room" && !requestsState().open) {
    requestsSection.flash("Requests just closed. Try the whiteboard of wishes!");
    return;
  }
  // addManualEntry re-runs the duplicate guard (the pool may have moved while
  // the sheet was open) and flashes its own note if it refuses. On success say
  // so (the sheet just covered the pool where the row landed) and set the
  // expectation for the cool-down before it bites.
  if (entry && addManualEntry(entry, comment)) {
    requestsSection.flash(
      viewMode === "room"
        ? `Added “${entry.title}”. Next one in a minute.`
        : `Added “${entry.title}”.`,
    );
  }
}

function newUid(): string {
  return crypto.randomUUID
    ? crypto.randomUUID()
    : `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// --- Persistence -------------------------------------------------------------
function persist() {
  writeSavedState({
    upNext: app.upNext,
    requests: app.requests,
    votes: app.votes,
    edition: app.edition,
    name: app.name,
    // So a reload silently rejoins (see init()).
    sessionId: sync.getSessionId(),
    settings: settingsPanel.settings(),
  });
  // Every mutation already funnels through persist(), so this single choke
  // point pushes local changes to every session peer. Through sessionState()
  // rather than a second literal: this listed the synced fields by hand and
  // drifted the moment one was added, pushing everything except the new field
  // and making it look like sync was dropping writes.
  if (sync.getSessionId()) sync.notifyLocalChange(sessionState());
}

function restore() {
  const saved = readSavedState();
  if (saved.upNext) app.upNext = saved.upNext;
  if (saved.requests) app.requests = saved.requests;
  if (saved.votes) app.votes = saved.votes;
  if (saved.edition) app.edition = saved.edition;
  if (saved.name !== undefined) app.name = saved.name;
  settingsPanel.apply(saved.settings);
}

function sessionState(): ListState {
  return {
    upNext: app.upNext,
    requests: app.requests,
    edition: app.edition,
    votes: app.votes,
  };
}

// --- The catalogue -------------------------------------------------------------
// Drives the pickers' placeholder states: "loading" until a catalogue is
// available (cache or network), "error" when the fetch failed and there's
// nothing to search, so an empty list never masquerades as "no matches".
let catalogueStatus: CatalogueStatus = "loading";

// Which edition the LOADED catalogue belongs to. Distinct from app.edition:
// on joining a session, app.edition names the session's book the instant the
// doc arrives, while the catalogue in memory is still whatever this device
// last searched. This is how applyRemoteState notices the gap.
let loadedCatalogueEditionId: string | null = null;

// The fetched editions listing, kept for the new-session sheet and for
// resolving a picked id back to its {id, title} on create. Empty until (and
// unless) /api/editions answers: both selects ship a hardcoded "current"
// option so the default path never depends on this request.
let editionsList: Edition[] = [];

// Search should work the moment the app opens: hydrate from the last-seen
// catalogue for ONE edition, then let the network replace it. Returns whether
// it hit, so callers know if search is live or still waiting on the network.
function restoreCatalogueCache(editionId: string): boolean {
  const entry = getCachedCatalogue(readCatalogueStore(), editionId);
  if (!entry) return false;
  app.catalogue = entry.catalogue;
  // Adopt the cached edition info when switching books (or starting blank),
  // but don't clobber a same-id edition that arrived with the session doc:
  // its title can be fresher than the cache's.
  if (!app.edition || app.edition.id !== editionId) app.edition = entry.edition;
  app.catalogueGeneratedAt = entry.generatedAt || "";
  loadedCatalogueEditionId = editionId;
  catalogueStatus = "ready";
  return true;
}

function saveCatalogueCache() {
  if (!app.edition?.id) return;
  saveCachedCatalogue(app.edition.id, {
    edition: app.edition,
    catalogue: app.catalogue,
    generatedAt: app.catalogueGeneratedAt,
  });
}

// Point the pickers at ONE edition's catalogue: cache first for instant
// search, network refresh behind it. On a cache miss the picker says "Loading
// the songbook…": better honest than quietly serving matches from the WRONG
// book while the fetch runs.
function scopeCatalogueToEdition(editionId: string) {
  if (editionId !== loadedCatalogueEditionId) {
    if (!restoreCatalogueCache(editionId)) {
      app.catalogue = [];
      catalogueStatus = "loading";
    }
    refreshPickers();
    loadCatalogue(editionId);
  } else {
    // Same book, but this tab may have been open since before the weekly
    // regen: joining or starting tonight's session is exactly when stale
    // pages would start landing in the shared list.
    refreshCatalogueIfStale();
  }
  // The settings select grows an option for an id the listing doesn't know
  // (editions may still be loading when the doc arrives).
  settingsPanel.selectEdition(editionId);
}

async function loadEditions() {
  try {
    const res = await fetch(`${API_BASE}/api/editions`);
    const data: { editions?: unknown } = await res.json();
    if (!Array.isArray(data.editions) || !data.editions.length) return;
    editionsList = data.editions;
  } catch {
    /* keep the hardcoded "current" options */
    return;
  }
  settingsPanel.setEditions(editionsList);
  settingsPanel.selectEdition(app.edition?.id || "current");
  newSessionSheet.setEditions(editionsList.map((e) => ({ id: e.id, label: editionLabel(e) })));
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
    if (!app.catalogue.length) catalogueStatus = "error";
    refreshPickers();
  };
  try {
    const res = await fetch(`${API_BASE}/api/catalogue?edition=${encodeURIComponent(edition)}`);
    if (seq !== catalogueLoadSeq) return;
    if (!res.ok) return failed();
    const data: CatalogueResponse = await res.json();
    if (seq !== catalogueLoadSeq) return;
    app.edition = data.edition;
    app.catalogue = data.catalogue;
    app.catalogueGeneratedAt = data.catalogue_generated_at;
    loadedCatalogueEditionId = data.edition?.id || edition;
    catalogueStatus = "ready";
    saveCatalogueCache();
    // The edition is session state: pushing here is what makes a mid-session
    // book switch reach every peer at once, instead of riding along on the
    // next unrelated list edit. A no-op write when nothing changed.
    persist();
    renderLists();
    refreshPickers();
  } catch {
    // Leave any previously loaded catalogue in place.
    if (seq === catalogueLoadSeq) failed();
  }
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

// Open pickers re-run their query when the catalogue (finally) arrives: text
// typed during a slow load must not silently read as "no such song".
function refreshPickers() {
  scanFlow.refresh(scanContext());
  refreshSongbook();
}

// --- Sync --------------------------------------------------------------------
// Called by sync when a remote change arrives: swap in the fresh lists and
// re-render. persist() writes them back to localStorage (and is a no-op push,
// since sync just set lastRemote to this same state).
function applyRemoteState(state: ListState) {
  app.upNext = state.upNext;
  app.requests = state.requests;
  app.votes = state.votes || {};
  // The doc is authoritative even when it says null (a session predating
  // per-session books): keeping this device's old edition would push it into
  // the shared doc on the persist() below, hijacking the session's book.
  app.edition = state.edition ?? null;
  // The session's songbook is the one everyone searches: when the doc names a
  // different edition than the loaded catalogue (joining a themed night, or a
  // peer switching books mid-session), re-scope the pickers to it. Sessions
  // from before editions carry null; those read as the default book.
  scopeCatalogueToEdition(state.edition?.id || "current");
  renderLists();
  persist();
}

// Keep the UI honest when the engine changes state on its own, most
// importantly when the remote doc goes away underneath us. Presence and the
// request window's tick share the session's lifecycle: started on connect,
// stopped (presence retracting our doc) on leave.
sync.onStatusChange((status) => {
  if (status.status === "connected") {
    presence.startPresence(status.id, () => app.name);
    startRequestWindowTimer();
  } else if (status.status === "expired") {
    presence.stopPresence();
    stopRequestWindowTimer();
    showHomeError("That session is no longer there. It looks like it was deleted.");
    navigateTo(null, { replace: true });
  } else if (status.status === "left") {
    presence.stopPresence();
    stopRequestWindowTimer();
  }
  updateShareUi();
});

// Best-effort: retract our presence when the tab closes so peers see us go
// promptly. pagehide fires more reliably than beforeunload on mobile; if it's
// missed, the staleness window retires the doc anyway.
window.addEventListener("pagehide", presence.removeOnUnload);

// The session's date label and visibility, wherever they're shown: the header
// title, the share popover, the request link's state and the tab.
function renderSessionMeta() {
  if (shell.view === "session") shell.title = currentSessionLabel();
  refreshSharePanel();
  applyRequestsOpen();
  // The room's empty note changes with the switch, and a room device may be
  // sitting on this session right now.
  renderLists();
  updateDocumentTitle();
}
sync.onMetaChange(renderSessionMeta);

// "Who's here": the share panel's roster and the count on the share button,
// re-rendered whenever a peer joins, leaves or renames.
let connectedCount = 0;
presence.onRoster((roster) => {
  connectedCount = roster.length;
  const id = sync.getSessionId();
  shell.shareCount = id ? connectedCount : 0;
  sharePanel.setRoster(id ? roster : []);
  updateShareUi();
});

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
// and a room device stays a room device across plain-link reloads. Room only
// applies while a session is showing: home renders normally either way.
let viewMode: ViewMode = "full";
function applyViewMode() {
  const resolved = resolveMode(new URLSearchParams(location.search), readStoredMode());
  writeStoredMode(resolved.store);
  viewMode = resolved.mode;
  const room = viewMode === "room" && shell.view === "session";
  shell.room = room;
  // Before the first paint, so a device landing on a closed session never
  // flashes an add button it can't use.
  applyRequestsOpen();
  if (room) renderRoomIdentity();
}

function setView(view: "home" | "session") {
  const atHome = view === "home";
  shell.view = view;
  applyViewMode();
  shell.title = atHome ? BRAND_TITLE : currentSessionLabel();
  // The songbook select edits the session's book, for everyone; on home the
  // choice belongs to the new-session sheet instead.
  settingsPanel.setEditionVisible(!atHome);
  if (atHome) {
    sharePanel.setOpen(false);
    shell.shareCount = 0;
  }
  settingsPanel.setOpen(false); // reachable in both views, just closed
  updateDocumentTitle();
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
    app.upNext = [];
    app.requests = [];
    scanFlow.closeReview();
    persist();
    renderLists();
    setView("home");
    updateShareUi();
    home.refresh();
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
    persist();
    setView("session");
    updateShareUi();
    renderSessionMeta();
    // Sessions predating visibility have no listing row; give them one so they
    // stop being invisible. A no-op for everything else, crucially including a
    // session someone deliberately unlisted. Best-effort, never blocks opening.
    sync.backfillListing();
  } catch (err) {
    sync.leaveSession();
    showHomeError(
      err instanceof sync.SessionNotFoundError
        ? "That session wasn’t found. It may have been deleted."
        : `Couldn’t open that session: ${err instanceof Error ? err.message : String(err)}`,
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

// What the current session is called: its date, rendered live. Falls back to
// the id only for a session with no createdAt, which shouldn't happen but
// beats an empty title. The date comes from sync, in step with the snapshot.
function currentSessionLabel(): string {
  return sessionDateLabel(sync.getCreatedAt()) || sync.getSessionId() || "";
}

// One funnel for the tab title so route changes and metadata updates can't
// disagree.
function updateDocumentTitle() {
  document.title = pageTitle(shell.view === "session" ? currentSessionLabel() : "");
}

// --- The request link (#86) --------------------------------------------------
// The composed answer to "is the room's request link taking tunes right now":
// a forced override always wins, otherwise the window decides. One funnel so
// every gating call site (the confirm sheet, the songbook, the empty-state
// copy, voting) answers against the SAME instant; nobody recomputes `now()`
// separately, so a slow tap can't straddle two different answers.
function requestsState(now = new Date()) {
  const meta = sync.getMeta();
  const reqWindow = resolveWindow({
    sessionCreatedAt: sync.getCreatedAt(),
    opensAtOverride: meta.requestsOpensAt,
    closesAtOverride: meta.requestsClosesAt,
  });
  const open = effectiveRequestsOpen({ mode: meta.requestsOpen, window: reqWindow, now });
  // Only auto mode has a meaningful "opening soon": a forced-closed room
  // isn't about to open no matter what the clock says.
  const soonMinutes = !open && meta.requestsOpen === null ? minutesUntilOpen(reqWindow, now) : null;
  return { open, soonMinutes, window: reqWindow };
}

const OPEN_NOTE =
  "The request link is a view for the room: people can add tunes and follow the set, not change it.";
const CLOSED_NOTE =
  "View only: people can open tonight's pool and set and watch them, but can't add to them. The whiteboard carries on as usual.";

// The note next to the share buttons describes the link's CURRENT state, so
// the panel can't promise people can add tunes while the switch says they
// can't. Forced open/closed keep the fixed copy above; auto names the
// resolved boundary so the organiser sees the schedule without opening the
// time fields.
function requestNoteText(meta: SessionMeta, open: boolean, reqWindow: RequestWindow | null) {
  if (meta.requestsOpen === true) return OPEN_NOTE;
  if (meta.requestsOpen === false) return CLOSED_NOTE;
  if (!reqWindow) return open ? OPEN_NOTE : CLOSED_NOTE;
  return open
    ? `Auto: taking requests until ${sessionTimeLabel(reqWindow.closesAt)}. People can add tunes and follow the set, not change it.`
    : `Auto: not open yet, opens at ${sessionTimeLabel(reqWindow.opensAt)}. View only until then.`;
}

// Called on arrival (applyViewMode), when a peer's flip lands live
// (renderSessionMeta), and by the request window's tick (a schedule boundary
// passing with no snapshot at all), so there is no path where a room phone
// keeps the add button after the door shuts, or misses it opening.
let openingSoonText = "";
function applyRequestsOpen() {
  const meta = sync.getMeta();
  const { open, soonMinutes, window: reqWindow } = requestsState();
  shell.requestsClosed = !open && soonMinutes == null;
  shell.requestsOpeningSoon = soonMinutes != null;
  if (soonMinutes != null) {
    openingSoonText = `Requests open in ${openingSoonLabel(soonMinutes)}. Pop your tune on the whiteboard of wishes for now.`;
    refreshLists();
  }
  sharePanel.setRequestNote(requestNoteText(meta, open, reqWindow));
  renderWindowPills(meta, reqWindow);
  // A phone left holding the confirm sheet when the organiser closed up would
  // otherwise still land its request on the next tap. Dismissing is the same
  // "no" as tapping the backdrop. Same for the songbook: with the door shut
  // it would only offer taps that can't land.
  if (!open && viewMode === "room") {
    if (requestSheet.isSheetOpen()) requestSheet.close();
    if (songbookSheet.isSheetOpen()) songbookSheet.close();
  }
}

// The link's state, worded once for both views: the request view's rules line
// says what the room can do (it only shows while requests are open), the full
// app's chip names the link the organiser controls.
function renderWindowPills(meta: SessionMeta, reqWindow: RequestWindow | null) {
  const { state, at } = windowStatus({
    mode: meta.requestsOpen,
    window: reqWindow,
    now: new Date(),
  });
  const time = at ? sessionTimeLabel(at) : "";
  shell.roomWindow = state === "open" && time ? `Requests open until ${time}` : "Requests open";
  shell.windowChip = {
    open: time ? `Request link open until ${time}` : "Request link open",
    later: `Request link opens at ${time}`,
    closed: "Request link is view only",
  }[state];
  shell.windowState = state;
}

// The window's state can flip with no snapshot arriving at all: an unattended
// auto session crossing its own open or close instant. A 1-minute tick is
// enough for a whole-minutes message and does no network I/O, just re-runs
// applyRequestsOpen() against a fresh clock. Runs in both view modes:
// applyRequestsOpen()'s effects are already scoped to room mode.
let requestWindowTimer: ReturnType<typeof setInterval> | null = null;
function startRequestWindowTimer() {
  stopRequestWindowTimer();
  requestWindowTimer = setInterval(applyRequestsOpen, 60_000);
}
function stopRequestWindowTimer() {
  if (requestWindowTimer) {
    clearInterval(requestWindowTimer);
    requestWindowTimer = null;
  }
}

// --- Sharing -----------------------------------------------------------------
function refreshSharePanel() {
  sharePanel.update({
    id: sync.getSessionId(),
    label: currentSessionLabel(),
    meta: sync.getMeta(),
    createdAt: sync.getCreatedAt(),
  });
}

// The session's state on the share button (its ring, and how many people are
// here in its spoken label) and in the panel. Wired to sync's status
// callback, so leaves, deletions and connects all keep the UI honest.
function updateShareUi() {
  const id = sync.getSessionId();
  shell.shareActive = !!id;
  if (!id) shell.shareLabel = "Share session";
  else if (connectedCount > 1)
    shell.shareLabel = `Sharing session ${id}, ${connectedCount} people here. Tap for options`;
  else shell.shareLabel = `Sharing session ${id}. Tap for options`;
  refreshSharePanel();
  if (!id) sharePanel.setOpen(false); // no session, nothing to show
}

// The full-app link. Carries the night's date in the share payload, so the
// recipient sees which session this is, not a generic app title. The
// explicit `mode=full` is what lets it pull a sticky room phone into the app.
async function shareSessionLink(): Promise<boolean> {
  const id = sync.getSessionId();
  if (!id) return false;
  const label = currentSessionLabel();
  return offerLink(
    buildSessionUrl(location.href, id),
    label ? `${label} · Ukulele Tuesday` : "Ukulele Tuesday setlist",
  );
}

// The room-view link (#86): what goes to the room's WhatsApp group.
async function shareRoomLink(): Promise<boolean> {
  const id = sync.getSessionId();
  if (!id) return false;
  const label = currentSessionLabel();
  return offerLink(
    buildSessionUrl(location.href, id, { room: true }),
    label ? `Requests for ${label} · Ukulele Tuesday` : "Ukulele Tuesday requests",
  );
}

// Shared / Unlisted. Unlisted removes the row from the club's list only: the
// link keeps working, which the note under the dropdown says out loud. The
// panel shows the pick at once and reverts it if this rejects.
async function changeVisibility(listed: boolean) {
  scanFlow.clearError();
  try {
    await sync.setSessionListed(listed);
  } catch (err) {
    showSessionError(`Couldn’t change the session’s visibility: ${errorMessage(err)}`);
    throw err;
  }
}

// Auto / Taking requests / View only. Dropping to view-only takes the add
// button off every room phone on the session (live, through onMetaChange) and
// points them at the whiteboard; forcing it open does the opposite whatever
// the schedule; auto hands control back to the window. Same
// optimistic-then-revert shape as visibility, since all three are one tap
// that has to survive a flaky pub wifi.
async function changeRequestsMode(mode: RequestsMode) {
  scanFlow.clearError();
  try {
    await sync.setRequestsMode(mode);
  } catch (err) {
    showSessionError(`Couldn’t change the request link: ${errorMessage(err)}`);
    throw err;
  }
  refreshSharePanel();
  applyRequestsOpen();
  renderLists();
}

// The two override time fields. The panel always sends both sides' current
// values, so one save can't silently clear the other.
async function changeRequestsWindow(times: { opensAt: Date | null; closesAt: Date | null }) {
  scanFlow.clearError();
  try {
    await sync.setRequestsWindow(times);
  } catch (err) {
    refreshSharePanel(); // revert the inputs to what's actually stored
    showSessionError(`Couldn’t change the request window: ${errorMessage(err)}`);
    throw err;
  }
  refreshSharePanel();
  applyRequestsOpen();
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// --- The name amnesty ----------------------------------------------------------
// The names saved in the full app drifted into jokes, so this build runs a
// name amnesty: once per device, the typed name is cleared and a sheet asks
// for a real one. The rules and the copy live in name-reset.ts, including why
// room devices are exempt and why a first-ever visitor never sees it. Runs at
// boot, before presence can broadcast the old name anywhere.
function maybeResetName() {
  const plan = resolveNameReset({
    mode: viewMode,
    done: readNameResetDone(),
    hasSavedState: hasSavedState(),
  });
  if (plan.clearName && app.name) setPlayerName("");
  if (plan.markDone) writeNameResetDone();
  if (plan.showSheet) nameResetSheet.open(NAME_RESET_MESSAGE);
}

// --- New session -------------------------------------------------------------
// NewSessionSheet.svelte owns the fields, the planned-night gate and Start's
// states; creating the session is app state, so it happens here.
async function createNewSession({ createdAt, listed, editionId }: NewSessionChoice) {
  // The session's songbook, picked on the sheet. Resolved through the editions
  // listing so the doc carries a real {id, title}; when the listing never
  // loaded the id alone is enough (loadCatalogue enriches it). Never null:
  // every session names its book explicitly.
  const chosenEdition = editionsList.find((e) => e.id === editionId) || {
    id: editionId,
    title: "",
    description: "",
  };
  const id = await sync.createSession(
    () => ({ upNext: [], requests: [], edition: chosenEdition }),
    applyRemoteState,
    { createdBy: presence.displayName(app.name), listed, createdAt },
  );
  app.edition = chosenEdition;
  scopeCatalogueToEdition(editionId);
  app.upNext = [];
  app.requests = [];
  renderLists();
  persist();
  newSessionSheet.close();
  await navigateTo(id, { cameFromHome: shell.view === "home" });
  renderSessionMeta();
  updateShareUi();
}

// --- The songbook ------------------------------------------------------------
// SongbookSheet.svelte: the whole book, browsable, with tonight's state on
// every tune. A tap does whatever actually helps: a new tune goes to the
// confirm sheet, one already asked for gets this phone's thumbs up, a played
// one says so and stays put. Those decisions are app state, so they're here.
function songbookData() {
  return {
    catalogue: app.catalogue,
    catalogueStatus,
    upNext: app.upNext,
    requests: app.requests,
    votes: app.votes,
    clientId: presence.getClientId(),
    room: viewMode === "room",
  };
}

function openSongbook() {
  songbookSheet.setData(songbookData());
  songbookSheet.open();
}

// Peers keep adding, voting and playing while the sheet is open: re-tag the
// book with the night as it now stands.
function refreshSongbook() {
  if (songbookSheet.isSheetOpen()) songbookSheet.setData(songbookData());
}

// The same flow in both modes. The one room-only part is the request link's
// brakes (open/closed and the one-a-minute wait, see room-limits.ts): they
// govern that link, and an organiser adds whatever the switch says.
function onSongbookPick(entry: CatalogueEntry) {
  const room = viewMode === "room";
  // Belt and braces: applyRequestsOpen() closes this sheet when the door
  // shuts, but a tap can race the change.
  if (room && !requestsState().open) {
    songbookSheet.close();
    requestsSection.flash("Requests are closed. Try the whiteboard of wishes!");
    return;
  }
  const existing = findDuplicate(app.upNext, app.requests, matchKey(entry));
  if (existing?.where === "played") {
    songbookSheet.note(`“${entry.title}” was played earlier tonight. Pick another?`);
    return;
  }
  if (existing) {
    // Already asked for: what this person wants is for it to be played, and
    // the thumbs up says exactly that. Add-only, never a toggle, so a second
    // tap can't quietly take the vote back.
    const clientId = presence.getClientId();
    const already = hasVoted(app.votes, existing.row.uid, clientId);
    if (!already) {
      app.votes = seedAsker(app.votes, existing.row.uid, clientId);
      renderLists();
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
  openRequestSheet(entry);
}

// Returns whether a row was actually added, so the request sheet can tell a
// completed pick from a refusal. `comment` reuses the row's `notes` slot: the
// same field a scanned board annotation ("please NO!!!") lands in, so it
// syncs and renders with no new schema.
function addManualEntry(entry: CatalogueEntry, comment: string): boolean {
  // Same song already on the night's lists (#52)? Say where it is instead of
  // quietly doubling it. Binned copies don't block; see dupes.ts.
  const existing = findDuplicate(app.upNext, app.requests, matchKey(entry));
  if (existing) {
    requestsSection.flash(duplicateLabel(existing.where));
    return false;
  }
  const uid = newUid();
  app.requests.push({
    uid,
    source: viewMode === "room" ? "room" : "manual",
    addedBy: presence.displayName(app.name),
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
  app.votes = seedAsker(app.votes, uid, presence.getClientId());
  // Start the cool-down from the moment a request actually lands, not from the
  // pick that opened the sheet: a slow typist shouldn't spend their wait
  // inside the dialog. Persisted, so a reload isn't a way around it.
  if (viewMode === "room") writeLastRoomAdd(Date.now());
  renderLists();
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
    addedBy: presence.displayName(app.name),
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
  const { maxImageEdge, model, disableThinking, sendCatalogue } = settingsPanel.settings();
  const maxEdge = resolveMaxEdge(maxImageEdge);
  const upload = await downscaleImage(file, { maxEdge });
  const data = await requestParse(
    API_BASE,
    upload,
    {
      // The session's book, not the raw select: app.edition is the source of
      // truth and the two only diverge for the beat before the select syncs.
      edition: app.edition?.id || settingsPanel.selectedEdition(),
      // Tuning knobs from the settings panel: the API clamps or ignores
      // anything out of range and falls back to its configured defaults.
      model,
      disableThinking,
      sendCatalogue,
      maxImageEdge: maxEdge,
    },
    signal,
  );
  app.edition = data.edition;
  app.catalogue = data.catalogue;
  app.catalogueGeneratedAt = data.catalogue_generated_at;
  catalogueStatus = "ready";
  saveCatalogueCache();
  refreshPickers();
  const { fresh, flagged, skipped } = planScan(data.rows.map(rowToEntry), app.upNext, app.requests);
  if (fresh.length) {
    app.requests.push(...fresh);
    // Whoever wrote each of these on the board counts as its asker, so board
    // requests start level with app ones (#83). Anonymous, not attributed to
    // the person holding the camera: one photo makes many rows and they asked
    // for none of them.
    for (const row of fresh) app.votes = seedAsker(app.votes, row.uid, ASKER);
    renderLists();
    persist();
  }
  return { flagged, autoAdded: fresh.length, autoSkipped: skipped };
}

// What review kept goes to Requests, each row its board asker's vote.
function onReviewConfirm(kept: Row[]) {
  app.requests.push(...kept);
  for (const row of kept) app.votes = seedAsker(app.votes, row.uid, ASKER);
  renderLists();
  persist();
}

// Whether the review sheet is up: an in-flight review means songs are
// coming, so the session view leaves its fresh (camera hero) state.
let reviewing = false;
function onReviewChange(open: boolean) {
  reviewing = open;
  updateSessionMode();
}

// The night as review rows need it: duplicates, the picker, suggestions.
function scanContext(): ScanContext {
  return {
    upNext: app.upNext,
    requests: app.requests,
    catalogue: app.catalogue,
    catalogueStatus,
    showSuggestions: settingsPanel.settings().showSuggestions,
  };
}

// --- Rendering ---------------------------------------------------------------
// Every mutation path (local edits, remote snapshots, review confirm) funnels
// through renderLists(), which keeps the session's mode, the songbook's tags
// and the edition footnote current alongside the lists.
function renderLists() {
  renderEditionNote();
  updateSessionMode();
  refreshSongbook();
  refreshLists();
}

// The lists plus an open review sheet, for changes a review row can show (a
// row played or binned elsewhere, a correction, the suggestions toggle).
function rerender() {
  renderLists();
  scanFlow.refresh(scanContext());
}

// A session with no songs at all has exactly one job, get the board in, so the
// view collapses to the add buttons. Never in room mode: the fresh state is a
// camera hero, and room mode has no camera.
function updateSessionMode() {
  shell.fresh =
    app.upNext.length === 0 && app.requests.length === 0 && !reviewing && viewMode !== "room";
}

function renderEditionNote() {
  shell.editionNote = app.edition
    ? `Matched against “${editionLabel(app.edition)}” ` +
      `(generated ${app.catalogueGeneratedAt?.slice(0, 10) || "unknown"})`
    : "";
}

// The two lists and the bin render from one snapshot of the night. Rows go
// over as fresh copies, so a row edited in place (played, binned, a
// correction) still reads as changed.
function listsData(): ListsData {
  const room = viewMode === "room";
  return {
    upNext: app.upNext.map((row) => ({ ...row })),
    requests: app.requests.map((row) => ({ ...row })),
    votes: app.votes,
    clientId: presence.getClientId(),
    room,
    votingEnabled: votingEnabled(),
    roomOpen: room && requestsState().open,
    showSuggestions: settingsPanel.settings().showSuggestions,
    // The export pair covers both lists; with nothing to export, copying an
    // empty string and downloading `{rows: []}` are traps, not actions.
    exportEmpty: currentExport().length === 0,
    openingSoon: openingSoonText,
  };
}

function refreshLists() {
  const data = listsData();
  upNextSection.setData(data);
  requestsSection.setData(data);
  binGroup.setData(data);
}

// A room device on a View-only link doesn't vote either: the share panel
// promises those people can "open tonight's pool and watch it", and a live
// control would make that copy a lie. The full app always votes: closing the
// link is about the link.
function votingEnabled(): boolean {
  return viewMode !== "room" || requestsState().open;
}

// --- Row changes -------------------------------------------------------------
// Optimistic like every other row change: flip it locally, re-render, and let
// persist() carry it to the debounced push. diff() turns this into a single
// `votes.<uid>.<clientId>` leaf write, so two people voting at once both land.
// Not rerender(): a vote has no business rebuilding an open review sheet.
function toggleRowVote(uid: string) {
  app.votes = toggleVote(app.votes, uid, presence.getClientId());
  renderLists();
  persist();
}

// The row behind a uid from the lists, for actions that take the row itself.
function withRow(uid: string, fn: (row: Row) => void) {
  const row = [...app.upNext, ...app.requests].find((e) => e.uid === uid);
  if (row) fn(row);
}

// Played and binned are mutually exclusive: a tune can't be both "done" and
// "skipped" (gig-state.ts owns that, and stamps when each was set).
function togglePlayed(row: Row) {
  setPlayed(row, !row.played);
  rerender();
  persist();
}

function toggleBinned(row: Row) {
  setBinned(row, !row.binned);
  rerender();
  persist();
}

function setMatch(row: Row, entry: CatalogueEntry | null) {
  row.match = entry;
  row.status = entry ? "confirmed" : "unmatched";
  row.explanation = entry ? "Manually selected" : "";
  row.alternatives = [];
  rerender();
  persist();
}

function promote(uid: string) {
  const index = app.requests.findIndex((e) => e.uid === uid);
  if (index === -1) return;
  const [item] = app.requests.splice(index, 1);
  app.upNext.push(item);
  renderLists();
  persist();
}

function demote(uid: string) {
  const index = app.upNext.findIndex((e) => e.uid === uid);
  if (index === -1) return;
  const [item] = app.upNext.splice(index, 1);
  app.requests.push(item);
  renderLists();
  persist();
}

// Played/binned rows sit interleaved in the array but not in the visible list,
// so a one-slot move must land past the next *visible* neighbour; otherwise
// the row burrows invisibly through a hidden cluster one keypress at a time.
function moveEntry(index: number, delta: number) {
  const hidden = (e: Row) => e.played || e.binned;
  let target = index + delta;
  while (target >= 0 && target < app.upNext.length && hidden(app.upNext[target])) {
    target += delta;
  }
  if (target < 0 || target >= app.upNext.length) return;
  const [item] = app.upNext.splice(index, 1);
  app.upNext.splice(target, 0, item);
  renderLists();
  persist();
}

// A drag ended (UpNextSection.svelte): the visible rows' uids in their new
// order. Played/binned rows aren't among them, so indexOf gives them -1 and
// the (stable) sort parks them at the front in their existing order. That's
// relied on: played songs belong at the top conceptually, and binned rows are
// position-agnostic until un-binned.
function commitOrder(uids: string[]) {
  app.upNext.sort((a, b) => uids.indexOf(a.uid) - uids.indexOf(b.uid));
  renderLists();
  persist();
}

// --- Export ------------------------------------------------------------------
function currentExport(): Row[] {
  return exportedRows(app.upNext, app.requests, settingsPanel.settings().includeCrossed);
}

async function copySetlist() {
  await copyToClipboard(exportText(currentExport()));
}

function downloadSetlist() {
  const payload = exportPayload(app.edition, app.catalogueGeneratedAt, currentExport());
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
  // Resolve the view mode before the first render: the lists key row
  // interactivity off it, so a sticky room device must know before painting.
  applyViewMode();
  // After restore() (there must be a name to clear) and applyViewMode() (the
  // amnesty is full-view only), before the first render or any presence write.
  maybeResetName();
  // Hydrate search from the cached catalogue at once; the network fetch below
  // replaces it (a Cloud Function cold start can take several seconds). Keyed
  // by the edition restore() brought back: joining a session with a different
  // book re-scopes via applyRemoteState.
  restoreCatalogueCache(app.edition?.id || settingsPanel.selectedEdition());
  settingsPanel.setName(app.name);
  renderRoomIdentity();
  renderLists();

  // Paint the right view before any network work, so a cold open shows the
  // history (with its own loading note) straight away. The route lives in the
  // URL, so a mid-gig reload lands back in the session it was in.
  const routeId = currentRouteId();
  setView(routeId ? "session" : "home");
  updateShareUi();

  // Routing, editions and the catalogue are independent requests: don't
  // waterfall them. Firestore is on the critical path for every user (the
  // history needs it), so it must not gate the catalogue.
  await Promise.all([
    navigateTo(routeId, { replace: true }),
    loadEditions(),
    loadCatalogue(app.edition?.id || settingsPanel.selectedEdition()),
  ]);
}

init();
