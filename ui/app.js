import * as sync from "./sync.js";
import * as presence from "./presence.js";
import { isValidSessionId } from "./session-id.js";
import {
  disambiguate,
  fromDateInputValue,
  listSessions,
  pageTitle,
  partitionSessions,
  plannedSessionMessage,
  sessionDateLabel,
  sessionTimeLabel,
  toDateInputValue,
} from "./session-index.js";
import { icon, iconLabel } from "./icons.js";
import { duplicateLabel, findDuplicate, matchKey, normalizeText, rowKey } from "./dupes.js";
import { downscaleImage, resolveMaxEdge } from "./downscale.js";
import { latestEntry, sortedEntries, whatsNewDateLabel } from "./whats-new.js";
import {
  buildSessionUrl,
  readStoredMode,
  resolveMode,
  sourceLabel,
  writeStoredMode,
} from "./view-mode.js";
import {
  cooldownLabel,
  cooldownRemaining,
  readLastRoomAdd,
  writeLastRoomAdd,
} from "./room-limits.js";
import { ASKER, hasVoted, seedAsker, sortForDisplay, toggleVote, voteCount } from "./votes.js";
import {
  defaultWindowLabel,
  effectiveRequestsOpen,
  fromDateTimeInputValue,
  minutesUntilOpen,
  openingSoonLabel,
  resolveWindow,
  toDateTimeInputValue,
} from "./request-window.js";
import {
  CATALOGUES_CACHE_KEY,
  LEGACY_CATALOGUE_CACHE_KEY,
  getCachedCatalogue,
  migrateLegacyCatalogue,
  putCachedCatalogue,
} from "./catalogue-cache.js";

const editionSelect = document.getElementById("edition");
const editionSetting = document.getElementById("edition-setting");
const photoInput = document.getElementById("photo-input");
const preview = document.getElementById("preview");
const previewWrap = document.getElementById("preview-wrap");
const scanOverlay = document.getElementById("scan-overlay");
const errorBox = document.getElementById("error");
const addSection = document.getElementById("add");
const manualAddHost = document.getElementById("manual-add");
const upnextRows = document.getElementById("upnext-rows");
const upnextEmpty = document.getElementById("upnext-empty");
const upnextCount = document.getElementById("upnext-count");
const requestsRows = document.getElementById("requests-rows");
const requestsEmpty = document.getElementById("requests-empty");
const requestsCount = document.getElementById("requests-count");
const copyButton = document.getElementById("copy");
const downloadButton = document.getElementById("download");
const playedGroup = document.getElementById("played-group");
const binGroup = document.getElementById("bin-group");
const reviewSection = document.getElementById("review");
const reviewNote = document.getElementById("review-note");
const reviewRows = document.getElementById("review-rows");
const scanResult = document.getElementById("scan-result");
const addFeedback = document.getElementById("add-feedback");
const reviewConfirm = document.getElementById("review-confirm");
const reviewCancel = document.getElementById("review-cancel");
const editionNote = document.getElementById("edition-note");
const includeCrossed = document.getElementById("include-crossed");
const showSuggestions = document.getElementById("show-suggestions");
const settingsToggle = document.getElementById("settings-toggle");
const settingsPanel = document.getElementById("settings-panel");
const shareToggle = document.getElementById("share-toggle");
const sharePanel = document.getElementById("share-panel");
const shareSessionIdEl = document.getElementById("share-session-id");
const shareSessionNameEl = document.getElementById("share-session-name");
const shareLinkButton = document.getElementById("share-link");
const shareRoomLinkButton = document.getElementById("share-room-link");
const shareVisibility = document.getElementById("share-visibility");
const shareRequests = document.getElementById("share-requests");
const shareRequestsOpenTimeField = document.getElementById("share-requests-open-time-field");
const shareRequestsOpenTime = document.getElementById("share-requests-open-time");
const shareRequestsOpenReset = document.getElementById("share-requests-open-reset");
const shareRequestsCloseTimeField = document.getElementById("share-requests-close-time-field");
const shareRequestsCloseTime = document.getElementById("share-requests-close-time");
const shareRequestsCloseReset = document.getElementById("share-requests-close-reset");
const shareRequestNote = document.getElementById("share-request-note");
const requestsOpeningSoonNote = document.getElementById("requests-opening-soon-note");
const shareCountBadge = document.getElementById("share-count-badge");
const sharePresence = document.getElementById("share-presence");
const sharePresenceCount = document.getElementById("share-presence-count");
const sharePresenceList = document.getElementById("share-presence-list");
const playerName = document.getElementById("player-name");
const requestSheet = document.getElementById("room-request-sheet");
const requestSheetTitle = document.getElementById("room-request-title");
const requestSheetSong = document.getElementById("room-request-song");
const requestSheetNameField = document.getElementById("room-request-name-field");
const requestSheetName = document.getElementById("room-request-name");
const requestSheetCommentField = document.getElementById("room-request-comment-field");
const requestSheetComment = document.getElementById("room-request-comment");
const requestSheetError = document.getElementById("room-request-error");
const requestSheetConfirm = document.getElementById("room-request-confirm");
const requestSheetCancel = document.getElementById("room-request-cancel");
const roomIdentity = document.getElementById("room-identity");
const roomIdentityText = document.getElementById("room-identity-text");
const roomIdentityChange = document.getElementById("room-identity-change");
const modelSelect = document.getElementById("model");
const disableThinking = document.getElementById("disable-thinking");
const sendCatalogue = document.getElementById("send-catalogue");
const maxImageEdge = document.getElementById("max-image-edge");
const photoLightbox = document.getElementById("photo-lightbox");
const photoLightboxImg = document.getElementById("photo-lightbox-img");
const photoLightboxClose = document.getElementById("photo-lightbox-close");
const cameraButton = document.getElementById("camera-button");
const scanStatusText = document.getElementById("scan-status-text");
const scanCancel = document.getElementById("scan-cancel");
const homeSection = document.getElementById("home");
const sessionView = document.getElementById("session-view");
const newSessionButton = document.getElementById("new-session");
const homeError = document.getElementById("home-error");
const nextSessionEl = document.getElementById("next-session");
const upcomingHeading = document.getElementById("upcoming-heading");
const upcomingListEl = document.getElementById("upcoming-list");
const pastHeading = document.getElementById("past-heading");
const sessionListEl = document.getElementById("session-list");
const pastOlderEl = document.getElementById("past-older");
const sessionListStatus = document.getElementById("session-list-status");
const sessionListRetry = document.getElementById("session-list-retry");
const carryoverBox = document.getElementById("carryover");
const carryoverText = document.getElementById("carryover-text");
const carryoverStart = document.getElementById("carryover-start");
const carryoverDiscard = document.getElementById("carryover-discard");
const backHomeButton = document.getElementById("back-home");
// The header h1 doubles as the screen title: the brand on home, the night's
// date in a session (see setView / renderSessionMeta).
const headerTitle = document.querySelector("header h1");
const BRAND_TITLE = headerTitle.textContent;
const sheet = document.getElementById("new-session-sheet");
const sheetDate = document.getElementById("new-session-date");
const sheetWindowNote = document.getElementById("new-session-window-note");
const sheetEdition = document.getElementById("new-session-edition");
const sheetVisibility = document.getElementById("new-session-visibility");
const sheetNotice = document.getElementById("new-session-notice");
const sheetError = document.getElementById("new-session-error");
const sheetStart = document.getElementById("new-session-start");
const sheetCancel = document.getElementById("new-session-cancel");
const whatsNewBanner = document.getElementById("whats-new-banner");
const whatsNewFooter = document.getElementById("whats-new-footer");
const whatsNewOpen = document.getElementById("whats-new-open");
const whatsNewSheet = document.getElementById("whats-new-sheet");
const whatsNewEntries = document.getElementById("whats-new-entries");
const whatsNewClose = document.getElementById("whats-new-close");

// Swap the static buttons' emoji placeholders for the SVG icon set as soon as
// the module runs (index.html ships text-only fallbacks).
settingsToggle.replaceChildren(icon("settings"));
shareToggle.replaceChildren(icon("share"));
photoLightboxClose.replaceChildren(icon("close"));
cameraButton.replaceChildren(...iconLabel("camera", "Snap the whiteboard of wishes"));
shareLinkButton.replaceChildren(...iconLabel("share", "Share link"));
shareRoomLinkButton.replaceChildren(...iconLabel("share", "Share request link"));
newSessionButton.replaceChildren(...iconLabel("add", "New session"));
backHomeButton.replaceChildren(...iconLabel("back", "All sessions"));
// Icon-only (their names live in aria-label/title): they share the "Up next"
// heading row, where a text label would crowd the heading at 320px.
copyButton.replaceChildren(icon("copy"));
downloadButton.replaceChildren(icon("download"));

const STORAGE_KEY = "setlister.v1";
// The catalogues are cached separately from the lists: ~20KB of derived data
// per edition that lets manual search work instantly on revisit (and ride out
// a slow Cloud Function cold start) while a fresh copy loads in the
// background. Keyed by edition id — see catalogue-cache.js.
// The ISO date of the last "What's new" entry this device has seen. Its own
// key, outside setlister.v1, so persist()/restore()'s schema stays untouched.
const WHATS_NEW_SEEN_KEY = "setlister.whatsNew.v1";

// The two lists are the durable, primary objects. Adds (by name or snap) land in
// `requests`, the incoming pool; the user promotes entries into `upNext`, the
// running order. The catalogue/edition are loaded once per edition (independent
// of any scan) and feed matching + manual search. `review` holds the rows from
// the most recent scan while they're being validated in the review sheet, before
// they merge into `requests`.
let app = {
  edition: null,
  catalogue: [],
  catalogueGeneratedAt: "",
  // The name the user typed, or "" — the raw setting, not the identity. Every
  // surface that shows a person resolves it through presence.displayName(),
  // which falls back to this device's stable anonymous name, so an unnamed
  // player reads the same in `addedBy`, "Here now" and "Started by".
  name: "",
  upNext: [],
  requests: [],
  // Upvotes on requests (#83): { rowUid: { clientId: true } }. Keyed by row
  // rather than stored on it — see the header in votes.js for why that is a
  // correctness requirement and not a preference.
  votes: {},
  review: null,
  // Whether the collapsed played/bin groups are expanded. Pure UI state: not
  // persisted (a reload starts collapsed) and not synced (each peer keeps
  // their own view).
  playedOpen: false,
  binOpen: false,
};

showSuggestions.addEventListener("change", () => {
  rerender();
  persist();
});

// Settings survive a reload like the lists do — losing a toggle you set last
// Tuesday reads as a bug at the club.
for (const control of [modelSelect, disableThinking, sendCatalogue, includeCrossed, maxImageEdge]) {
  control.addEventListener("change", persist);
}

// Remember the name across sessions so provenance survives a reload. In a
// shared session, also push it to the presence roster so overriding your
// generated default name shows up for everyone immediately. Two surfaces set
// it: the settings field, and room mode's name sheet (the gear is hidden
// there) — both funnel through here so neither can leave a stale value.
function setPlayerName(value) {
  app.name = value;
  playerName.value = value;
  persist();
  presence.refreshPresence();
}
playerName.addEventListener("input", () => setPlayerName(playerName.value));

// Room mode's name, once set, is fire-and-forget: this one quiet line is all
// that remains of it (the sheet below is where it's actually entered).
function renderRoomIdentity() {
  const name = app.name.trim();
  roomIdentity.hidden = !name;
  if (name) roomIdentityText.textContent = `Requesting as ${name}`;
}

// The request this sheet will submit, or null when it was opened from
// "change" — same sheet, nothing to add, just a rename.
let requestSheetEntry = null;

// One sheet, doing as little as the situation needs: it always confirms the
// request (a room submitter can't take a row back out), and adds the name
// field only while there's no name to put on it.
function openRequestSheet(entry) {
  requestSheetEntry = entry;
  const askName = !app.name.trim() || !entry;
  requestSheetTitle.textContent = entry
    ? app.name.trim()
      ? "Add this request?"
      : "Who’s asking?"
    : "Your name";
  requestSheetSong.textContent = entry ? entry.display : "";
  requestSheetSong.hidden = !entry;
  requestSheetNameField.hidden = !askName;
  // The comment belongs to a request, so the rename-only sheet drops it.
  // Always starts empty: it's about this tune, not a sticky preference.
  requestSheetCommentField.hidden = !entry;
  requestSheetComment.value = "";
  requestSheetError.hidden = true;
  requestSheetName.value = app.name;
  // The button says what will actually happen: a request is waiting on this
  // sheet, a rename isn't.
  requestSheetConfirm.replaceChildren(
    document.createTextNode(entry ? "Add request" : "Save")
  );
  requestSheet.hidden = false;
  // Only raise the keyboard when there's typing to do; a confirm-only sheet
  // puts the thumb on the button instead.
  if (askName) requestSheetName.focus();
  else requestSheetConfirm.focus();
}

function closeRequestSheet() {
  requestSheet.hidden = true;
  requestSheetEntry = null;
}

// Confirming: the name is committed here, not per keystroke, so an abandoned
// sheet leaves app.name untouched. The request then goes in as part of the
// same tap — it can't be lost between the two.
function onRequestSheetConfirm() {
  const askedName = !requestSheetNameField.hidden;
  if (askedName && !requestSheetName.value.trim()) {
    requestSheetError.textContent = "Add a name so the room knows whose request it is.";
    requestSheetError.hidden = false;
    requestSheetName.focus();
    return;
  }
  if (askedName) setPlayerName(requestSheetName.value);
  const entry = requestSheetEntry;
  const comment = requestSheetComment.value;
  closeRequestSheet();
  renderRoomIdentity();
  // The door can shut (or the window can lapse) while this sheet is open.
  // applyRequestsOpen() dismisses it when that happens, but a tap racing the
  // change gets here.
  if (entry && !requestsState().open) {
    flashNote(addFeedback, "Requests just closed. Try the whiteboard of wishes!");
    return;
  }
  // addManualEntry re-runs the duplicate guard (the pool may have moved while
  // the sheet was open) and flashes its own note if it refuses. On success say
  // so — the sheet just covered the pool where the row landed — and set the
  // expectation for the cool-down before it bites.
  if (entry && addManualEntry(entry, comment)) {
    flashNote(addFeedback, `Added “${entry.title}”. Next one in a minute.`);
  }
}

requestSheetConfirm.addEventListener("click", onRequestSheetConfirm);
requestSheetCancel.addEventListener("click", closeRequestSheet);
requestSheetName.addEventListener("keydown", (event) => {
  if (event.key === "Enter") onRequestSheetConfirm();
});
requestSheetComment.addEventListener("keydown", (event) => {
  if (event.key === "Enter") onRequestSheetConfirm();
});
roomIdentityChange.addEventListener("click", () => openRequestSheet(null));
// Same forgiving dismissal as the other sheets: tap the backdrop, or Escape.
// Dismissing is a "no" — the request simply doesn't happen.
requestSheet.addEventListener("click", (event) => {
  if (event.target === requestSheet) closeRequestSheet();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !requestSheet.hidden) closeRequestSheet();
});

// Settings live in a panel behind the gear icon; toggle it and close on
// outside click or Escape so it behaves like a normal popover.
function setSettingsOpen(open) {
  settingsPanel.hidden = !open;
  settingsToggle.setAttribute("aria-expanded", String(open));
}
settingsToggle.addEventListener("click", (event) => {
  event.stopPropagation();
  setSharePanelOpen(false); // never leave both header popovers open at once
  setSettingsOpen(settingsPanel.hidden);
});
document.addEventListener("click", (event) => {
  if (!settingsPanel.hidden && !settingsPanel.contains(event.target)) {
    setSettingsOpen(false);
  }
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") setSettingsOpen(false);
});

// The UI is a static site (GitHub Pages in production), so the API lives on a
// different origin: the deployed Cloud Function, or a local
// `ut-requests serve` when developing.
function getApiBase() {
  if (["localhost", "127.0.0.1"].includes(location.hostname)) {
    return "http://127.0.0.1:8080";
  }
  return "https://europe-west1-songbook-generator.cloudfunctions.net/setlister-api";
}
const API_BASE = getApiBase();

function newUid() {
  return crypto.randomUUID
    ? crypto.randomUUID()
    : `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// --- Persistence -----------------------------------------------------------
// Both lists survive a reload / accidental close: entries carry their matched
// catalogue entry inline, so they render and export even before the catalogue
// reloads over the network.
function persist() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        upNext: app.upNext,
        requests: app.requests,
        votes: app.votes,
        edition: app.edition,
        name: app.name,
        // Persist the active session id so a reload silently rejoins (see
        // init()). null when local-only.
        sessionId: sync.getSessionId(),
        settings: {
          model: modelSelect.value,
          disableThinking: disableThinking.checked,
          sendCatalogue: sendCatalogue.checked,
          showSuggestions: showSuggestions.checked,
          includeCrossed: includeCrossed.checked,
          maxImageEdge: maxImageEdge.value,
        },
      })
    );
  } catch {
    /* storage may be full or blocked (private mode) — non-fatal */
  }
  // Every mutation already funnels through persist(), so this single choke
  // point pushes local changes to every session peer. sync ignores it (and the
  // Firestore chunk stays unloaded) when no session is active.
  // Through sessionState() rather than a second literal: this listed the synced
  // fields by hand and drifted the moment one was added, pushing everything
  // except the new field and making it look like sync was dropping writes.
  if (sync.getSessionId()) {
    sync.notifyLocalChange(sessionState());
  }
}

function restore() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (!saved) return;
    if (Array.isArray(saved.upNext)) app.upNext = saved.upNext;
    if (Array.isArray(saved.requests)) app.requests = saved.requests;
    // Migrate the pre-split payload: the old single `setlist` was the running
    // order, so it becomes Up next.
    if (
      Array.isArray(saved.setlist) &&
      !Array.isArray(saved.upNext) &&
      !Array.isArray(saved.requests)
    ) {
      app.upNext = saved.setlist;
    }
    if (saved.votes && typeof saved.votes === "object") app.votes = saved.votes;
    if (saved.edition) app.edition = saved.edition;
    if (typeof saved.name === "string") app.name = saved.name;
    // Lists with no session behind them can only come from a build predating
    // #77. Computed ONCE, here at boot: after leaving a session persist()
    // legitimately writes lists with a null sessionId, and re-deriving this
    // later would resurrect the carry-over card every time.
    hasCarryover =
      !saved.sessionId && (app.upNext.length > 0 || app.requests.length > 0);
    if (saved.settings && typeof saved.settings === "object") {
      const s = saved.settings;
      if (typeof s.model === "string") modelSelect.value = s.model;
      if (typeof s.disableThinking === "boolean") disableThinking.checked = s.disableThinking;
      if (typeof s.sendCatalogue === "boolean") sendCatalogue.checked = s.sendCatalogue;
      if (typeof s.showSuggestions === "boolean") showSuggestions.checked = s.showSuggestions;
      if (typeof s.includeCrossed === "boolean") includeCrossed.checked = s.includeCrossed;
      if (typeof s.maxImageEdge === "string") maxImageEdge.value = s.maxImageEdge;
    }
  } catch {
    /* corrupt payload — start fresh */
  }
}

// --- Catalogue cache ---------------------------------------------------------
// Search should work the moment the app opens: hydrate from the last-seen
// catalogue for the edition in play, then let the network fetch replace it.
// The map logic lives in catalogue-cache.js; only the localStorage I/O is here.
function readCatalogueStore() {
  let store = {};
  try {
    store = JSON.parse(localStorage.getItem(CATALOGUES_CACHE_KEY) || "null") || {};
  } catch {
    /* corrupt cache — the network load will repopulate it */
  }
  try {
    const legacy = JSON.parse(localStorage.getItem(LEGACY_CATALOGUE_CACHE_KEY) || "null");
    if (legacy) {
      store = migrateLegacyCatalogue(store, legacy, Date.now());
      localStorage.setItem(CATALOGUES_CACHE_KEY, JSON.stringify(store));
      localStorage.removeItem(LEGACY_CATALOGUE_CACHE_KEY);
    }
  } catch {
    /* unreadable legacy slot — nothing worth keeping */
  }
  return store;
}

// Hydrate app state from the cached copy of ONE edition's catalogue. Returns
// whether it hit, so callers know if search is live or still waiting on the
// network.
function restoreCatalogueCache(editionId) {
  const entry = getCachedCatalogue(readCatalogueStore(), editionId);
  if (!entry) return false;
  app.catalogue = entry.catalogue;
  // Adopt the cached edition info when switching books (or starting blank),
  // but don't clobber a same-id edition that arrived with the session doc —
  // its title can be fresher than the cache's.
  if (!app.edition || app.edition.id !== editionId) app.edition = entry.edition;
  app.catalogueGeneratedAt = entry.generatedAt || "";
  loadedCatalogueEditionId = editionId;
  catalogueStatus = "ready";
  return true;
}

function saveCatalogueCache() {
  if (!app.edition?.id) return;
  try {
    const store = putCachedCatalogue(
      readCatalogueStore(),
      app.edition.id,
      {
        edition: app.edition,
        catalogue: app.catalogue,
        generatedAt: app.catalogueGeneratedAt,
      },
      Date.now()
    );
    localStorage.setItem(CATALOGUES_CACHE_KEY, JSON.stringify(store));
  } catch {
    /* storage full or blocked — cache is best-effort */
  }
}

// --- Session sharing wiring ------------------------------------------------
// The durable state sync lives in sync.js; app.js only feeds it state and
// applies remote updates.
//
// Every set of lists now belongs to a session (#77) — there is no local-only
// mode to fall back to. `hasCarryover` is the one exception: lists left in
// localStorage by a build from before that change, offered on the home screen
// so a night in progress isn't silently swallowed by the new session list.
let hasCarryover = false;

function sessionState() {
  return {
    upNext: app.upNext,
    requests: app.requests,
    edition: app.edition,
    votes: app.votes,
  };
}

// Point the song picker at ONE edition's catalogue: cache first for instant
// search, network refresh behind it. On a cache miss the picker says
// "Loading the songbook…" — better honest than quietly serving matches from
// the WRONG book while the fetch runs.
function scopeCatalogueToEdition(editionId) {
  if (editionId !== loadedCatalogueEditionId) {
    if (!restoreCatalogueCache(editionId)) {
      app.catalogue = [];
      catalogueStatus = "loading";
    }
    refreshPickers();
    loadCatalogue(editionId);
  }
  syncEditionSelect(editionId);
}

// Called by sync when a remote change arrives: swap in the fresh lists and
// re-render. persist() writes them back to localStorage (and is a no-op push
// since sync just set lastRemote to this same state).
function applyRemoteState(state) {
  app.upNext = state.upNext;
  app.requests = state.requests;
  app.votes = state.votes || {};
  // The doc is authoritative even when it says null (a session predating
  // per-session books): keeping this device's old edition would push it into
  // the shared doc on the persist() below, hijacking the session's book.
  app.edition = state.edition ?? null;
  // The session's songbook is the one everyone searches: when the doc names a
  // different edition than the loaded catalogue (joining a themed night, or a
  // peer switching books mid-session), re-scope the picker to it. Sessions
  // from before editions were guaranteed carry null — those read as the
  // default book.
  scopeCatalogueToEdition(state.edition?.id || "current");
  renderUpNext();
  renderRequests();
  persist();
}

// The full app URL carrying `?session=<id>&mode=full` — this is what gets
// shared. The explicit `mode=full` is what lets this link pull a sticky
// room-mode phone into the full app (a plain link would fall through to the
// flag and keep it in the room view).
function sessionUrl(id) {
  return buildSessionUrl(location.href, id);
}

// The room-view variant (#86): same session, `?mode=request` set.
function roomSessionUrl(id) {
  return buildSessionUrl(location.href, id, { room: true });
}

function showSessionError(message) {
  errorBox.textContent = message;
  errorBox.hidden = false;
}

function showHomeError(message) {
  homeError.textContent = message;
  homeError.hidden = false;
}

// --- Routing ---------------------------------------------------------------
// Two views, one page, no router: `?session=<id>` in the URL means "show that
// session", no param means "show the history list". The URL is the only source
// of truth, which is what makes the phone's Back button (and iOS edge-swipe)
// work for free — see the popstate listener below.
function currentRouteId() {
  return new URLSearchParams(location.search).get("session");
}

// Which view of a session this device gets: the full app or the read-mostly
// room view (#86). Resolved from the URL plus the sticky flag on every route
// change, so `?mode=request` / `?mode=full` links work whenever they arrive
// and a room device stays a room device across plain-link reloads. The
// classes drive the CSS (see "Room mode" in style.css) and only apply while a
// session is showing — home renders normally either way.
let viewMode = "full";
function applyViewMode() {
  const resolved = resolveMode(new URLSearchParams(location.search), readStoredMode());
  writeStoredMode(resolved.store);
  viewMode = resolved.mode;
  const room = viewMode === "room" && !sessionView.hidden;
  sessionView.classList.toggle("room", room);
  document.body.classList.toggle("room-mode", room);
  // Before the first paint, so a device landing on a closed session never
  // flashes an add field it can't use.
  applyRequestsOpen();
  // Entering room mode decides which of the name input / identity line shows.
  if (room) renderRoomIdentity();
}

// The composed answer to "is the room's request link taking tunes right now"
// (#86, #NEW): a forced override always wins, otherwise the window decides.
// One funnel so every gating call site — the confirm sheet, the combobox
// pick, the empty-state copy, voting — answers against the SAME instant;
// nobody recomputes `now()` separately, so a slow tap can't straddle two
// different answers.
function requestsState(now = new Date()) {
  const meta = sync.getMeta();
  const reqWindow = resolveWindow({
    sessionCreatedAt: sync.getCreatedAt(),
    opensAtOverride: meta.requestsOpensAt,
    closesAtOverride: meta.requestsClosesAt,
  });
  const open = effectiveRequestsOpen({ mode: meta.requestsOpen, window: reqWindow, now });
  // Only auto mode has a meaningful "opening soon" — a forced-closed room
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
// resolved boundary so the organiser can see the schedule without opening
// the time fields below.
function requestNoteText(meta, open, reqWindow) {
  if (meta.requestsOpen === true) return OPEN_NOTE;
  if (meta.requestsOpen === false) return CLOSED_NOTE;
  if (!reqWindow) return open ? OPEN_NOTE : CLOSED_NOTE;
  return open
    ? `Auto: taking requests until ${sessionTimeLabel(reqWindow.closesAt)}. People can add tunes and follow the set, not change it.`
    : `Auto: not open yet, opens at ${sessionTimeLabel(reqWindow.opensAt)}. View only until then.`;
}

// Called from applyViewMode (arrival), renderSessionMeta (a peer's flip
// landing live), and the request-window timer (a schedule boundary passing
// with no snapshot at all) — so there is no path where a room phone keeps the
// add field after the door shuts, or misses it opening.
function applyRequestsOpen() {
  const meta = sync.getMeta();
  const { open, soonMinutes, window: reqWindow } = requestsState();
  sessionView.classList.toggle("requests-closed", !open && soonMinutes == null);
  sessionView.classList.toggle("requests-opening-soon", soonMinutes != null);
  if (soonMinutes != null) {
    requestsOpeningSoonNote.textContent =
      `Requests open in ${openingSoonLabel(soonMinutes)}. Pop your tune on the whiteboard of wishes for now.`;
  }
  shareRequestNote.textContent = requestNoteText(meta, open, reqWindow);
  // A phone left holding the confirm sheet when the organiser closed up would
  // otherwise still land its request on the next tap. Dismissing is the same
  // "no" as tapping the backdrop.
  if (!open && viewMode === "room" && !requestSheet.hidden) closeRequestSheet();
}

function setView(view) {
  const home = view === "home";
  homeSection.hidden = !home;
  sessionView.hidden = home;
  applyViewMode();
  // In a session the night's date IS the working title, so it takes over the
  // h1 and the brand retreats to home — one title bar instead of a brand row
  // stacked on a session row. CSS keys the sizing off this class.
  document.body.classList.toggle("in-session", !home);
  headerTitle.textContent = home ? BRAND_TITLE : currentSessionLabel();
  // Sharing and the edition footnote are both about a session you're in.
  shareToggle.hidden = home;
  editionNote.hidden = home;
  // So is the songbook select now: it edits the session's book, for everyone.
  // On home the choice belongs to the new-session sheet instead.
  editionSetting.hidden = home;
  if (home) {
    setSharePanelOpen(false);
    shareCountBadge.hidden = true;
  }
  setSettingsOpen(false); // settings stay reachable in both views, just closed
  updateDocumentTitle();
}

// pushState for anything the user did (so Back retraces it), replaceState for
// load-time normalisation and error recovery (which shouldn't be re-enterable).
function navigateTo(id, { replace = false, cameFromHome = false } = {}) {
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
async function applyRoute(id) {
  // Already connected to this session: nothing to join, but still make sure
  // we're showing it. Both a re-fired popstate and the hop straight from
  // createSession land here.
  if (id && id === sync.getSessionId()) {
    setView("session");
    return;
  }

  if (!id) {
    // ORDER MATTERS. leaveSession() first: clearing the lists before detaching
    // would push the empty lists through persist() -> notifyLocalChange() and
    // wipe the session for everyone still in it. Once sync has torn down,
    // pushTimer/pendingState are cleared and flushPush early-returns, so
    // nothing can escape.
    const wasInSession = sync.getSessionId() !== null;
    sync.leaveSession(); // also clears the session's createdAt
    if (wasInSession) {
      // Only a session's lists are ours to drop. On a cold open there was never
      // a session, and whatever is in localStorage is carry-over the user still
      // has to decide about.
      app.upNext = [];
      app.requests = [];
      closeReview();
      persist();
      renderUpNext();
      renderRequests();
    }
    renderCarryover();
    setView("home");
    updateShareUi();
    refreshSessionList();
    return;
  }

  // A malformed share link can't be a real session — say so without touching
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
    renderSessionMeta(sync.getMeta());
    // Sessions predating visibility have no listing row; give them one so they
    // stop being invisible. A no-op for everything else — crucially including a
    // session someone deliberately unlisted. Best-effort, never blocks opening.
    sync.backfillListing();
  } catch (err) {
    sync.leaveSession();
    showHomeError(
      err?.notFound
        ? "That session wasn’t found. It may have been deleted."
        : `Couldn’t open that session: ${err.message}`
    );
    await navigateTo(null, { replace: true });
  }
}

// Android's hardware Back and iOS's edge-swipe both land here.
window.addEventListener("popstate", () => {
  applyRoute(currentRouteId());
});

// Prefer a real history.back() when we know home is the previous entry, so
// bouncing between the list and a session doesn't grow the stack forever.
backHomeButton.addEventListener("click", () => {
  if (history.state?.cameFromHome) history.back();
  else navigateTo(null);
});

// --- Share button + session popover ----------------------------------------
function setSharePanelOpen(open) {
  sharePanel.hidden = !open;
  shareToggle.setAttribute("aria-expanded", String(open));
}

// How many people (including us) presence currently reports in the session.
// Drives the count badge and is folded into the share button's aria-label.
let connectedCount = 0;

// Reflect the current session state on the button (active ring/dot) and in the
// popover (session id). Wired to sync's status callback so leaves, deletions
// and connects all keep the UI honest.
function updateShareUi() {
  const id = sync.getSessionId();
  shareToggle.classList.toggle("active", !!id);
  let label;
  if (!id) label = "Share session";
  else if (connectedCount > 1)
    label = `Sharing session ${id}, ${connectedCount} people here. Tap for options`;
  else label = `Sharing session ${id}. Tap for options`;
  shareToggle.setAttribute("aria-label", label);
  if (id) shareSessionIdEl.textContent = id;
  else setSharePanelOpen(false); // no session → nothing to show
}

// What the current session is called: its date, rendered live. Falls back to
// the id only for a session with no createdAt, which shouldn't happen but
// beats rendering an empty bar. The date comes from sync, which keeps it in
// step with the snapshot — one source of truth for it.
function currentSessionLabel() {
  return sessionDateLabel(sync.getCreatedAt()) || sync.getSessionId() || "";
}

// One funnel for the tab title so route changes and metadata updates can't
// disagree.
function updateDocumentTitle() {
  document.title = pageTitle(sessionView.hidden ? "" : currentSessionLabel());
}

// The session's date label and visibility, wherever they're shown: the header
// title, the share popover (which leads with the label — the id is just the
// link slug), and the browser tab. Driven by sync.onMetaChange.
function renderSessionMeta(meta) {
  if (!sessionView.hidden) headerTitle.textContent = currentSessionLabel();
  shareSessionNameEl.textContent = currentSessionLabel();
  shareVisibility.value = meta.listed ? "shared" : "unlisted";
  shareRequests.value = meta.requestsOpen === true ? "open" : meta.requestsOpen === false ? "closed" : "auto";
  shareRequests.dataset.previous = shareRequests.value;
  renderRequestWindowFields(meta);
  applyRequestsOpen();
  // The room's empty note changes with the switch, and a room device may be
  // sitting on this session right now.
  renderRequests();
  updateDocumentTitle();
}
sync.onMetaChange(renderSessionMeta);

// Populates the two override time fields with the CURRENTLY RESOLVED window
// (an explicit override if one's set, else the smart default) so they never
// look empty, and shows "Use default" only on the side that actually has an
// override to clear. Hidden entirely outside auto mode: a forced open/closed
// override makes the window inert, and showing live-looking fields for a
// schedule that isn't in effect would be the same lie the empty-state copy
// already avoids for room mode.
function renderRequestWindowFields(meta) {
  const auto = meta.requestsOpen === null;
  shareRequestsOpenTimeField.hidden = !auto;
  shareRequestsCloseTimeField.hidden = !auto;
  shareRequestsOpenReset.hidden = !auto || meta.requestsOpensAt === null;
  shareRequestsCloseReset.hidden = !auto || meta.requestsClosesAt === null;
  if (!auto) return;
  const createdAt = sync.getCreatedAt();
  const reqWindow = resolveWindow({
    sessionCreatedAt: createdAt,
    opensAtOverride: meta.requestsOpensAt,
    closesAtOverride: meta.requestsClosesAt,
  });
  shareRequestsOpenTime.value = reqWindow ? toDateTimeInputValue(reqWindow.opensAt) : "";
  shareRequestsCloseTime.value = reqWindow ? toDateTimeInputValue(reqWindow.closesAt) : "";
}

// Render the "who's here" roster into the share panel and the count badge on
// the share button. Wired to presence.onRoster, so it re-renders whenever a
// peer joins, leaves, or renames. self shows first, tagged "(you)".
function renderPresence(roster) {
  connectedCount = roster.length;
  const id = sync.getSessionId();
  const showBadge = !!id && connectedCount > 0;
  shareCountBadge.hidden = !showBadge;
  shareCountBadge.textContent = showBadge ? String(connectedCount) : "";

  if (!id || !connectedCount) {
    sharePresence.hidden = true;
    sharePresenceList.replaceChildren();
  } else {
    sharePresence.hidden = false;
    sharePresenceCount.textContent = String(connectedCount);
    sharePresenceList.replaceChildren(
      ...roster.map((peer) => {
        const li = document.createElement("li");
        li.className = "share-presence-item";
        const dot = document.createElement("span");
        dot.className = "presence-dot";
        dot.setAttribute("aria-hidden", "true");
        const name = document.createElement("span");
        name.className = "presence-name";
        name.textContent = peer.isSelf ? `${peer.name} (you)` : peer.name;
        li.append(dot, name);
        return li;
      })
    );
  }
  updateShareUi();
}
presence.onRoster(renderPresence);

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // Clipboard API needs a secure context / permission; fall back to the
    // legacy execCommand path so copy still works on older mobile browsers.
    const textarea = document.createElement("textarea");
    textarea.value = text;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  }
}

// Transient confirmation swap: the button shows a check + message, then
// restores its original icon+label content (stashed as markup so the SVG
// icon survives the round-trip).
function flashButton(button, message) {
  clearTimeout(Number(button.dataset.flashTimer));
  if (!("originalHtml" in button.dataset)) {
    button.dataset.originalHtml = button.innerHTML;
  }
  // Match the button's own shape: a labelled button flashes the word, but an
  // icon-only one (the export pair in the "Up next" heading) would grow mid-tap
  // and shove the heading sideways, so it flashes just the tick.
  const labelled = button.querySelector(".btn-label");
  button.replaceChildren(...(labelled ? iconLabel("check", message) : [icon("check")]));
  button.dataset.flashTimer = String(
    setTimeout(() => {
      button.innerHTML = button.dataset.originalHtml;
      delete button.dataset.originalHtml;
    }, 1500)
  );
}

// Offer a link: the native share sheet on mobile (the primary target), else
// copy to clipboard with transient feedback on the button that was tapped.
async function offerLink(url, title, button) {
  if (navigator.share) {
    try {
      await navigator.share({ title, url });
    } catch {
      /* user dismissed the share sheet, or it rejected the payload — no-op */
    }
    return;
  }
  await copyToClipboard(url);
  flashButton(button, "Link copied");
}

// The full-app link. Carries the night's date label in the share payload, so
// the recipient sees which session this is, not a generic app title.
async function shareSessionLink() {
  const id = sync.getSessionId();
  if (!id) return;
  const label = currentSessionLabel();
  await offerLink(
    sessionUrl(id),
    label ? `${label} · Ukulele Tuesday` : "Ukulele Tuesday setlist",
    shareLinkButton
  );
}

// The room-view link (#86): what goes to the room's WhatsApp group.
async function shareRoomLink() {
  const id = sync.getSessionId();
  if (!id) return;
  const label = currentSessionLabel();
  await offerLink(
    roomSessionUrl(id),
    label ? `Requests for ${label} · Ukulele Tuesday` : "Ukulele Tuesday requests",
    shareRoomLinkButton
  );
}

// Tap Share: the popover is now purely in-session (every set of lists already
// belongs to a session), so this just opens it.
function onShareTap(event) {
  event.stopPropagation();
  setSettingsOpen(false);
  setSharePanelOpen(sharePanel.hidden);
}

// Shared / Unlisted. Unlisted removes the row from the club's list only — the
// link keeps working, which the note under the dropdown says out loud.
async function onVisibilityChange() {
  const listed = shareVisibility.value === "shared";
  errorBox.hidden = true;
  shareVisibility.disabled = true;
  try {
    await sync.setSessionListed(listed);
  } catch (err) {
    shareVisibility.value = listed ? "unlisted" : "shared"; // the write didn't land
    showSessionError(`Couldn’t change the session’s visibility: ${err.message}`);
  } finally {
    shareVisibility.disabled = false;
  }
}

// Auto / Taking requests / View only (#86, #NEW). Dropping to view-only takes
// the add field off every room phone on the session (live, through
// onMetaChange) and points them at the whiteboard; forcing it open does the
// opposite regardless of the schedule; auto hands control back to the window.
// Same optimistic-then-revert shape as visibility, since all three are one
// tap that has to survive a flaky pub wifi. The previous value is stashed on
// the element (rather than derived from the new one) because a 3-way revert
// can't be inferred from "not this" the way the old binary toggle could.
async function onRequestsChange() {
  const mode = shareRequests.value;
  const previous = shareRequests.dataset.previous || "auto";
  errorBox.hidden = true;
  shareRequests.disabled = true;
  try {
    await sync.setRequestsMode(mode);
    shareRequests.dataset.previous = mode;
    renderRequestWindowFields(sync.getMeta());
    applyRequestsOpen();
    renderRequests();
  } catch (err) {
    shareRequests.value = previous; // the write didn't land
    showSessionError(`Couldn’t change the request link: ${err.message}`);
  } finally {
    shareRequests.disabled = false;
  }
}

// The two override time fields (#NEW). Each writes independently: touching
// Opens never disturbs whatever Closes currently resolves to, and vice versa
// — setRequestsWindow always sends both current values so one save can't
// silently clear the other side.
async function onRequestsWindowChange(side) {
  const meta = sync.getMeta();
  const opensAt =
    side === "open"
      ? fromDateTimeInputValue(shareRequestsOpenTime.value)
      : meta.requestsOpensAt;
  const closesAt =
    side === "close"
      ? fromDateTimeInputValue(shareRequestsCloseTime.value)
      : meta.requestsClosesAt;
  errorBox.hidden = true;
  try {
    await sync.setRequestsWindow({ opensAt, closesAt });
    renderRequestWindowFields(sync.getMeta());
    applyRequestsOpen();
  } catch (err) {
    renderRequestWindowFields(sync.getMeta()); // revert the input to what's actually stored
    showSessionError(`Couldn’t change the request window: ${err.message}`);
  }
}

function onRequestsOpenReset() {
  shareRequestsOpenTime.value = "";
  onRequestsWindowChange("open");
}

function onRequestsCloseReset() {
  shareRequestsCloseTime.value = "";
  onRequestsWindowChange("close");
}

shareToggle.addEventListener("click", onShareTap);
shareLinkButton.addEventListener("click", shareSessionLink);
shareRoomLinkButton.addEventListener("click", shareRoomLink);
shareVisibility.addEventListener("change", onVisibilityChange);
shareRequests.addEventListener("change", onRequestsChange);
shareRequestsOpenTime.addEventListener("change", () => onRequestsWindowChange("open"));
shareRequestsCloseTime.addEventListener("change", () => onRequestsWindowChange("close"));
shareRequestsOpenReset.addEventListener("click", onRequestsOpenReset);
shareRequestsCloseReset.addEventListener("click", onRequestsCloseReset);

// Same forgiving dismissal as the settings popover: tap outside or Escape.
document.addEventListener("click", (event) => {
  if (
    !sharePanel.hidden &&
    !sharePanel.contains(event.target) &&
    !shareToggle.contains(event.target)
  ) {
    setSharePanelOpen(false);
  }
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") setSharePanelOpen(false);
});

// The request window's open/opening-soon/closed state (#NEW) can flip with no
// Firestore snapshot arriving at all — an unattended auto session crossing
// its own open or close instant. A 1-minute tick is enough resolution for a
// whole-minutes message and does no network I/O, just re-runs
// applyRequestsOpen() against a fresh clock. Same setInterval/clearInterval-
// in-a-stop-function shape as presence.js's heartbeat, started/stopped at the
// exact same call sites as presence itself so it never outlives the session.
// Runs for both view modes: applyRequestsOpen()'s own effects are already
// scoped to room mode (the .room CSS prefix, votingEnabled()'s viewMode
// check), so a second timer lifecycle keyed to view-mode switching would only
// add complexity for no behaviour difference.
let requestWindowTimer = null;
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

// Keep the UI in sync when the engine changes state on its own — most
// importantly when the remote doc goes away underneath us. Presence is bound to
// the same lifecycle: start heartbeating on connect, stop (and retract our doc)
// on leave.
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
// missed, the staleness window + TTL retire the doc anyway.
window.addEventListener("pagehide", presence.removeOnUnload);

// --- Home view: next sessions on top, the club's history below -------------

// How many past nights show before the rest collapse. Enough to cover "the
// last month or so" at one Tuesday a week without the history burying the page.
const PAST_VISIBLE = 5;
// Survives refreshSessionList so a background refresh doesn't slam the
// history shut under someone's thumb.
let pastOlderOpen = false;

function startedByText(entry) {
  return entry.createdBy ? `Started by ${entry.createdBy}` : "Started by someone";
}

function sessionListItem(entry, extraClass) {
  const li = document.createElement("li");
  const button = document.createElement("button");
  button.type = "button";
  button.className = extraClass ? `session-item ${extraClass}` : "session-item";
  button.dataset.id = entry.id;

  // `label` is the session's date rendered in this viewer's locale — see
  // disambiguate()/sessionDateLabel(). A just-created doc can still be waiting
  // on its server timestamp, which labels as "": name the state rather than
  // render a blank card.
  const name = document.createElement("span");
  name.className = "session-item-name";
  name.textContent = entry.label || "Date pending";

  const meta = document.createElement("span");
  meta.className = "session-item-meta";
  meta.textContent = startedByText(entry);

  button.append(name, meta);
  li.appendChild(button);
  return li;
}

// The soonest joinable night, dressed to be tapped. While one exists, starting
// ANOTHER session is a secondary act, so the New session button steps back to
// a quiet style; with nothing upcoming it stays the hero it is today.
function renderNextSession(entry) {
  nextSessionEl.hidden = !entry;
  newSessionButton.classList.toggle("secondary-new", Boolean(entry));
  if (!entry) {
    nextSessionEl.replaceChildren();
    return;
  }

  const card = document.createElement("button");
  card.type = "button";
  card.className = "next-session-card";
  card.dataset.id = entry.id;

  const kicker = document.createElement("span");
  kicker.className = "next-session-kicker";
  kicker.textContent = "Next session";

  const name = document.createElement("span");
  name.className = "next-session-name";
  name.textContent = entry.label || "Date pending";

  const meta = document.createElement("span");
  meta.className = "next-session-meta";
  meta.textContent = startedByText(entry);

  // No CTA line: the home screen opens the FULL view, where people run the
  // whole night (queue requests, reorder Up next, mark played, scan the
  // board), so any verbs here would miscast someone. The card is a button in
  // a list of buttons; the night's name is the message.
  card.append(kicker, name, meta);
  nextSessionEl.replaceChildren(card);
}

// Same collapsed-disclosure idea as the session view's played/bin groups, but
// over session items rather than song rows, so it gets its own small builder.
function renderPastOlder(entries) {
  pastOlderEl.replaceChildren();
  pastOlderEl.hidden = entries.length === 0;
  if (pastOlderEl.hidden) return;

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "group-toggle";
  toggle.setAttribute("aria-expanded", String(pastOlderOpen));
  toggle.setAttribute("aria-controls", "past-older-rows");
  const label = document.createElement("span");
  label.className = "group-label";
  label.textContent = `${entries.length} older ${entries.length === 1 ? "session" : "sessions"}`;
  toggle.append(label, icon("chevron", "group-chevron"));
  toggle.onclick = () => {
    pastOlderOpen = !pastOlderOpen;
    renderPastOlder(entries);
  };
  pastOlderEl.appendChild(toggle);

  if (pastOlderOpen) {
    const list = document.createElement("ul");
    list.id = "past-older-rows";
    list.className = "session-list group-rows";
    list.append(...entries.map((e) => sessionListItem(e)));
    pastOlderEl.appendChild(list);
  }
}

function renderSessionList(entries) {
  // Label the WHOLE list before splitting, so two sessions the same night get
  // their disambiguating time suffixes even when one of them is the hero.
  const now = new Date();
  const { upcoming, past } = partitionSessions(disambiguate(entries, now), now);

  // Remembered for the new-session sheet's gate. A failed load renders []
  // through here, clearing this to null — the sheet then shows no notice and
  // the Start-time check fails closed instead of trusting stale state.
  plannedUpcoming = upcoming[0] || null;

  renderNextSession(upcoming[0]);
  upcomingListEl.replaceChildren(...upcoming.slice(1).map((e) => sessionListItem(e, "upcoming")));
  upcomingHeading.hidden = upcoming.length === 0;

  // Never hide a single item behind a tap: at the threshold, one more row
  // costs less than a one-row disclosure.
  const collapse = past.length > PAST_VISIBLE + 1;
  const visible = collapse ? past.slice(0, PAST_VISIBLE) : past;
  sessionListEl.replaceChildren(...visible.map((e) => sessionListItem(e)));
  renderPastOlder(collapse ? past.slice(PAST_VISIBLE) : []);
  pastHeading.hidden = past.length === 0;
}

// The list and "New session" are independent paths: a failed query must never
// stop someone starting tonight's set.
async function refreshSessionList() {
  sessionListRetry.hidden = true;
  sessionListStatus.hidden = false;
  sessionListStatus.textContent = "Loading sessions…";
  try {
    const entries = await listSessions();
    renderSessionList(entries);
    sessionListStatus.hidden = entries.length > 0;
    sessionListStatus.textContent = entries.length
      ? ""
      : "No sessions yet. Start one above.";
  } catch {
    // A failed query clears the whole layout, hero included: a stale "Next
    // session" card over a "Couldn't load" error would be a lie.
    renderSessionList([]);
    sessionListStatus.hidden = false;
    sessionListStatus.textContent = "Couldn’t load sessions.";
    sessionListRetry.hidden = false;
  }
}

// One delegated handler over every container that holds a session card: the
// hero, the coming-up list, the visible history and the collapsed remainder.
function handleSessionPick(event) {
  const button = event.target.closest("[data-id]");
  if (button) navigateTo(button.dataset.id, { cameFromHome: true });
}
for (const el of [nextSessionEl, upcomingListEl, sessionListEl, pastOlderEl]) {
  el.addEventListener("click", handleSessionPick);
}
sessionListRetry.addEventListener("click", refreshSessionList);

// --- What's new: release notes ----------------------------------------------
// Announcement and archive are two different jobs, so they get two surfaces —
// and two amounts of news through the same sheet. The banner above "Sessions"
// exists only while the latest entry is unseen on this device, and shows that
// entry alone: it's telling you one thing shipped, and one tap retires it, so
// the home screen's pick-a-session flow carries no permanent extra furniture.
// The footer link is the quiet, always-there door, and it opens the whole
// history — someone who goes looking for "What's new" is browsing, not being
// told, and the newest entry is already at the top for them. "Seen" is the
// latest entry's ISO date (data, never a formatted label) under its own key,
// so shipping a newer entry revives the banner with no other state to migrate.
function renderWhatsNew() {
  const entry = latestEntry();
  if (!entry) {
    whatsNewFooter.hidden = true;
    return;
  }

  whatsNewBanner.replaceChildren(...iconLabel("news", "What’s new"));

  let seen = null;
  try {
    seen = localStorage.getItem(WHATS_NEW_SEEN_KEY);
  } catch {
    /* private mode: the banner simply shows every visit */
  }
  whatsNewBanner.hidden = seen === entry.date;
}

// One dated block per entry, newest first — the same markup whether the sheet
// is showing one entry or all of them, so the archive reads as a sequence
// rather than a different screen.
function whatsNewEntryBlock(entry) {
  const block = document.createElement("section");
  block.className = "whats-new-entry";

  const date = document.createElement("p");
  date.className = "whats-new-date";
  date.textContent = whatsNewDateLabel(entry);

  const items = document.createElement("ul");
  items.className = "whats-new-items";
  items.replaceChildren(
    ...entry.items.map((text) => {
      const li = document.createElement("li");
      li.textContent = text;
      return li;
    })
  );

  block.replaceChildren(date, items);
  return block;
}

function openWhatsNewSheet(entries) {
  whatsNewEntries.replaceChildren(...entries.map(whatsNewEntryBlock));
  // Long archives open at the top, not wherever the last visit left the scroll.
  whatsNewEntries.scrollTop = 0;
  whatsNewSheet.hidden = false;
  // Opening is seeing — the banner has done its job for this entry.
  whatsNewBanner.hidden = true;
  try {
    localStorage.setItem(WHATS_NEW_SEEN_KEY, latestEntry()?.date || "");
  } catch {
    /* best-effort: the banner just returns next visit */
  }
}

whatsNewBanner.addEventListener("click", () => {
  const entry = latestEntry();
  if (entry) openWhatsNewSheet([entry]);
});
whatsNewOpen.addEventListener("click", () => openWhatsNewSheet(sortedEntries()));
// Close is the way out that's always in reach; the backdrop stays forgiving
// for anyone who taps past the sheet, and Escape is a desktop bonus.
whatsNewClose.addEventListener("click", () => {
  whatsNewSheet.hidden = true;
});
whatsNewSheet.addEventListener("click", (event) => {
  if (event.target === whatsNewSheet) whatsNewSheet.hidden = true;
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !whatsNewSheet.hidden) whatsNewSheet.hidden = true;
});

// --- New session sheet ------------------------------------------------------
// Whether Start should carry the carry-over lists into the new session, or
// begin empty (the normal case — a new night shouldn't inherit last week's
// leftovers).
let sheetSeedsCarryover = false;

// The soonest upcoming session from the last list render, or null. One planned
// night at a time: while this is set, starting another SHARED session is
// blocked — Unlisted remains the escape hatch. Advisory only (it can be stale
// or empty after a failed load); onSheetStart re-checks against Firestore.
let plannedUpcoming = null;

function updateSheetGate() {
  const blocked = Boolean(plannedUpcoming) && sheetVisibility.value === "shared";
  sheetNotice.hidden = !blocked;
  if (blocked) sheetNotice.textContent = plannedSessionMessage(plannedUpcoming);
  sheetStart.disabled = blocked;
}

// What the date picker showed when the sheet OPENED. Start compares against
// this, not a recomputed "today": an untouched picker means "now" (server
// stamp), and comparing against a fresh today would silently turn a sheet left
// open across midnight into an explicit yesterday-evening pick.
let sheetDateDefault = "";

function openSheet({ seedCarryover = false } = {}) {
  sheetSeedsCarryover = seedCarryover;
  sheetError.hidden = true;
  sheetDateDefault = toDateInputValue(new Date());
  sheetDate.value = sheetDateDefault;
  // firestore.rules caps createdAt at 60 days ahead; stop the picker a hair
  // earlier so a bad pick fails here, not as a rules error after Start.
  sheetDate.max = toDateInputValue(new Date(Date.now() + 59 * 86_400_000));
  // Always the default book, never the device's last-loaded one: a themed
  // night shouldn't quietly become next Tuesday's songbook too.
  sheetEdition.value = "current";
  sheetVisibility.value = "shared";
  updateSheetGate();
  updateSheetWindowPreview();
  sheet.hidden = false;
  homeError.hidden = true;
  // Don't autofocus: opening a date picker nobody needs to touch would put the
  // extra tap back. Today is usually the answer — tap Start and go.
}

// Read-only preview of the smart default request window (#NEW) — nothing is
// stored yet (see sync.js's createSession), so this is purely informational,
// recomputed live as the date picker moves. Mirrors onSheetStart's own
// "untouched picker means now" rule so the preview never disagrees with what
// Start is about to send.
function updateSheetWindowPreview() {
  const createdAt =
    sheetDate.value && sheetDate.value !== sheetDateDefault
      ? fromDateInputValue(sheetDate.value)
      : new Date();
  sheetWindowNote.textContent = defaultWindowLabel(createdAt);
}

function closeSheet() {
  sheet.hidden = true;
  sheetStart.disabled = false;
  sheetStart.replaceChildren(document.createTextNode("Start"));
}

async function onSheetStart() {
  // An untouched (or cleared) picker means "now": no createdAt is sent and the
  // server stamps the moment of creation. Only a genuinely different day
  // becomes an explicit date, stamped at that day's evening.
  const createdAt =
    sheetDate.value && sheetDate.value !== sheetDateDefault
      ? fromDateInputValue(sheetDate.value)
      : null;
  const listed = sheetVisibility.value === "shared";
  const seed = sheetSeedsCarryover;
  sheetError.hidden = true;
  sheetStart.disabled = true;
  sheetStart.replaceChildren(icon("loader", "spin"));
  try {
    // One planned night at a time. The sheet's gate is only advisory (its
    // cache can be stale, or empty because the list never loaded), so a
    // shared create re-asks Firestore here. Fail closed: an unanswered
    // question is not a "no" — unlisted stays available either way.
    if (listed) {
      let planned;
      try {
        planned = partitionSessions(await listSessions()).upcoming[0];
      } catch {
        throw new Error(
          "couldn’t check for planned sessions. Try again, or set Visibility to Unlisted"
        );
      }
      if (planned) {
        plannedUpcoming = planned;
        throw new Error(
          `a session is already planned for ${sessionDateLabel(planned.createdAt)}`
        );
      }
    }
    // The session's songbook, picked on the sheet. Resolved through the
    // editions listing so the doc carries a real {id, title}; when the listing
    // never loaded the id alone is enough (loadCatalogue enriches it). Never
    // null — every session now names its book explicitly.
    const chosenId = sheetEdition.value || "current";
    const chosenEdition = editionsList.find((e) => e.id === chosenId) || {
      id: chosenId,
      title: "",
      description: "",
    };
    // Creating loads the Firestore chunk lazily, so the first tap can take a
    // beat — hence the spinner above.
    const id = await sync.createSession(
      () =>
        seed
          ? { ...sessionState(), edition: chosenEdition }
          : { upNext: [], requests: [], edition: chosenEdition },
      applyRemoteState,
      { createdBy: presence.displayName(app.name), listed, createdAt }
    );
    app.edition = chosenEdition;
    scopeCatalogueToEdition(chosenId);
    if (!seed) {
      app.upNext = [];
      app.requests = [];
      renderUpNext();
      renderRequests();
    }
    hasCarryover = false;
    carryoverBox.hidden = true;
    persist();
    closeSheet();
    await navigateTo(id, { cameFromHome: homeSection.hidden === false });
    renderSessionMeta(sync.getMeta());
    updateShareUi();
  } catch (err) {
    // Keep the sheet open with the picked date intact so Start is one tap away
    // once they're back on wifi. There is no local-only mode to fall back to.
    sheetError.textContent = `Couldn’t start a session: ${err.message}`;
    sheetError.hidden = false;
    sheetStart.disabled = false;
    sheetStart.replaceChildren(document.createTextNode("Start"));
    // After the generic re-enable above, so a "planned session found" refusal
    // ends with Start disabled and the notice explaining why.
    updateSheetGate();
  }
}

newSessionButton.addEventListener("click", () => openSheet());
sheetStart.addEventListener("click", onSheetStart);
sheetVisibility.addEventListener("change", updateSheetGate);
sheetDate.addEventListener("input", updateSheetWindowPreview);
sheetCancel.addEventListener("click", closeSheet);
// Forgiving dismissal: tap the backdrop (the hint says so). Escape is a desktop
// bonus, never the only way out.
sheet.addEventListener("click", (event) => {
  if (event.target === sheet) closeSheet();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !sheet.hidden) closeSheet();
});
// Desktop nicety; native mobile date pickers never surface an Enter key.
sheetDate.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    // Enter would sail past a disabled Start button, so it honours the same
    // planned-session gate.
    if (!sheetStart.disabled) onSheetStart();
  }
});

// --- Carry-over from before sessions were mandatory -------------------------
function renderCarryover() {
  if (!hasCarryover) {
    carryoverBox.hidden = true;
    return;
  }
  const count = app.upNext.length + app.requests.length;
  carryoverText.textContent =
    `You have a list from before that isn’t in a session yet ` +
    `(${count} ${count === 1 ? "song" : "songs"}).`;
  carryoverBox.hidden = false;
}

carryoverStart.addEventListener("click", () => openSheet({ seedCarryover: true }));
carryoverDiscard.addEventListener("click", () => {
  app.upNext = [];
  app.requests = [];
  hasCarryover = false;
  carryoverBox.hidden = true;
  persist();
  renderUpNext();
  renderRequests();
});

// --- Loading editions + catalogue ------------------------------------------
// Drives the song-picker's placeholder states: "loading" until a catalogue is
// available (cache or network), "error" when the fetch failed and there's
// nothing to search — so an empty dropdown never masquerades as "no matches".
let catalogueStatus = "loading";

// Which edition the LOADED catalogue belongs to. Distinct from app.edition:
// on joining a session, app.edition names the session's book the instant the
// doc arrives, while the catalogue in memory is still whatever this device
// last searched — this is how applyRemoteState notices the gap.
let loadedCatalogueEditionId = null;

// The editions listing only knows ids (real titles live in each edition's
// manifest), so prettify the slug for display: "wexford-2026" -> "Wexford 2026".
// A real title is preferred whenever the API sends one.
function editionLabel(e) {
  if (e.title && e.title !== e.id) return e.title;
  return e.id
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

// The fetched editions listing, kept for the new-session sheet and for
// resolving a picked id back to its {id, title} on create. Empty until (and
// unless) /api/editions answers — both selects ship a hardcoded "current"
// option so the default path never depends on this request.
let editionsList = [];

function populateEditionSelect(select, selectedId) {
  // A session can name an edition the listing doesn't know (an unlisted book,
  // or the listing simply failed) — give it an option anyway so the select
  // shows the truth instead of silently snapping to something else.
  const known = editionsList.length ? editionsList : [{ id: "current" }];
  const editions = known.some((e) => e.id === selectedId)
    ? known
    : [...known, { id: selectedId }];
  select.replaceChildren(
    ...editions.map((e) => {
      const option = document.createElement("option");
      option.value = e.id;
      option.textContent = editionLabel(e);
      option.selected = e.id === selectedId;
      return option;
    })
  );
}

// Point the settings select at the session's book, growing an option for an
// id it doesn't have yet (editions may still be loading when the doc arrives).
function syncEditionSelect(editionId) {
  if (editionSelect.value === editionId) return;
  if (![...editionSelect.options].some((o) => o.value === editionId)) {
    populateEditionSelect(editionSelect, editionId);
  }
  editionSelect.value = editionId;
}

async function loadEditions() {
  try {
    const res = await fetch(`${API_BASE}/api/editions`);
    const data = await res.json();
    if (!Array.isArray(data.editions) || !data.editions.length) return;
    editionsList = data.editions;
  } catch {
    /* keep the hardcoded "current" options */
    return;
  }
  populateEditionSelect(editionSelect, app.edition?.id || "current");
  populateEditionSelect(sheetEdition, sheetEdition.value || "current");
}

// Load the catalogue for an edition independently of any photo, so manual add
// works before (or without) a scan. Never wipes the setlist. Requests are
// sequenced: hopping between sessions with different books can leave two
// fetches in flight, and the slower (stale) one must not win.
let catalogueLoadSeq = 0;
async function loadCatalogue(edition) {
  const seq = ++catalogueLoadSeq;
  try {
    const res = await fetch(
      `${API_BASE}/api/catalogue?edition=${encodeURIComponent(edition)}`
    );
    if (seq !== catalogueLoadSeq) return;
    if (!res.ok) {
      if (!app.catalogue.length) catalogueStatus = "error";
      refreshPickers();
      return;
    }
    const data = await res.json();
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
    renderUpNext();
    renderRequests();
    refreshPickers();
  } catch {
    /* leave any previously loaded catalogue in place */
    if (seq !== catalogueLoadSeq) return;
    if (!app.catalogue.length) catalogueStatus = "error";
    refreshPickers();
  }
}

// Switching the book mid-session: cache-first swap like any other re-scope,
// and an immediate persist() so a cached switch reaches the session peers even
// if the background refresh never lands (the pub wifi case).
editionSelect.addEventListener("change", () => {
  scopeCatalogueToEdition(editionSelect.value);
  persist();
});

// normalizeText lives in dupes.js now (shared with duplicate detection); it
// mirrors the accent-insensitive matching the backend does in matcher.py, so
// "sara" finds "Sarà" and users don't have to type diacritics on a phone.
function searchCatalogue(query, limit = 8) {
  const terms = normalizeText(query.trim()).split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  return app.catalogue
    .filter((entry) => {
      const haystack = normalizeText(`${entry.title} ${entry.artist || ""}`);
      return terms.every((term) => haystack.includes(term));
    })
    .slice(0, limit);
}

// Open pickers re-run their query when the catalogue (finally) arrives — text
// typed during a slow load must not silently read as "no such song". Entries
// self-prune once their input leaves the DOM (rows re-render constantly).
const pickerRefreshers = new Set();

function refreshPickers() {
  for (const refresh of pickerRefreshers) refresh();
}

// A tap that we fully handle at pointerdown still leaves the browser to
// synthesize a trailing click from the same gesture, tens to hundreds of
// milliseconds later. By then onPick may have put something new under that
// point — room mode's name sheet does — and the stray click lands on it as a
// phantom second tap (it was closing the sheet on its own backdrop). One
// gesture is one interaction: swallow that trailing click.
function swallowNextClick() {
  let timer;
  const swallow = (event) => {
    event.stopPropagation();
    event.preventDefault();
    clearTimeout(timer);
    document.removeEventListener("click", swallow, true);
  };
  document.addEventListener("click", swallow, true);
  // Nothing to swallow when the pick came from the keyboard — retire quietly.
  timer = setTimeout(() => document.removeEventListener("click", swallow, true), 700);
}

// A small custom combobox. We rolled our own instead of a native <datalist>
// because datalist support is unreliable on the mobile browsers this app
// targets (no dropdown on iOS Safari, flaky on Android). Shared by the per-row
// correction picker and the standalone "add a song" field so the two can't
// drift apart.
let comboboxSeq = 0;
function makeCombobox({ placeholder, onPick }) {
  const wrap = document.createElement("div");
  wrap.className = "song-picker";

  const menuId = `song-picker-menu-${++comboboxSeq}`;

  const input = document.createElement("input");
  input.className = "song-picker-input";
  input.type = "text";
  input.placeholder = placeholder;
  input.autocomplete = "off";
  input.setAttribute("role", "combobox");
  input.setAttribute("aria-autocomplete", "list");
  input.setAttribute("aria-expanded", "false");
  input.setAttribute("aria-controls", menuId);

  const menu = document.createElement("ul");
  menu.className = "song-picker-menu";
  menu.id = menuId;
  menu.setAttribute("role", "listbox");
  menu.hidden = true;

  let matches = [];
  let active = -1;

  // The dropdown has to escape its row card, but `.row-body` carries a z-index
  // for the swipe layer — which makes every card its own stacking context, so
  // the *next* card paints over this menu no matter how high its own z-index
  // is. Lift the whole card for as long as the menu is open; the swipe
  // layering inside it is untouched. No-op for the manual-add combobox, which
  // isn't inside a row.
  function setMenuOpen(open) {
    menu.hidden = !open;
    wrap.closest(".row-card")?.classList.toggle("picker-open", open);
  }

  function close() {
    setMenuOpen(false);
    menu.replaceChildren();
    input.setAttribute("aria-expanded", "false");
    input.removeAttribute("aria-activedescendant");
    active = -1;
  }

  function pick(entry) {
    input.value = "";
    close();
    swallowNextClick(); // see above: one gesture, one interaction
    onPick(entry);
  }

  // Explain an empty result list instead of showing nothing: no catalogue yet,
  // catalogue unreachable, or a genuine no-match.
  function emptyStateMessage() {
    if (catalogueStatus === "loading") return "Loading the songbook…";
    if (catalogueStatus === "error") return "Couldn't load the songbook. Check your connection";
    return `No matches for “${input.value.trim()}”`;
  }

  function renderMenu() {
    if (!matches.length) {
      if (!input.value.trim()) return close();
      const status = document.createElement("li");
      status.className = "song-picker-status";
      status.textContent = emptyStateMessage();
      menu.replaceChildren(status);
      setMenuOpen(true);
      input.setAttribute("aria-expanded", "true");
      input.removeAttribute("aria-activedescendant");
      return;
    }
    menu.replaceChildren(
      ...matches.map((entry, i) => {
        const li = document.createElement("li");
        li.id = `${menuId}-opt-${i}`;
        li.className = "song-picker-option" + (i === active ? " active" : "");
        li.setAttribute("role", "option");
        li.setAttribute("aria-selected", i === active ? "true" : "false");
        const name = document.createElement("span");
        name.className = "song-picker-name";
        name.textContent = entry.display;
        const page = document.createElement("span");
        page.className = "page-badge";
        page.textContent = `p.${entry.page}`;
        li.append(name, page);
        // pointerdown fires before the input's blur, so the pick registers
        // instead of the field closing first (works for mouse and touch).
        li.addEventListener("pointerdown", (ev) => {
          ev.preventDefault();
          pick(entry);
        });
        return li;
      })
    );
    setMenuOpen(true);
    input.setAttribute("aria-expanded", "true");
    // Screen readers track the arrow-key highlight through this.
    if (active >= 0) input.setAttribute("aria-activedescendant", `${menuId}-opt-${active}`);
    else input.removeAttribute("aria-activedescendant");
  }

  input.addEventListener("input", () => {
    matches = searchCatalogue(input.value);
    active = -1;
    renderMenu();
  });

  pickerRefreshers.add(function refresh() {
    if (!input.isConnected) {
      pickerRefreshers.delete(refresh);
      return;
    }
    // Only refresh a picker the user is actually in — don't pop menus open
    // under an unfocused field.
    if (document.activeElement !== input || !input.value.trim()) return;
    matches = searchCatalogue(input.value);
    active = -1;
    renderMenu();
  });

  input.addEventListener("keydown", (ev) => {
    if (menu.hidden) return;
    if (ev.key === "ArrowDown") {
      ev.preventDefault();
      active = Math.min(active + 1, matches.length - 1);
      renderMenu();
    } else if (ev.key === "ArrowUp") {
      ev.preventDefault();
      active = Math.max(active - 1, 0);
      renderMenu();
    } else if (ev.key === "Enter" && active >= 0) {
      ev.preventDefault();
      pick(matches[active]);
    } else if (ev.key === "Escape") {
      close();
    }
  });

  // Delay so a pending option pointerdown can win the race with blur.
  input.addEventListener("blur", () => setTimeout(close, 120));

  wrap.append(input, menu);
  return wrap;
}

function buildSongPicker(row) {
  return makeCombobox({
    placeholder: "Correct song…",
    onPick: (entry) => setMatch(row, entry),
  });
}

// The collapsed form of the picker, for review rows we matched confidently:
// one button that swaps itself for the real picker in place. Deliberately not a
// re-render — rebuilding the sheet would collapse it again and lose the tap, so
// the row keeps its expanded picker until the next render (a correction, which
// re-renders anyway, or closing the sheet).
function buildPickerToggle(row) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "picker-toggle";
  button.appendChild(icon("edit"));
  button.title = "Change song";
  button.setAttribute("aria-label", `Change song for “${row.raw_title}”`);
  button.onclick = () => {
    const picker = buildSongPicker(row);
    button.replaceWith(picker);
    picker.querySelector("input").focus();
  };
  return button;
}

// The standalone add field lives outside any row and creates a new confirmed
// request instead of correcting an existing one. The optional comment rides
// along in the full app only — the room enters one in the confirm sheet
// instead, so the mode CSS hides this affordance there.
function mountManualAdd() {
  const comment = buildManualComment();
  manualAddHost.replaceChildren(
    makeCombobox({
      placeholder: "Add a tune by name…",
      onPick: (entry) => onManualPick(entry, comment),
    }),
    comment.el
  );
}

// The full app adds on the spot (no sheet), so a comment has to be typed
// BEFORE the pick. Collapsed to a link so bulk board transcription keeps a
// single control and an empty field never parks on screen reading as
// mandatory. Cleared after each add — a comment is about one tune, never a
// sticky setting.
function buildManualComment() {
  const wrap = document.createElement("div");
  wrap.className = "manual-add-comment";
  const input = document.createElement("input");
  input.type = "text";
  input.maxLength = 120;
  input.placeholder = "Comment for the next tune you add…";
  input.setAttribute("aria-label", "Comment for the next tune you add (optional)");
  input.hidden = true;
  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "link-button";
  toggle.textContent = "Add a comment";
  toggle.onclick = () => {
    toggle.hidden = true;
    input.hidden = false;
    input.focus();
  };
  wrap.append(toggle, input);
  return {
    el: wrap,
    read: () => input.value,
    clear: () => {
      input.value = "";
    },
  };
}

// Where the two modes part company (#88). The full app adds on the spot: an
// organiser transcribing the board adds in bulk, and anything they regret is
// one tap in the bin. A request from the room goes through the brakes first —
// it can't be taken back once it lands, and one keen phone shouldn't be able
// to fill the pool in a minute.
function onManualPick(entry, comment) {
  if (viewMode !== "room") {
    // Cleared only once the row actually lands: a duplicate refusal keeps the
    // typed comment for the retry on the right tune.
    if (addManualEntry(entry, comment.read())) comment.clear();
    return;
  }
  // Belt and braces: the combobox is already gone when requests are closed
  // (#86), so this only catches the flip (or window boundary) landing between
  // paint and tap.
  if (!requestsState().open) {
    flashNote(addFeedback, "Requests are closed. Try the whiteboard of wishes!");
    return;
  }
  const waiting = cooldownRemaining(readLastRoomAdd(), Date.now());
  if (waiting) {
    flashNote(
      addFeedback,
      `One at a time! You can add another in ${cooldownLabel(waiting)}.`
    );
    return;
  }
  // Check for a duplicate up front so the sheet never offers to add something
  // that would only be refused on confirm (#52).
  const existing = findDuplicate(app.upNext, app.requests, matchKey(entry));
  if (existing) {
    flashNote(addFeedback, duplicateLabel(existing.where));
    return;
  }
  openRequestSheet(entry);
}

// Returns whether a row was actually added, so the request sheet can tell a
// completed pick from a refusal. `comment` reuses the row's `notes` slot — the
// same field a scanned board annotation ("please NO!!!") lands in, so it
// syncs and renders with no new schema.
function addManualEntry(entry, comment) {
  // Same song already on the night's lists (#52)? Say where it is instead of
  // quietly doubling it. Binned copies don't block — see dupes.js.
  const existing = findDuplicate(app.upNext, app.requests, matchKey(entry));
  if (existing) {
    flashNote(addFeedback, duplicateLabel(existing.where));
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
  // pick that opened the sheet — a slow typist shouldn't spend their wait
  // inside the dialog. Persisted, so a reload isn't a way around it.
  if (viewMode === "room") writeLastRoomAdd(Date.now());
  renderRequests();
  persist();
  return true;
}

function setMatch(row, entry) {
  row.match = entry;
  row.status = entry ? "confirmed" : "unmatched";
  row.explanation = entry ? "Manually selected" : "";
  row.alternatives = [];
  rerender();
  persist();
}

// --- Photo scan -> review sheet --------------------------------------------
function rowToEntry(row) {
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

// The camera control is a real <button> for keyboard/switch access; forward
// activation to the hidden file input.
cameraButton.addEventListener("click", () => photoInput.click());

// Long waits (cold start + parse) feel shorter with signs of life. The copy
// advances rather than cycling, and stops on the last message.
const SCAN_MESSAGES = [
  "Reading the board…",
  "Deciphering the handwriting…",
  "Matching against the songbook…",
  "Nearly there…",
];
let scanMessageTimer = null;
function startScanStatus() {
  let i = 0;
  scanStatusText.textContent = SCAN_MESSAGES[0];
  scanMessageTimer = setInterval(() => {
    i = Math.min(i + 1, SCAN_MESSAGES.length - 1);
    scanStatusText.textContent = SCAN_MESSAGES[i];
  }, 4000);
}
function stopScanStatus() {
  clearInterval(scanMessageTimer);
  scanMessageTimer = null;
}

// A hung request used to sweep the beam forever with no way out but a reload
// (#44). Two escapes now: this ceiling — generous, because a cold Cloud
// Function plus a thinking model legitimately takes tens of seconds — and the
// Cancel button on the overlay.
const SCAN_TIMEOUT_MS = 90000;
// Which of the two aborted the scan, since fetch reports both as AbortError.
let scanAbort = null;
let scanEndedBy = null;

function abortScan(reason) {
  if (!scanAbort) return;
  scanEndedBy = reason;
  scanAbort.abort();
}
scanCancel.addEventListener("click", () => abortScan("cancel"));

photoInput.addEventListener("change", async () => {
  const file = photoInput.files[0];
  if (!file) return;
  // A fresh scan replaces the previous photo — release the old object URL
  // before minting a new one (they otherwise live until the tab closes).
  if (preview.src.startsWith("blob:")) URL.revokeObjectURL(preview.src);
  // Keep the object URL around: the review sheet lets you re-open this photo
  // (via a row's ⚠️ icon) to eyeball a match against the actual handwriting.
  const imageUrl = URL.createObjectURL(file);
  preview.src = imageUrl;
  previewWrap.hidden = false;
  errorBox.hidden = true;
  scanResult.hidden = true;
  scanOverlay.hidden = false;
  startScanStatus();
  // Bring the photo (and its scanning animation) into view — it can sit below
  // the setlist, so scroll to it while the board is being read.
  previewWrap.scrollIntoView({ behavior: "smooth", block: "center" });

  scanEndedBy = null;
  scanAbort = new AbortController();
  const timeout = setTimeout(() => abortScan("timeout"), SCAN_TIMEOUT_MS);

  try {
    // The long edge governs the upload now, not just the server's resize — the
    // camera's 3–8MB original would be thrown away server-side anyway (#44).
    const maxEdge = resolveMaxEdge(maxImageEdge.value);
    const upload = await downscaleImage(file, { maxEdge });

    const form = new FormData();
    form.append("image", upload);
    // The session's book, not the raw select: app.edition is the source of
    // truth and the two only diverge for the beat before the select syncs.
    form.append("edition", app.edition?.id || editionSelect.value);
    // Tuning knobs from the settings panel — the API clamps/ignores anything out
    // of range and falls back to its configured defaults.
    if (modelSelect.value) form.append("model", modelSelect.value);
    form.append("thinking_budget", disableThinking.checked ? "0" : "1024");
    form.append("catalogue_in_prompt", sendCatalogue.checked ? "true" : "false");
    // Sent anyway: a browser that couldn't downscale still gets the size it
    // asked for, and when the shrink worked this is a no-op on a photo that
    // already fits.
    form.append("max_image_edge", String(maxEdge));
    const res = await fetch(`${API_BASE}/api/parse`, {
      method: "POST",
      body: form,
      signal: scanAbort.signal,
    });
    if (!res.ok) {
      const detail = (await res.json().catch(() => ({}))).detail;
      throw new Error(detail || `Server error (${res.status})`);
    }
    const data = await res.json();
    // Refresh catalogue/edition metadata from the parse response.
    app.edition = data.edition;
    app.catalogue = data.catalogue;
    app.catalogueGeneratedAt = data.catalogue_generated_at;
    catalogueStatus = "ready";
    saveCatalogueCache();
    refreshPickers();
    // Confident matches skip the queue (#80): on a mostly-legible board,
    // reviewing rows that need no review was the bulk of the tap work. Only
    // the flagged rows (needs_review / conflict / unmatched) go to the review
    // sheet; crossed-out-but-confirmed rows auto-add with their flag, same as
    // they used to land after a manual confirm.
    const entries = data.rows.map(rowToEntry);
    const confirmed = entries.filter((e) => e.status === "confirmed");
    const flagged = entries.filter((e) => e.status !== "confirmed");
    // Duplicate gate (#52): a re-scan of the board must not double the night.
    // Keep only confirmed rows whose song is neither already on the lists nor
    // earlier in this same batch (boards repeat songs too).
    const seen = new Set();
    const fresh = [];
    let skipped = 0;
    for (const entry of confirmed) {
      const key = rowKey(entry);
      if (seen.has(key) || findDuplicate(app.upNext, app.requests, key)) {
        skipped++;
        continue;
      }
      seen.add(key);
      fresh.push(entry);
    }
    if (fresh.length) {
      app.requests.push(...fresh);
      // Whoever wrote each of these on the board counts as its asker, so board
      // requests start level with app ones (#83). Anonymous, not attributed to
      // the person holding the camera: one photo makes many rows and they asked
      // for none of them.
      for (const row of fresh) app.votes = seedAsker(app.votes, row.uid, ASKER);
      renderRequests();
      persist();
    }
    if (flagged.length) {
      // Flagged rows that duplicate the lists arrive pre-removed: the review
      // sheet's existing remove/restore mechanic IS the "offer to skip on
      // confirm" — restore opts a copy back in deliberately.
      for (const entry of flagged) {
        if (entry.match && findDuplicate(app.upNext, app.requests, rowKey(entry))) {
          entry.removed = true;
        }
      }
      app.review = { entries: flagged, autoAdded: fresh.length, autoSkipped: skipped, imageUrl };
      openReview();
    } else {
      // Nothing to check: no review sheet, just say what happened. The photo
      // has no reachable viewer without a review, so release it.
      URL.revokeObjectURL(imageUrl);
      previewWrap.hidden = true;
      const skippedNote = skipped ? ` · skipped ${skipped} already listed` : "";
      let message;
      if (fresh.length) message = `Added ${fresh.length} from the board${skippedNote}`;
      else if (skipped) message = "Nothing new. Everything on the board is already listed.";
      else message = "Couldn't read any songs off that photo. Try a closer, straighter shot.";
      showScanResult(message);
    }
  } catch (err) {
    // Both escapes from a hung scan land here as AbortError (#44); only the
    // timeout is a failure worth an error box — a deliberate cancel just puts
    // the camera back, with a line confirming nothing was read.
    if (err.name === "AbortError") {
      URL.revokeObjectURL(imageUrl);
      previewWrap.hidden = true;
      if (scanEndedBy === "timeout") {
        errorBox.textContent =
          "That scan took too long. Check your signal and snap it again.";
        errorBox.hidden = false;
      } else {
        showScanResult("Scan cancelled. Nothing was added.");
      }
    } else {
      // A fetch that never reached the server rejects with a TypeError and an
      // unhelpful message ("Failed to fetch") — translate it for humans. Server
      // errors carry a user-facing `detail` and pass through.
      errorBox.textContent =
        err instanceof TypeError
          ? "Couldn't reach the server. Check your signal and try again."
          : err.message;
      errorBox.hidden = false;
    }
  } finally {
    clearTimeout(timeout);
    scanAbort = null;
    stopScanStatus();
    scanOverlay.hidden = true;
    // Reset so re-selecting the same file re-fires `change`.
    photoInput.value = "";
  }
});

// Transient inline feedback ("Added 7 from the board", "Already in Up next").
// Self-retiring per element: long enough to read across the room, gone before
// it reads as a permanent fixture.
const flashTimers = new Map();
function flashNote(el, message) {
  el.textContent = message;
  el.hidden = false;
  clearTimeout(flashTimers.get(el));
  flashTimers.set(
    el,
    setTimeout(() => {
      el.hidden = true;
    }, 8000)
  );
}
const showScanResult = (message) => flashNote(scanResult, message);

function openReview() {
  addSection.hidden = true;
  reviewSection.hidden = false;
  // Orientation first: say how many rows skipped the queue (and how many were
  // already listed, #52), so "the sheet shows 3 but the board had 12" reads as
  // the feature it is, not a bug.
  const auto = app.review?.autoAdded ?? 0;
  const dupes = app.review?.autoSkipped ?? 0;
  if (auto) {
    const dupesNote = dupes ? ` (${dupes} already listed)` : "";
    reviewNote.textContent =
      `${auto} clear ${auto === 1 ? "match" : "matches"} went straight to ` +
      `Requests${dupesNote}. These need a look first.`;
  } else if (dupes) {
    reviewNote.textContent = `${dupes} from the board ${dupes === 1 ? "was" : "were"} already listed. These need a look first.`;
  } else {
    reviewNote.textContent = "Fix any misreads, drop what you don't want, then add them to Requests.";
  }
  // An in-flight scan means songs are coming: leave the fresh state so the
  // review sheet appears in the full layout.
  updateSessionMode();
  renderReview();
  reviewSection.scrollIntoView({ behavior: "smooth", block: "start" });
}

function closeReview() {
  reviewSection.hidden = true;
  addSection.hidden = false;
  previewWrap.hidden = true;
  closePhotoLightbox();
  // The photo is only reachable from the review sheet — release it with it.
  if (app.review?.imageUrl) URL.revokeObjectURL(app.review.imageUrl);
  app.review = null;
  updateSessionMode();
}

// The scanned board is hidden during review, but a flagged row (⚠️) may need a
// second look at the handwriting. Clicking the icon pops the photo full-screen
// so the match can be checked by eye, then dismissed.
function openPhotoLightbox() {
  const src = app.review?.imageUrl;
  if (!src) return;
  photoLightboxImg.src = src;
  photoLightbox.hidden = false;
}

function closePhotoLightbox() {
  photoLightbox.hidden = true;
}

// Mobile-first dismissal: there's no Escape key on a phone and "tap the
// backdrop but not the photo" is a fiddly target, so tapping ANYWHERE on the
// overlay closes it. The ✕ stays as the obvious, thumb-sized affordance;
// Escape is just a harmless desktop bonus.
photoLightbox.addEventListener("click", closePhotoLightbox);
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !photoLightbox.hidden) closePhotoLightbox();
});

function renderReview() {
  if (!app.review) return;
  const kept = app.review.entries.filter((e) => !e.removed).length;
  reviewConfirm.replaceChildren(...iconLabel("add", `Add ${kept} to Requests`));
  reviewConfirm.disabled = kept === 0;
  reviewRows.replaceChildren(
    ...app.review.entries.map((e, i) => renderRow(e, i, "review"))
  );
}

reviewConfirm.addEventListener("click", () => {
  if (!app.review) return;
  const kept = app.review.entries.filter((e) => !e.removed);
  app.requests.push(...kept);
  for (const row of kept) app.votes = seedAsker(app.votes, row.uid, ASKER);
  closeReview();
  renderRequests();
  persist();
});

// Cancelling throws away the flagged rows (and the wait for the scan) — one
// stray tap shouldn't do that silently. With auto-add (#80) the clear matches
// are already safe in Requests, and the prompt says so.
reviewCancel.addEventListener("click", () => {
  const message = app.review?.autoAdded
    ? "Discard the rows still needing a check? The clear matches already added stay in Requests."
    : "Discard this scan?";
  if (confirm(message)) closeReview();
});

// --- Rendering -------------------------------------------------------------
function rerender() {
  renderUpNext();
  renderRequests();
  if (app.review) renderReview();
}

// A session with no songs at all has exactly one job — get the board in — so
// the view collapses to the add affordances (the `fresh` class drives the CSS).
// Every mutation path (local edits, remote snapshots, review confirm) funnels
// through renderUpNext/renderRequests, so calling this from both keeps the
// mode honest; open/closeReview call it too since an in-flight scan counts as
// "songs are coming".
function updateSessionMode() {
  // Never in room mode: the fresh state is a camera hero, and room mode has no
  // camera — an empty pool there shows the combobox and the empty note.
  const fresh =
    app.upNext.length === 0 &&
    app.requests.length === 0 &&
    !app.review &&
    viewMode !== "room";
  sessionView.classList.toggle("fresh", fresh);
}

// The export pair covers both lists; with nothing to export, copying an empty
// string and downloading `{rows: []}` are traps, not actions.
function updateExportButtons() {
  const empty = exportedRows().length === 0;
  copyButton.disabled = empty;
  downloadButton.disabled = empty;
}

// Heading counts: how deep is the set / the pool, visible without counting
// cards. Hidden at zero — the empty-state notes own that moment.
function renderCount(el, count) {
  el.textContent = `· ${count}`;
  el.hidden = count === 0;
}

function renderEditionNote() {
  if (app.edition) {
    editionNote.textContent =
      `Matched against “${editionLabel(app.edition)}” ` +
      `(generated ${app.catalogueGeneratedAt?.slice(0, 10) || "unknown"})`;
  } else {
    editionNote.textContent = "";
  }
}

function renderUpNext() {
  renderEditionNote();
  updateSessionMode();
  updateExportButtons();
  // Played and binned rows are lifted out into their collapsed groups, so the
  // empty note keys off the rows still *visible* in the running order.
  const visible = app.upNext.filter((e) => !e.binned && !e.played);
  upnextEmpty.hidden = visible.length > 0;
  // The full app's note points at promote, a control room mode doesn't have.
  upnextEmpty.textContent =
    viewMode === "room"
      ? "Nothing queued yet."
      : "Nothing queued yet. Promote a request from below.";
  renderCount(upnextCount, visible.length);
  // Room mode watches the set and can want a tune, nothing else: "room-upnext"
  // matches none of renderRow's control branches, so no handle, no buttons, no
  // swipe — the pool's "room" trick, thumb included.
  const rowContext = viewMode === "room" ? "room-upnext" : "upnext";
  // Map over the full list (skipping lifted-out rows) so the index handed to
  // renderRow still points at app.upNext — the reorder controls rely on it.
  upnextRows.replaceChildren(
    ...app.upNext
      .map((e, i) => (e.binned || e.played ? null : renderRow(e, i, rowContext)))
      .filter(Boolean)
  );
  // The set plays from the top, so the first visible card IS the next tune —
  // mark it so the glance-and-shout moment needs no counting. The tag sits on
  // its own micro-line above the title (inside the title it forced mid-name
  // wraps), and is real text (not CSS content) so assistive tech reads it too.
  // Re-rendering after any reorder/play re-marks the right card.
  const nextCard = upnextRows.querySelector(".row-card");
  if (nextCard) {
    nextCard.classList.add("next-up");
    const tag = document.createElement("span");
    tag.className = "next-tag";
    tag.textContent = "Next";
    nextCard.querySelector(".row-main").prepend(tag);
  }
  // The set plays from the top, so played songs collapse into a one-line count
  // *above* the list and Up next always starts at the next tune. Expanding
  // shows the night's history (array order = play order) and the un-play
  // control that rescues a stray swipe-right. Room mode gets the same
  // disclosure (expanding is view state, not an edit) but a read-only context,
  // so no un-play button on a room phone.
  renderGroup(playedGroup, {
    iconName: "played",
    noun: "played",
    rows: app.upNext.filter((e) => e.played),
    open: app.playedOpen,
    onToggle: () => {
      app.playedOpen = !app.playedOpen;
      renderUpNext();
    },
    context: viewMode === "room" ? "room-played" : "played",
  });
}

function renderRequests() {
  updateSessionMode();
  updateExportButtons();
  const visible = app.requests.filter((e) => !e.binned);
  requestsEmpty.hidden = visible.length > 0;
  // The empty note mentions snapping the board, but room mode has no camera —
  // there, adding by name is the only door, and once requests are closed (#86)
  // there is no door at all, so pointing at one above would be a lie.
  requestsEmpty.textContent =
    viewMode === "room"
      ? requestsState().open
        ? "No requests yet. Add one above."
        : "No requests yet."
      : "No requests yet. Snap the board, or add one above.";
  renderCount(requestsCount, visible.length);
  // Most-wanted first (#83). Display only: `requestsOrder` stays arrival order,
  // because reordering the real array would rewrite that whole-array
  // last-writer-wins field on every vote and fight every concurrent edit in the
  // room. The sort is stable, so a tie keeps arrival order rather than
  // reshuffling the pool under the MC's thumb.
  //
  // Room mode gets read-only rows apart from the want button: the "room"
  // context matches none of renderRow's other control branches, so no
  // promote/bin buttons and no swipe.
  requestsRows.replaceChildren(
    ...sortForDisplay(visible, app.votes).map((e, i) =>
      renderRow(e, i, viewMode === "room" ? "room" : "requests")
    )
  );
  // The bin group replaces the old standalone Bin section: every binned row
  // from both working lists (they stay in their home arrays so un-binning
  // restores them in place), collapsed to one line at the foot of the session
  // view — the discard pile sits below everything still in play.
  renderGroup(binGroup, {
    iconName: "bin",
    noun: "binned",
    rows: [...app.upNext, ...app.requests].filter((e) => e.binned),
    open: app.binOpen,
    onToggle: () => {
      app.binOpen = !app.binOpen;
      renderRequests();
    },
    context: "bin",
  });
}

// A collapsed one-line disclosure ("3 played" / "2 binned") instead of another
// stacked section: on a phone the count is always visible but the rows only on
// demand, so the group costs one row of screen no matter how long the night
// gets. Hidden entirely while empty.
function renderGroup(container, { iconName, noun, rows, open, onToggle, context }) {
  container.replaceChildren();
  container.hidden = rows.length === 0;
  if (container.hidden) return;

  const listId = `${container.id}-rows`;
  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "group-toggle";
  toggle.setAttribute("aria-expanded", String(open));
  toggle.setAttribute("aria-controls", listId);
  const label = document.createElement("span");
  label.className = "group-label";
  label.textContent = `${rows.length} ${noun}`;
  toggle.append(icon(iconName), label, icon("chevron", "group-chevron"));
  toggle.onclick = onToggle;
  container.appendChild(toggle);

  if (open) {
    const list = document.createElement("ul");
    list.id = listId;
    list.className = "group-rows";
    list.append(...rows.map((e, i) => renderRow(e, i, context)));
    container.appendChild(list);
  }
}

// A room device on a View-only link doesn't vote either: the share panel
// promises those people can "open tonight's pool and watch it", and a live
// control would make that copy a lie. The full app always votes — closing the
// link is about the link.
function votingEnabled() {
  return viewMode !== "room" || requestsState().open;
}

// The want button: a thumb plus the count, pressed while this device is one of
// them. The count is real text rather than a CSS pseudo-element so screen
// readers get it, and the aria-label says the number out loud because a bare
// "8" next to an icon doesn't say what it counts.
function buildVoteButton(row) {
  const clientId = presence.getClientId();
  const count = voteCount(app.votes, row.uid);
  const mine = hasVoted(app.votes, row.uid, clientId);

  const button = document.createElement("button");
  button.type = "button";
  button.className = "vote-button";
  if (mine) button.classList.add("voted");
  button.setAttribute("aria-pressed", mine ? "true" : "false");
  button.title = mine ? "You want this one" : "I want this one";
  button.setAttribute(
    "aria-label",
    count === 0
      ? "I want this one, nobody has yet"
      : `${mine ? "You and " : ""}${count} ${count === 1 ? "person wants" : "people want"} this one`
  );
  const tally = document.createElement("span");
  tally.className = "vote-count";
  tally.textContent = String(count);
  button.append(icon("want"), tally);
  button.onclick = () => toggleRowVote(row.uid);
  return button;
}

// Optimistic like every other row mutation: flip it locally, re-render, and let
// persist() carry it to the debounced push. diff() turns this into a single
// `votes.<uid>.<clientId>` leaf write, so two people voting at once both land.
function toggleRowVote(uid) {
  app.votes = toggleVote(app.votes, uid, presence.getClientId());
  // Both lists: the voted row can be in either. Not rerender() — a vote has no
  // business rebuilding an open review sheet.
  renderUpNext();
  renderRequests();
  persist();
}

function renderRow(row, index, context) {
  const li = document.createElement("li");
  li.className = `row-card ${row.status}`;
  li.dataset.uid = row.uid;
  if (row.crossed_out) li.classList.add("crossed");
  if (row.removed) li.classList.add("removed");
  // Live gig-tracking state (Up next / Requests): played fades the row out,
  // binned crosses it out. Both survive a reload via the persisted lists.
  if (row.played) li.classList.add("played");
  if (row.binned) li.classList.add("binned");

  // The visible card surface lives in `.row-body`; it slides horizontally on a
  // swipe to reveal the `.swipe-hint` layer behind it. The <li> itself is the
  // clipping frame (see wireSwipe / the CSS).
  const body = document.createElement("div");
  body.className = "row-body";
  // On the working lists the text content lives in its own column so the
  // action buttons can sit beside it, vertically centred — a whole row of
  // card given over to two icons was most of what made each card tall. The
  // review sheet keeps the stacked layout: its tools row carries the
  // full-width song picker.
  if (context !== "review") body.classList.add("compact");
  const main = document.createElement("div");
  main.className = "row-main";
  body.appendChild(main);

  const top = document.createElement("div");
  top.className = "row-top";
  const title = document.createElement("span");
  title.className = "match-title";
  title.textContent = row.match ? row.match.display : `“${row.raw_title}”`;
  // The warning icon, the "reasons" explanation, and the correct-song picker are
  // validation affordances — they belong to the review sheet only. The setlist
  // is the clean final running order, so they're omitted there.
  if (context === "review" && row.match && row.status !== "confirmed") {
    const warn = document.createElement("button");
    warn.type = "button";
    warn.className = "warn-icon";
    warn.appendChild(icon("warn"));
    const reason = row.explanation || "Needs a check";
    warn.title = `${reason}. Tap to see the photo`;
    warn.setAttribute("aria-label", `${reason}. Show the scanned photo to check this match.`);
    warn.onclick = () => openPhotoLightbox();
    title.append(" ", warn);
  }
  top.appendChild(title);
  if (row.match) {
    const badge = document.createElement("span");
    badge.className = "page-badge";
    badge.textContent = `p.${row.match.page}`;
    top.appendChild(badge);
  }
  main.appendChild(top);

  if (context === "review") {
    // The review sheet is the validation surface: always show what the board
    // said, so a match can be judged against the handwriting.
    const raw = document.createElement("div");
    raw.className = "raw";
    raw.textContent =
      `wrote: “${row.raw_title}”` +
      (row.raw_page ? ` · p.${row.raw_page}` : " · no page") +
      (row.notes ? ` · ${row.notes}` : "") +
      (row.crossed_out ? " · crossed out" : "");
    main.appendChild(raw);

    // Provenance: who added this tune and where it came from. Name it only
    // when we have one (a legacy or name-less entry shows just the source).
    const origin = sourceLabel(row.source);
    const provenance = document.createElement("div");
    provenance.className = "added-by";
    provenance.textContent = row.addedBy ? `Added by ${row.addedBy} · ${origin}` : origin;
    main.appendChild(provenance);

    if (row.explanation) {
      const explanation = document.createElement("div");
      explanation.className = "explanation";
      const confidence = row.confidence ? ` (${Math.round(row.confidence * 100)}%)` : "";
      explanation.textContent = row.explanation + (row.status === "confirmed" ? confidence : "");
      main.appendChild(explanation);
    }

    // Duplicate call-out (#52), computed live so a correction to an
    // already-listed song surfaces immediately. Rows that were duplicates at
    // scan time arrive pre-removed; this line is why, and the restore button
    // is the deliberate way back in.
    if (row.match) {
      const existing = findDuplicate(app.upNext, app.requests, rowKey(row));
      if (existing) {
        const dupNote = document.createElement("div");
        dupNote.className = "dup-note";
        dupNote.textContent = duplicateLabel(existing.where);
        main.appendChild(dupNote);
      }
    }
  } else {
    // The working lists get one quiet line: provenance, plus only the facts
    // that still need saying. Repeating the matched title and page as
    // `wrote: …` under every row said nothing on the happy path — the board
    // text earns its place only when it differs from the match.
    const parts = [];
    if (row.addedBy) parts.push(`Added by ${row.addedBy}`);
    if (row.source !== "manual") parts.push(sourceLabel(row.source));
    else if (!row.addedBy) parts.push("added manually");
    if (row.match) {
      if (row.raw_title && row.raw_title !== row.match.display) {
        parts.push(`wrote “${row.raw_title}”`);
      }
      if (row.raw_page && row.raw_page !== row.match.page) {
        parts.push(`board says p.${row.raw_page}`);
      }
    } else {
      // No stripe colour out here (see style.css) — say it in words instead.
      parts.push("not in the songbook");
    }
    if (row.notes) parts.push(row.notes);
    if (row.crossed_out) parts.push("crossed out");
    if (parts.length) {
      const meta = document.createElement("div");
      meta.className = "row-meta";
      const text = parts.join(" · ");
      meta.textContent = text.charAt(0).toUpperCase() + text.slice(1);
      main.appendChild(meta);
    }
  }

  if (showSuggestions.checked && row.alternatives?.length && !row.removed) {
    const chips = document.createElement("div");
    chips.className = "chips";
    row.alternatives.forEach((alt) => {
      const chip = document.createElement("button");
      chip.textContent = `${alt.entry.title} (p.${alt.entry.page})`;
      chip.onclick = () => setMatch(row, alt.entry);
      chips.appendChild(chip);
    });
    main.appendChild(chips);
  }

  const tools = document.createElement("div");
  tools.className = "row-tools";

  // "I want this one" (#83), on every list a song can still be played from, and
  // first in the row so the buttons after it stay where the thumb expects. Up
  // next is deliberately NOT re-sorted by the count like the pool is: the set
  // plays from the top, so that would move the next tune out from under the MC.
  // No confirm sheet or cool-down, unlike a room request (room-limits.js): a
  // second tap takes a vote back.
  const votable =
    context === "requests" ||
    context === "room" ||
    context === "upnext" ||
    context === "room-upnext";
  if (votable && votingEnabled()) {
    tools.append(buildVoteButton(row));
  }

  // Reorder controls only make sense on Up next (the running order), not in the
  // Requests pool or the review sheet where rows are still being validated.
  if (context === "upnext") {
    // Drag is the primary reorder gesture (pointer/touch); arrow keys on the
    // focused handle are the keyboard-accessible equivalent, so we no longer
    // need the separate move-up/move-down buttons — which read as a third and
    // fourth arrow next to the demote arrow and invited confusion.
    const handle = document.createElement("button");
    handle.className = "drag-handle";
    handle.type = "button";
    handle.appendChild(icon("drag"));
    handle.title = "Drag or press ↑/↓ to reorder";
    handle.setAttribute("aria-label", "Reorder: drag, or press the up and down arrow keys");
    wireDrag(handle, li);
    wireKeyboardReorder(handle, row);
    // The handle is a full-height grab strip down the card's left edge, not a
    // button in the tools row: a big thumb target for reordering on mobile. It
    // lives as the body's first child so it can be absolutely positioned over
    // the left gutter that `has-handle` opens up.
    body.classList.add("has-handle");
    body.insertBefore(handle, body.firstChild);

    // Send a queued tune back to the Requests pool without deleting it.
    const demoteButton = document.createElement("button");
    demoteButton.appendChild(icon("demote"));
    demoteButton.title = "Move to Requests";
    demoteButton.setAttribute("aria-label", "Move to Requests");
    demoteButton.onclick = () => demote(row.uid);

    tools.append(demoteButton);
  }

  // A request is promoted into the running order; no reorder in the pool.
  if (context === "requests") {
    const promoteButton = document.createElement("button");
    promoteButton.appendChild(icon("promote"));
    promoteButton.title = "Move to Up next";
    promoteButton.setAttribute("aria-label", "Move to Up next");
    promoteButton.onclick = () => promote(row.uid);
    tools.append(promoteButton);
  }

  // The correct-song picker is a review-only affordance. A confident match
  // rarely needs correcting, and the picker is a full-width field that roughly
  // doubles a row's height — on a 25-row board that buries the two rows that do
  // need attention. So confirmed rows collapse it behind a button and only the
  // flagged ones open expanded.
  if (context === "review") {
    tools.append(row.status === "confirmed" ? buildPickerToggle(row) : buildSongPicker(row));
  }

  // In the bin group, the only action is to lift a song back out — un-binning
  // flips the flag and the row reappears in its home list at its original spot.
  if (context === "bin") {
    const unbinButton = document.createElement("button");
    unbinButton.type = "button";
    unbinButton.appendChild(icon("restore"));
    unbinButton.title = "Un-bin";
    unbinButton.setAttribute("aria-label", "Un-bin");
    unbinButton.onclick = () => toggleBinned(row);
    tools.append(unbinButton);
  }

  // Likewise in the played group: un-play is the rescue for a stray
  // swipe-right, popping the row back into the running order.
  if (context === "played") {
    const unplayButton = document.createElement("button");
    unplayButton.type = "button";
    unplayButton.appendChild(icon("restore"));
    unplayButton.title = "Mark not played";
    unplayButton.setAttribute("aria-label", "Mark not played");
    unplayButton.onclick = () => togglePlayed(row);
    tools.append(unplayButton);
  }

  // Live tracking lives on the two working lists, but each shows only the
  // action that matches its swipe, so the tap buttons stay in lockstep with the
  // gestures: Up next checks a tune off as played (swipe-right); Requests bins
  // one you don't want (swipe-left). "Skip a queued song" therefore funnels
  // through Requests (demote, then bin) rather than duplicating both actions on
  // both lists. The review sheet has no gig to track, so it keeps remove/restore.
  if (context === "upnext") {
    const playedButton = document.createElement("button");
    playedButton.type = "button";
    playedButton.appendChild(icon("played"));
    playedButton.className = "check-button" + (row.played ? " active" : "");
    playedButton.title = row.played ? "Mark not played" : "Mark played";
    playedButton.setAttribute("aria-label", playedButton.title);
    playedButton.setAttribute("aria-pressed", String(!!row.played));
    playedButton.onclick = () => togglePlayed(row);

    tools.append(playedButton);
  } else if (context === "requests") {
    // The trash icon reads as "bin" — reuse it for the bin action here (cross
    // out, kept in the export) rather than the review sheet's hard removal.
    const binButton = document.createElement("button");
    binButton.type = "button";
    binButton.appendChild(icon("bin"));
    binButton.className = "bin-button" + (row.binned ? " active" : "");
    binButton.title = row.binned ? "Un-bin" : "Bin";
    binButton.setAttribute("aria-label", binButton.title);
    binButton.setAttribute("aria-pressed", String(!!row.binned));
    binButton.onclick = () => toggleBinned(row);

    tools.append(binButton);
  } else if (context === "review") {
    const removeButton = document.createElement("button");
    removeButton.appendChild(icon(row.removed ? "restore" : "bin"));
    removeButton.title = row.removed ? "Restore row" : "Remove row";
    removeButton.setAttribute("aria-label", removeButton.title);
    removeButton.onclick = () => {
      row.removed = !row.removed;
      rerender();
      persist();
    };
    tools.append(removeButton);
  }
  body.appendChild(tools);
  li.appendChild(body);

  // Swipe is the fast one-thumb path on a phone. The action depends on the list:
  // in Requests, swipe right promotes to Up next (else bins); in Up next, swipe
  // left demotes back to Requests (else marks played). The hint sits behind the
  // body and is revealed as the body slides, so its icons follow suit.
  // `swipeable` gates the clipping/relative styles so it can't clip the review
  // sheet's song-picker dropdown (that context is never swipeable).
  if (context === "upnext" || context === "requests") {
    li.classList.add("swipeable");
    const hint = document.createElement("div");
    hint.className = "swipe-hint";
    hint.setAttribute("aria-hidden", "true");
    // hintLeft shows on swipe right; hintRight shows on swipe left.
    const hintLeft = document.createElement("span");
    hintLeft.className = "swipe-hint-left";
    hintLeft.appendChild(icon(context === "requests" ? "promote" : "played"));
    const hintRight = document.createElement("span");
    hintRight.className = "swipe-hint-right";
    hintRight.appendChild(icon(context === "upnext" ? "demote" : "bin"));
    hint.append(hintLeft, hintRight);
    li.insertBefore(hint, body);
    wireSwipe(li, body, row, context);
  }

  return li;
}

// Played and binned are mutually exclusive: a tune can't be both "done" and
// "skipped". Both follow the mutate -> render -> persist pattern used elsewhere.
function togglePlayed(row) {
  row.played = !row.played;
  if (row.played) row.binned = false;
  rerender();
  persist();
}

function toggleBinned(row) {
  row.binned = !row.binned;
  if (row.binned) row.played = false;
  rerender();
  persist();
}

// --- Move between lists (promote/demote) -----------------------------------
function promote(uid) {
  const index = app.requests.findIndex((e) => e.uid === uid);
  if (index === -1) return;
  const [item] = app.requests.splice(index, 1);
  app.upNext.push(item);
  renderUpNext();
  renderRequests();
  persist();
}

function demote(uid) {
  const index = app.upNext.findIndex((e) => e.uid === uid);
  if (index === -1) return;
  const [item] = app.upNext.splice(index, 1);
  app.requests.push(item);
  renderUpNext();
  renderRequests();
  persist();
}

// --- Reorder Up next (up/down + drag) --------------------------------------
// Played/binned rows sit interleaved in the array but not in the visible list,
// so a one-slot move must land past the next *visible* neighbour — otherwise
// the row burrows invisibly through a hidden cluster one keypress at a time.
function moveEntry(index, delta) {
  const hidden = (e) => e.played || e.binned;
  let target = index + delta;
  while (target >= 0 && target < app.upNext.length && hidden(app.upNext[target])) {
    target += delta;
  }
  if (target < 0 || target >= app.upNext.length) return;
  const [item] = app.upNext.splice(index, 1);
  app.upNext.splice(target, 0, item);
  renderUpNext();
  persist();
}

function dragAfterElement(container, y) {
  const els = [...container.querySelectorAll(".row-card:not(.dragging)")];
  let closest = { offset: Number.NEGATIVE_INFINITY, element: null };
  for (const child of els) {
    const box = child.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;
    if (offset < 0 && offset > closest.offset) {
      closest = { offset, element: child };
    }
  }
  return closest.element;
}

// Keyboard-accessible sibling of wireDrag: with the drag handle focused, the
// up/down arrow keys nudge the row one slot, mirroring what drag does with a
// pointer. We re-look-up the row's live index each keypress (the list shifts
// as it moves) and return focus to the same row's handle after the re-render,
// so a keyboard user can move a song several slots without losing their place.
function wireKeyboardReorder(handle, row) {
  handle.addEventListener("keydown", (ev) => {
    let delta = 0;
    if (ev.key === "ArrowUp") delta = -1;
    else if (ev.key === "ArrowDown") delta = 1;
    else return;
    ev.preventDefault();
    const index = app.upNext.indexOf(row);
    if (index === -1) return;
    moveEntry(index, delta);
    const moved = upnextRows.querySelector(
      `[data-uid="${row.uid}"] .drag-handle`
    );
    if (moved) moved.focus();
  });
}

// Pointer-events drag so touch works on the mobile browsers this app targets
// (HTML5 drag-and-drop is desktop-only on touch). We reorder the DOM live and
// read the final order back into the array on drop.
function wireDrag(handle, li) {
  handle.addEventListener("pointerdown", (ev) => {
    ev.preventDefault();
    // Hold off applying remote snapshots while dragging so a peer's change
    // can't yank the row out from under the finger; sync applies it on release.
    sync.setGestureActive(true);
    li.classList.add("dragging");
    // Where within the row the finger landed, so we can keep that exact point
    // pinned under the pointer as it moves (no jump on the first move).
    const grabY = ev.clientY - li.getBoundingClientRect().top;
    // Capture keeps touch from scrolling the page; move/up listen on the
    // document so events keep flowing even as we reorder the row in the DOM.
    try {
      handle.setPointerCapture(ev.pointerId);
    } catch {
      /* capture unsupported — document listeners still work */
    }

    const onMove = (e) => {
      // Reorder the DOM as the row crosses its neighbours' midpoints. The
      // dragging row is excluded from dragAfterElement's measurements, so its
      // lifted transform never confuses the hit-testing.
      const after = dragAfterElement(upnextRows, e.clientY);
      if (after == null) upnextRows.appendChild(li);
      else if (after !== li) upnextRows.insertBefore(li, after);
      // Lift the row to follow the finger 1:1. We clear the transform to read
      // the row's true in-flow position (getBoundingClientRect includes the
      // current transform), then translate it back under the grab point. This
      // makes the drag obviously "live" from the first pixel, and the gap it
      // leaves in the list marks where it will land.
      li.style.transform = "none";
      const top = li.getBoundingClientRect().top;
      li.style.transform = `translateY(${e.clientY - grabY - top}px)`;
    };
    const onUp = () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      document.removeEventListener("pointercancel", onUp);
      li.classList.remove("dragging");
      li.style.transform = "";
      commitDomOrder();
      // Order committed + pushed; now let any deferred snapshot apply.
      sync.setGestureActive(false);
    };

    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
    document.addEventListener("pointercancel", onUp);
  });
}

function commitDomOrder() {
  const order = [...upnextRows.querySelectorAll(".row-card")].map(
    (el) => el.dataset.uid
  );
  // Played/binned rows aren't in #upnext-rows, so indexOf gives them -1 and
  // the (stable) sort parks them at the front in their existing order. That's
  // relied on: played songs belong at the top conceptually, and binned rows
  // are position-agnostic until un-binned.
  app.upNext.sort((a, b) => order.indexOf(a.uid) - order.indexOf(b.uid));
  renderUpNext();
  persist();
}

// --- Swipe to move / mark played / bin -------------------------------------
// Horizontal-swipe sibling of wireDrag (pointer events so touch works). The
// `body` (.row-body) tracks the finger; committing past a threshold fires the
// context's action (see settle). Vertical intent is handed back to the page
// (touch-action: pan-y) so the list still scrolls.
function wireSwipe(li, body, row, context) {
  const ACTIVATE = 8; // px of travel before we decide it's a swipe, not a tap
  li.addEventListener("pointerdown", (ev) => {
    // Buttons and the drag handle own their own gestures — don't hijack them.
    if (ev.target.closest("button")) return;
    if (ev.button != null && ev.button !== 0) return; // ignore right/middle click

    // Defer remote snapshots for the duration of the touch (a swipe that
    // commits, or even a plain tap) so a peer's change can't re-render the row
    // mid-gesture; sync applies any stashed snapshot when we release below.
    sync.setGestureActive(true);

    const startX = ev.clientX;
    const startY = ev.clientY;
    let engaged = false;
    let decided = false; // once we know it's a vertical scroll, we bow out

    const finish = () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      document.removeEventListener("pointercancel", onCancel);
      // Local toggle (if any) has already been applied + pushed by settle();
      // now let a deferred snapshot land.
      sync.setGestureActive(false);
    };

    const settle = (dx) => {
      const commit = 0.35 * li.clientWidth;
      // A committed action re-renders both lists, so this li is discarded — no
      // snap-back needed. Otherwise animate the body back to rest. Right in
      // Requests promotes to Up next; left in Up next demotes back; the other
      // direction in each list keeps the played/bin toggle.
      if (dx >= commit) {
        return context === "requests" ? promote(row.uid) : togglePlayed(row);
      }
      if (dx <= -commit) {
        return context === "upnext" ? demote(row.uid) : toggleBinned(row);
      }
      body.style.transition = "";
      body.style.transform = "";
      li.classList.remove("swiping", "swipe-right", "swipe-left");
      li.style.removeProperty("--swipe-progress");
    };

    const onMove = (e) => {
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (!engaged) {
        if (decided) return;
        if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > ACTIVATE) {
          // Vertical intent: let the page scroll, stop tracking this gesture.
          decided = true;
          finish();
          return;
        }
        if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > ACTIVATE) {
          engaged = true;
          li.classList.add("swiping");
          body.style.transition = "none"; // follow the finger 1:1 while dragging
          try {
            li.setPointerCapture(e.pointerId);
          } catch {
            /* capture unsupported — document listeners still work */
          }
        } else {
          return;
        }
      }
      e.preventDefault();
      body.style.transform = `translateX(${dx}px)`;
      li.classList.toggle("swipe-right", dx > 0);
      li.classList.toggle("swipe-left", dx < 0);
      const progress = Math.min(1, Math.abs(dx) / (0.35 * li.clientWidth));
      li.style.setProperty("--swipe-progress", progress.toFixed(3));
    };

    const onUp = (e) => {
      // Settle before finish() so the local toggle is committed + pushed
      // before any deferred remote snapshot is applied — the two then converge.
      if (engaged) settle(e.clientX - startX);
      finish();
    };
    const onCancel = () => {
      if (engaged) settle(0); // treat a cancelled gesture as a snap-back
      finish();
    };

    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
    document.addEventListener("pointercancel", onCancel);
  });
}

// --- Export ----------------------------------------------------------------
// (There is deliberately no "Start over" any more: every set now belongs to a
// shared session, so wiping both lists meant wiping the night for everyone in
// the room, with no undo. A fresh start is a new session — cheap, and it leaves
// the old one in the club's history.)

// Export covers both lists, running order first: Up next, then any requests
// still waiting in the pool.
function exportedRows() {
  return [...app.upNext, ...app.requests].filter(
    (row) => !row.removed && (includeCrossed.checked || !row.crossed_out)
  );
}

function exportText() {
  return exportedRows()
    .map((row) =>
      row.match
        ? `${row.match.display} (p.${row.match.page})`
        : `?? ${row.raw_title}${row.raw_page ? ` (p.${row.raw_page})` : ""}`
    )
    .join("\n");
}

// Drop the internal UI/provenance fields from the exported JSON. `played` and
// `binned` are live gig-tracking state, not part of the setlist payload.
function stripInternal({ uid, source, addedBy, removed, played, binned, ...rest }) {
  return rest;
}

copyButton.addEventListener("click", async () => {
  await copyToClipboard(exportText());
  flashButton(copyButton, "Copied!");
});

downloadButton.addEventListener("click", () => {
  const payload = {
    edition: app.edition,
    catalogue_generated_at: app.catalogueGeneratedAt,
    rows: exportedRows().map(stripInternal),
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "requests.json";
  a.click();
  URL.revokeObjectURL(a.href);
});

// --- Init ------------------------------------------------------------------
(async function init() {
  restore();
  // Resolve the view mode before the first render: renderRequests keys row
  // interactivity off it, so a sticky room device must know before painting.
  applyViewMode();
  // Hydrate search from the cached catalogue immediately; the network fetch
  // below replaces it (a Cloud Function cold start can take several seconds).
  // Keyed by the edition restore() brought back — joining a session with a
  // different book re-scopes via applyRemoteState.
  restoreCatalogueCache(app.edition?.id || editionSelect.value);
  playerName.value = app.name;
  renderRoomIdentity();
  mountManualAdd();
  renderUpNext();
  renderRequests();
  renderCarryover();
  renderWhatsNew();

  // Paint the right view before any network work so a cold open shows the
  // session list (with its own loading note) straight away. The route lives in
  // the URL, so a mid-gig reload lands back in the session it was in.
  const routeId = currentRouteId();
  setView(routeId ? "session" : "home");
  updateShareUi();

  // Routing, editions and the catalogue are independent requests — don't
  // waterfall them. Firestore is now on the critical path for every user (the
  // session list needs it), so it must not gate the catalogue the way the old
  // local-only-friendly ordering did.
  await Promise.all([
    navigateTo(routeId, { replace: true }),
    loadEditions(),
    loadCatalogue(app.edition?.id || editionSelect.value),
  ]);
})();
