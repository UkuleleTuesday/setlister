import * as sync from "./sync.js";
import * as presence from "./presence.js";
import { isValidSessionId } from "./session-id.js";
import {
  disambiguate,
  fromDateInputValue,
  listSessions,
  pageTitle,
  sessionDateLabel,
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

const editionSelect = document.getElementById("edition");
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
const shareCountBadge = document.getElementById("share-count-badge");
const sharePresence = document.getElementById("share-presence");
const sharePresenceCount = document.getElementById("share-presence-count");
const sharePresenceList = document.getElementById("share-presence-list");
const playerName = document.getElementById("player-name");
const roomNameInput = document.getElementById("room-name");
const roomNameCta = document.getElementById("room-name-cta");
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
const sessionListEl = document.getElementById("session-list");
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
const sheetVisibility = document.getElementById("new-session-visibility");
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
roomNameCta.replaceChildren(...iconLabel("edit", "Add your name"));
// Icon-only (their names live in aria-label/title): they share the "Up next"
// heading row, where a text label would crowd the heading at 320px.
copyButton.replaceChildren(icon("copy"));
downloadButton.replaceChildren(icon("download"));

const STORAGE_KEY = "setlister.v1";
// The catalogue is cached separately from the lists: it's ~20KB of derived
// data that lets manual search work instantly on revisit (and ride out a slow
// Cloud Function cold start) while a fresh copy loads in the background.
const CATALOGUE_CACHE_KEY = "setlister.catalogue.v1";
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
// generated default name shows up for everyone immediately. Two inputs feed
// the one app.name: the settings field, and the inline room-mode field (the
// gear icon is hidden there) — each mirrors into the other so switching views
// never shows a stale name.
function setPlayerName(value) {
  app.name = value;
  playerName.value = value;
  roomNameInput.value = value;
  persist();
  presence.refreshPresence();
}
playerName.addEventListener("input", () => setPlayerName(playerName.value));
roomNameInput.addEventListener("input", () => setPlayerName(roomNameInput.value));

// The room-mode name is fire-and-forget: one slot, three states. No name yet
// shows a button (not a bare field — see the index.html comment), tapping it
// swaps in the focused input, and a committed name collapses to a one-line
// "Requesting as X · change". Settling is driven by blur/Enter, never the
// input event — app.name updates per keystroke, and collapsing mid-word would
// yank the field out from under a typing thumb. Blurring with nothing typed
// falls back to the button. `editing` forces the input open (the CTA, the
// change button, or a nameless add attempt).
function renderRoomIdentity({ editing = false } = {}) {
  const name = app.name.trim();
  const state = editing ? "input" : name ? "identity" : "cta";
  roomNameCta.hidden = state !== "cta";
  roomNameInput.hidden = state !== "input";
  roomIdentity.hidden = state !== "identity";
  if (name) roomIdentityText.textContent = `Requesting as ${name}`;
}
// When the editor was opened by a tap (the CTA, or a pick hitting the name
// gate), the browser's synthesized mouse events from that same tap can land
// on the page ~150ms later and steal focus from the input we just opened —
// on a phone the keyboard pops and instantly vanishes. Same race the
// combobox's 120ms blur-close delay guards against: for a short grace window
// after opening, a blur re-claims focus instead of settling the slot.
let roomNameEditStarted = 0;
function editRoomName() {
  roomNameEditStarted = Date.now();
  renderRoomIdentity({ editing: true });
  roomNameInput.focus();
}

// A song picked before any name was set: held — visibly, the pinned note in
// #add-feedback names it — until the name arrives, then submitted. Replaced
// by a newer nameless pick, cleared on submit. Without this the name gate
// would discard the first thing a first-time user did and make them redo the
// search one-handed in a pub.
let pendingRoomEntry = null;

// Committing a name (blur/Enter) settles the slot — and if a pick was waiting
// on the gate, submits it now, so search → pick → type your name is one
// continuous gesture with nothing to redo.
function commitRoomName() {
  renderRoomIdentity();
  if (viewMode !== "room" || !app.name.trim() || !pendingRoomEntry) return;
  const entry = pendingRoomEntry;
  pendingRoomEntry = null;
  // addManualEntry re-runs the duplicate guard and flashes its own note if it
  // refuses; on success, say so — the user is looking at the name slot, not
  // at the pool where the row just landed.
  if (addManualEntry(entry)) flashNote(addFeedback, `Added “${entry.title}”`);
}
roomNameInput.addEventListener("blur", () => {
  if (Date.now() - roomNameEditStarted < 400) {
    roomNameInput.focus(); // the opening tap's own tail — not a real dismissal
    return;
  }
  commitRoomName();
});
roomNameInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") roomNameInput.blur(); // blur handler settles it
});
roomNameCta.addEventListener("click", editRoomName);
roomIdentityChange.addEventListener("click", editRoomName);

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
  if (sync.getSessionId()) {
    sync.notifyLocalChange({
      upNext: app.upNext,
      requests: app.requests,
      edition: app.edition,
    });
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
// catalogue, then let the network fetch replace it.
function restoreCatalogueCache() {
  try {
    const saved = JSON.parse(localStorage.getItem(CATALOGUE_CACHE_KEY) || "null");
    if (!saved || !Array.isArray(saved.catalogue) || !saved.catalogue.length) return;
    app.catalogue = saved.catalogue;
    if (!app.edition) app.edition = saved.edition;
    app.catalogueGeneratedAt = saved.generatedAt || "";
    catalogueStatus = "ready";
  } catch {
    /* corrupt cache — the network load will repopulate it */
  }
}

function saveCatalogueCache() {
  try {
    localStorage.setItem(
      CATALOGUE_CACHE_KEY,
      JSON.stringify({
        edition: app.edition,
        catalogue: app.catalogue,
        generatedAt: app.catalogueGeneratedAt,
      })
    );
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
  return { upNext: app.upNext, requests: app.requests, edition: app.edition };
}

// Called by sync when a remote change arrives: swap in the fresh lists and
// re-render. persist() writes them back to localStorage (and is a no-op push
// since sync just set lastRemote to this same state).
function applyRemoteState(state) {
  app.upNext = state.upNext;
  app.requests = state.requests;
  if (state.edition) app.edition = state.edition;
  renderUpNext();
  renderRequests();
  persist();
}

// The full app URL carrying `?session=<id>` — this is what gets shared.
// buildSessionUrl strips any `mode` param, so sharing from a room-mode device
// never propagates room mode by accident.
function sessionUrl(id) {
  return buildSessionUrl(location.href, id);
}

// The requests-only variant (#86): same session, `?mode=request` set.
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

// Which view of a session this device gets: the full app or the requests-only
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
  // Entering room mode decides which of the name input / identity line shows.
  if (room) renderRoomIdentity();
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
        ? "That session wasn’t found — it may have been deleted."
        : `Couldn’t open that session — ${err.message}`
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
    label = `Sharing session ${id} — ${connectedCount} people here, tap for options`;
  else label = `Sharing session ${id} — tap for options`;
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
  updateDocumentTitle();
}
sync.onMetaChange(renderSessionMeta);

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

// The requests-only link (#86): what goes to the room's WhatsApp group.
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
    showSessionError(`Couldn’t change the session’s visibility — ${err.message}`);
  } finally {
    shareVisibility.disabled = false;
  }
}

shareToggle.addEventListener("click", onShareTap);
shareLinkButton.addEventListener("click", shareSessionLink);
shareRoomLinkButton.addEventListener("click", shareRoomLink);
shareVisibility.addEventListener("change", onVisibilityChange);

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

// Keep the UI in sync when the engine changes state on its own — most
// importantly when the remote doc goes away underneath us. Presence is bound to
// the same lifecycle: start heartbeating on connect, stop (and retract our doc)
// on leave.
sync.onStatusChange((status) => {
  if (status.status === "connected") {
    presence.startPresence(status.id, () => app.name);
  } else if (status.status === "expired") {
    presence.stopPresence();
    showHomeError("That session is no longer there — it looks like it was deleted.");
    navigateTo(null, { replace: true });
  } else if (status.status === "left") {
    presence.stopPresence();
  }
  updateShareUi();
});

// Best-effort: retract our presence when the tab closes so peers see us go
// promptly. pagehide fires more reliably than beforeunload on mobile; if it's
// missed, the staleness window + TTL retire the doc anyway.
window.addEventListener("pagehide", presence.removeOnUnload);

// --- Home view: the club's session history ---------------------------------
function renderSessionList(entries) {
  sessionListEl.replaceChildren(
    ...disambiguate(entries).map((entry) => {
      const li = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.className = "session-item";
      button.dataset.id = entry.id;

      // `label` is the session's date rendered in this viewer's locale — see
      // disambiguate()/sessionDateLabel().
      const name = document.createElement("span");
      name.className = "session-item-name";
      name.textContent = entry.label;

      const meta = document.createElement("span");
      meta.className = "session-item-meta";
      meta.textContent = entry.createdBy ? `Started by ${entry.createdBy}` : "Started by someone";

      button.append(name, meta);
      li.appendChild(button);
      return li;
    })
  );
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
      : "No sessions yet — start one above.";
  } catch {
    sessionListEl.replaceChildren();
    sessionListStatus.hidden = false;
    sessionListStatus.textContent = "Couldn’t load sessions.";
    sessionListRetry.hidden = false;
  }
}

sessionListEl.addEventListener("click", (event) => {
  const button = event.target.closest(".session-item");
  if (button) navigateTo(button.dataset.id, { cameFromHome: true });
});
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
  sheetVisibility.value = "shared";
  sheet.hidden = false;
  homeError.hidden = true;
  // Don't autofocus: opening a date picker nobody needs to touch would put the
  // extra tap back. Today is usually the answer — tap Start and go.
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
    // Creating loads the Firestore chunk lazily, so the first tap can take a
    // beat — hence the spinner above.
    const id = await sync.createSession(
      () => (seed ? sessionState() : { upNext: [], requests: [], edition: app.edition }),
      applyRemoteState,
      { createdBy: presence.displayName(app.name), listed, createdAt }
    );
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
    sheetError.textContent = `Couldn’t start a session — ${err.message}`;
    sheetError.hidden = false;
    sheetStart.disabled = false;
    sheetStart.replaceChildren(document.createTextNode("Start"));
  }
}

newSessionButton.addEventListener("click", () => openSheet());
sheetStart.addEventListener("click", onSheetStart);
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
    onSheetStart();
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

async function loadEditions() {
  try {
    const res = await fetch(`${API_BASE}/api/editions`);
    const data = await res.json();
    editionSelect.replaceChildren(
      ...data.editions.map((e) => {
        const option = document.createElement("option");
        option.value = e.id;
        option.textContent = editionLabel(e);
        option.selected = e.id === (app.edition?.id || "current");
        return option;
      })
    );
  } catch {
    /* keep the hardcoded "current" option */
  }
}

// Load the catalogue for an edition independently of any photo, so manual add
// works before (or without) a scan. Never wipes the setlist.
async function loadCatalogue(edition) {
  try {
    const res = await fetch(
      `${API_BASE}/api/catalogue?edition=${encodeURIComponent(edition)}`
    );
    if (!res.ok) {
      if (!app.catalogue.length) catalogueStatus = "error";
      refreshPickers();
      return;
    }
    const data = await res.json();
    app.edition = data.edition;
    app.catalogue = data.catalogue;
    app.catalogueGeneratedAt = data.catalogue_generated_at;
    catalogueStatus = "ready";
    saveCatalogueCache();
    renderUpNext();
    renderRequests();
    refreshPickers();
  } catch {
    /* leave any previously loaded catalogue in place */
    if (!app.catalogue.length) catalogueStatus = "error";
    refreshPickers();
  }
}

editionSelect.addEventListener("change", () => loadCatalogue(editionSelect.value));

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
    onPick(entry);
  }

  // Explain an empty result list instead of showing nothing: no catalogue yet,
  // catalogue unreachable, or a genuine no-match.
  function emptyStateMessage() {
    if (catalogueStatus === "loading") return "Loading the songbook…";
    if (catalogueStatus === "error") return "Couldn't load the songbook — check your connection";
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
// request instead of correcting an existing one.
function mountManualAdd() {
  manualAddHost.replaceChildren(
    makeCombobox({ placeholder: "Add a tune by name…", onPick: addManualEntry })
  );
}

// Returns whether a row was actually added, so commitRoomName can tell a
// completed pending pick from a refusal.
function addManualEntry(entry) {
  // Room-mode requests must carry a real name — the pool has no organiser
  // curating the input there, so provenance is the only visibility into who's
  // using it. Deliberately not enforced anywhere else: the full app keeps its
  // anon-name fallback. The pick is NOT discarded: it waits, visibly, for the
  // name (see pendingRoomEntry / commitRoomName), and the note is pinned
  // because it's a standing promise, not transient feedback.
  if (viewMode === "room" && !app.name.trim()) {
    pendingRoomEntry = entry;
    flashNote(
      addFeedback,
      `Who's asking for “${entry.title}”? Add your name and it'll go in.`,
      { pinned: true }
    );
    editRoomName();
    return false;
  }
  // Same song already on the night's lists (#52)? Say where it is instead of
  // quietly doubling it. Binned copies don't block — see dupes.js.
  const existing = findDuplicate(app.upNext, app.requests, matchKey(entry));
  if (existing) {
    flashNote(addFeedback, duplicateLabel(existing.where));
    return false;
  }
  app.requests.push({
    uid: newUid(),
    source: viewMode === "room" ? "room" : "manual",
    addedBy: presence.displayName(app.name),
    raw_title: entry.display,
    raw_page: entry.page,
    notes: null,
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
    form.append("edition", editionSelect.value);
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
      else if (skipped) message = "Nothing new — everything on the board is already listed.";
      else message = "Couldn't read any songs off that photo — try a closer, straighter shot.";
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
          "That scan took too long — check your signal and try snapping it again.";
        errorBox.hidden = false;
      } else {
        showScanResult("Scan cancelled — nothing was added.");
      }
    } else {
      // A fetch that never reached the server rejects with a TypeError and an
      // unhelpful message ("Failed to fetch") — translate it for humans. Server
      // errors carry a user-facing `detail` and pass through.
      errorBox.textContent =
        err instanceof TypeError
          ? "Couldn't reach the server — check your signal and try again."
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
function flashNote(el, message, { pinned = false } = {}) {
  el.textContent = message;
  el.hidden = false;
  clearTimeout(flashTimers.get(el));
  // A pinned note is a standing promise (e.g. a pick waiting on the room-mode
  // name gate), not transient feedback: it stays until the next note — from
  // the completed add, a replacement pick, or a refusal — takes its place.
  if (pinned) return;
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
      `Requests${dupesNote} — these need a look first.`;
  } else if (dupes) {
    reviewNote.textContent = `${dupes} from the board ${dupes === 1 ? "was" : "were"} already listed — these need a look first.`;
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
      `Matched against “${app.edition.title}” ` +
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
  renderCount(upnextCount, visible.length);
  // Map over the full list (skipping lifted-out rows) so the index handed to
  // renderRow still points at app.upNext — the reorder controls rely on it.
  upnextRows.replaceChildren(
    ...app.upNext
      .map((e, i) => (e.binned || e.played ? null : renderRow(e, i, "upnext")))
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
  // control that rescues a stray swipe-right.
  renderGroup(playedGroup, {
    iconName: "played",
    noun: "played",
    rows: app.upNext.filter((e) => e.played),
    open: app.playedOpen,
    onToggle: () => {
      app.playedOpen = !app.playedOpen;
      renderUpNext();
    },
    context: "played",
  });
}

function renderRequests() {
  updateSessionMode();
  updateExportButtons();
  const visible = app.requests.filter((e) => !e.binned);
  requestsEmpty.hidden = visible.length > 0;
  // The empty note mentions snapping the board, but room mode has no camera —
  // there, adding by name is the only door.
  requestsEmpty.textContent =
    viewMode === "room"
      ? "No requests yet — add one above."
      : "No requests yet — snap the board or add one above.";
  renderCount(requestsCount, visible.length);
  // Room mode gets read-only rows: the "room" context matches none of
  // renderRow's control branches, so no promote/bin buttons and no swipe.
  requestsRows.replaceChildren(
    ...app.requests
      .map((e, i) =>
        e.binned ? null : renderRow(e, i, viewMode === "room" ? "room" : "requests")
      )
      .filter(Boolean)
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
    warn.title = `${reason} — tap to see the photo`;
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
    handle.setAttribute("aria-label", "Reorder — drag, or press up/down arrow keys");
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
  restoreCatalogueCache();
  playerName.value = app.name;
  roomNameInput.value = app.name;
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
