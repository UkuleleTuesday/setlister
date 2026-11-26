import * as sync from "./sync.js";
import * as presence from "./presence.js";
import { isValidSessionId } from "./session-id.js";
import { pageTitle, sessionDateLabel, sessionTimeLabel } from "./session-index.js";
import { icon, iconLabel } from "./icons.js";
import { duplicateLabel, findDuplicate, matchKey } from "./dupes.js";
import { downscaleImage, resolveMaxEdge } from "./downscale.js";
import { mount } from "svelte";
import BinGroup from "./BinGroup.svelte";
import Home from "./Home.svelte";
import RequestsSection from "./RequestsSection.svelte";
import UpNextSection from "./UpNextSection.svelte";
import PhotoLightbox from "./PhotoLightbox.svelte";
import ScanFlow from "./ScanFlow.svelte";
import { planScan, requestParse } from "./scan.js";
import RoomRequestSheet from "./RoomRequestSheet.svelte";
import SongbookSheet from "./SongbookSheet.svelte";
import SettingsPanel from "./SettingsPanel.svelte";
import SharePanel from "./SharePanel.svelte";
import { editionLabel } from "./editions.js";
import NewSessionSheet from "./NewSessionSheet.svelte";
import WhatsNewSheet from "./WhatsNewSheet.svelte";
import { latestEntry, sortedEntries } from "./whats-new.js";
import { buildSessionUrl, readStoredMode, resolveMode, writeStoredMode } from "./view-mode.js";
import {
  NAME_RESET_MESSAGE,
  readNameResetDone,
  resolveNameReset,
  writeNameResetDone,
} from "./name-reset.js";
import {
  cooldownLabel,
  cooldownRemaining,
  readLastRoomAdd,
  writeLastRoomAdd,
} from "./room-limits.js";
import { ASKER, hasVoted, seedAsker, toggleVote } from "./votes.js";
import { setBinned, setPlayed } from "./gig-state.js";
import {
  effectiveRequestsOpen,
  minutesUntilOpen,
  openingSoonLabel,
  resolveWindow,
  windowStatus,
} from "./request-window.js";
import {
  CATALOGUES_CACHE_KEY,
  LEGACY_CATALOGUE_CACHE_KEY,
  catalogueNeedsRefresh,
  getCachedCatalogue,
  migrateLegacyCatalogue,
  putCachedCatalogue,
} from "./catalogue-cache.js";

const editionNote = document.getElementById("edition-note");
const settingsToggle = document.getElementById("settings-toggle");
const shareToggle = document.getElementById("share-toggle");
const shareCountBadge = document.getElementById("share-count-badge");
const roomIdentity = document.getElementById("room-identity");
const roomAddHost = document.getElementById("room-add");
const roomWindow = document.getElementById("room-window");
const windowChip = document.getElementById("window-chip");
const roomIdentityText = document.getElementById("room-identity-text");
const roomIdentityChange = document.getElementById("room-identity-change");
const homeSection = document.getElementById("home");
const sessionView = document.getElementById("session-view");
const backHomeButton = document.getElementById("back-home");
// The header h1 doubles as the screen title: the brand on home, the night's
// date in a session (see setView / renderSessionMeta).
const headerTitle = document.querySelector("header h1");
const BRAND_TITLE = headerTitle.textContent;
const whatsNewBanner = document.getElementById("whats-new-banner");
const whatsNewFooter = document.getElementById("whats-new-footer");
const whatsNewOpen = document.getElementById("whats-new-open");
// Svelte screens (#158) mount next to the legacy markup they replace; mount()
// hands back the component's exports (here open()), which is how this file
// drives them until the rest of it is ported too.
const whatsNewMount = document.getElementById("whats-new-mount");
const whatsNewSheet = mount(WhatsNewSheet, {
  target: whatsNewMount.parentNode,
  anchor: whatsNewMount,
});
// Before Home: Home's first render reports the planned night straight into
// the sheet's gate.
const newSessionMount = document.getElementById("new-session-mount");
const newSessionSheet = mount(NewSessionSheet, {
  target: newSessionMount.parentNode,
  anchor: newSessionMount,
  props: { onStart: createNewSession },
});
// The history sits between the What's new banner and footer, which stay here.
const home = mount(Home, {
  target: homeSection,
  anchor: document.getElementById("whats-new-footer"),
  props: {
    onPick: (id) => navigateTo(id, { cameFromHome: true }),
    onNewSession: () => {
      home.clearError();
      newSessionSheet.open();
    },
    onPlanned: (entry) => newSessionSheet.setPlanned(entry),
  },
});
// The header popovers, in their places in the header. Their writes go through
// the change*/share* functions below; session metadata only ever travels by
// sync's own metadata writes, never the debounced row push.
const sharePanelMount = document.getElementById("share-panel-mount");
const sharePanel = mount(SharePanel, {
  target: sharePanelMount.parentNode,
  anchor: sharePanelMount,
  props: {
    onVisibility: changeVisibility,
    onRequestsMode: changeRequestsMode,
    onWindow: changeRequestsWindow,
    onShareLink: shareSessionLink,
    onShareRoomLink: shareRoomLink,
    onOpenChange: (open) => shareToggle.setAttribute("aria-expanded", String(open)),
    // Taps on these open the panel, so they mustn't count as "outside".
    openers: () => [shareToggle, windowChip],
  },
});
const settingsPanelMount = document.getElementById("settings-panel-mount");
const settingsPanel = mount(SettingsPanel, {
  target: settingsPanelMount.parentNode,
  anchor: settingsPanelMount,
  props: {
    onName: (name) => setPlayerName(name),
    // Settings survive a reload like the lists do: losing a toggle you set
    // last Tuesday reads as a bug at the club.
    onChange: (key) => {
      if (key === "showSuggestions") rerender();
      persist();
    },
    // Switching the book mid-session: cache-first swap like any other
    // re-scope, and an immediate persist() so a cached switch reaches the
    // session peers even if the background refresh never lands (pub wifi).
    onEdition: (editionId) => {
      scopeCatalogueToEdition(editionId);
      persist();
    },
    onOpenChange: (open) => settingsToggle.setAttribute("aria-expanded", String(open)),
  },
});
// The add-by-name pair, with the other sheets. What a pick or a confirm DOES
// to the night stays here (onSongbookPick / onRequestSheetConfirm).
const requestSheetMount = document.getElementById("room-request-mount");
const requestSheet = mount(RoomRequestSheet, {
  target: requestSheetMount.parentNode,
  anchor: requestSheetMount,
  props: { onConfirm: onRequestSheetConfirm },
});
const songbookMount = document.getElementById("songbook-mount");
const songbookSheet = mount(SongbookSheet, {
  target: songbookMount.parentNode,
  anchor: songbookMount,
  props: { onPick: onSongbookPick },
});
// The scan flow (#add + #review) where the sections were, and the photo
// viewer with the other overlays. What a scan does to the night is runScan()
// and onReviewConfirm() below.
const scanFlowMount = document.getElementById("scan-flow-mount");
const scanFlow = mount(ScanFlow, {
  target: scanFlowMount.parentNode,
  anchor: scanFlowMount,
  props: {
    scan: runScan,
    onConfirm: onReviewConfirm,
    onShowPhoto: (imageUrl) => photoLightbox.open(imageUrl),
    onReviewChange,
  },
});
const photoLightboxMount = document.getElementById("photo-lightbox-mount");
const photoLightbox = mount(PhotoLightbox, {
  target: photoLightboxMount.parentNode,
  anchor: photoLightboxMount,
});
// The two lists and the bin. Every row change comes back here, by uid, and
// follows the mutate -> render -> persist pattern below.
const rowActions = {
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
const upNextMount = document.getElementById("upnext-mount");
const upNextSection = mount(UpNextSection, {
  target: upNextMount.parentNode,
  anchor: upNextMount,
  props: {
    actions: rowActions,
    onReorder: commitOrder,
    onCopy: copySetlist,
    onDownload: downloadSetlist,
  },
});
const requestsMount = document.getElementById("requests-mount");
const requestsSection = mount(RequestsSection, {
  target: requestsMount.parentNode,
  anchor: requestsMount,
  props: {
    actions: rowActions,
    onAddTune: () => openSongbook(),
    onSnap: () => scanFlow.pickPhoto(),
  },
});
const binGroupMount = document.getElementById("bin-group-mount");
const binGroup = mount(BinGroup, {
  target: binGroupMount.parentNode,
  anchor: binGroupMount,
  props: { actions: rowActions },
});
const nameResetSheet = document.getElementById("name-reset-sheet");
const nameResetMessage = document.getElementById("name-reset-message");
const nameResetName = document.getElementById("name-reset-name");
const nameResetSave = document.getElementById("name-reset-save");
const nameResetLater = document.getElementById("name-reset-later");

// Swap the static buttons' emoji placeholders for the SVG icon set as soon as
// the module runs (index.html ships text-only fallbacks).
settingsToggle.replaceChildren(icon("settings"));
shareToggle.replaceChildren(icon("share"));
backHomeButton.replaceChildren(...iconLabel("back", "All sessions"));
// Icon-only (their names live in aria-label/title): they share the "Up next"
// heading row, where a text label would crowd the heading at 320px.

const STORAGE_KEY = "setlister.v1";
// The catalogues are cached separately from the lists: ~20KB of derived data
// per edition that lets manual search work instantly on revisit (and ride out
// a slow Cloud Function cold start) while a fresh copy loads in the
// background. Keyed by edition id — see catalogue-cache.ts.
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
  // rather than stored on it — see the header in votes.ts for why that is a
  // correctness requirement and not a preference.
  votes: {},
  // Whether the collapsed played/bin groups are expanded. Pure UI state: not
  // persisted (a reload starts collapsed) and not synced (each peer keeps
  // their own view).
};

// Remember the name across sessions so provenance survives a reload. In a
// shared session, also push it to the presence roster so overriding your
// generated default name shows up for everyone immediately. Two surfaces set
// it: the settings field, and room mode's name sheet (the gear is hidden
// there) — both funnel through here so neither can leave a stale value.
function setPlayerName(value) {
  app.name = value;
  settingsPanel.setName(value);
  persist();
  presence.refreshPresence();
}

// Room mode's name, once set, is fire-and-forget: this one quiet line is all
// that remains of it (the sheet below is where it's actually entered).
function renderRoomIdentity() {
  const name = app.name.trim();
  roomIdentity.hidden = !name;
  if (name) roomIdentityText.textContent = `As ${name}`;
}

// RoomRequestSheet.svelte confirms a pick (and asks the name on the first
// one); `null` opens it as a plain rename, from "change".
function openRequestSheet(entry) {
  requestSheet.open(entry, app.name);
}

function closeRequestSheet() {
  requestSheet.close();
}

// Confirming: the name is committed here, not per keystroke, so an abandoned
// sheet leaves app.name untouched. The request then goes in as part of the
// same tap — it can't be lost between the two.
function onRequestSheetConfirm({ entry, name, comment }) {
  if (name !== null) setPlayerName(name);
  renderRoomIdentity();
  // The door can shut (or the window can lapse) while this sheet is open.
  // applyRequestsOpen() dismisses it when that happens, but a tap racing the
  // change gets here.
  if (entry && viewMode === "room" && !requestsState().open) {
    requestsSection.flash("Requests just closed. Try the whiteboard of wishes!");
    return;
  }
  // addManualEntry re-runs the duplicate guard (the pool may have moved while
  // the sheet was open) and flashes its own note if it refuses. On success say
  // so — the sheet just covered the pool where the row landed — and set the
  // expectation for the cool-down before it bites.
  if (entry && addManualEntry(entry, comment)) {
    requestsSection.flash(
      viewMode === "room"
        ? `Added “${entry.title}”. Next one in a minute.`
        : `Added “${entry.title}”.`,
    );
  }
}

roomIdentityChange.addEventListener("click", () => openRequestSheet(null));

// Settings live in a panel behind the gear icon (SettingsPanel.svelte, which
// closes itself on an outside tap or Escape, like a normal popover). The
// gear's tap stops propagation so it toggles rather than counting as outside.
function setSettingsOpen(open) {
  settingsPanel.setOpen(open);
}
settingsToggle.addEventListener("click", (event) => {
  event.stopPropagation();
  setSharePanelOpen(false); // never leave both header popovers open at once
  setSettingsOpen(!settingsPanel.isPanelOpen());
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
        settings: settingsPanel.settings(),
      }),
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
    settingsPanel.apply(saved.settings);
  } catch {
    /* corrupt payload — start fresh */
  }
}

// --- Catalogue cache ---------------------------------------------------------
// Search should work the moment the app opens: hydrate from the last-seen
// catalogue for the edition in play, then let the network fetch replace it.
// The map logic lives in catalogue-cache.ts; only the localStorage I/O is here.
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
      Date.now(),
    );
    localStorage.setItem(CATALOGUES_CACHE_KEY, JSON.stringify(store));
  } catch {
    /* storage full or blocked — cache is best-effort */
  }
}

// --- Session sharing wiring ------------------------------------------------
// The durable state sync lives in sync.ts; app.js only feeds it state and
// applies remote updates.

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
  } else {
    // Same book, but this tab may have been open since before the weekly
    // regen: joining or starting tonight's session is exactly when stale
    // pages would start landing in the shared list.
    refreshCatalogueIfStale();
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
  scanFlow.showError(message);
}

function showHomeError(message) {
  home.showError(message);
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
// The room's "opening soon" line; kept between ticks like the note it was.
let openingSoonText = "";
function applyRequestsOpen() {
  const meta = sync.getMeta();
  const { open, soonMinutes, window: reqWindow } = requestsState();
  sessionView.classList.toggle("requests-closed", !open && soonMinutes == null);
  sessionView.classList.toggle("requests-opening-soon", soonMinutes != null);
  if (soonMinutes != null) {
    openingSoonText = `Requests open in ${openingSoonLabel(soonMinutes)}. Pop your tune on the whiteboard of wishes for now.`;
    refreshLists();
  }
  sharePanel.setRequestNote(requestNoteText(meta, open, reqWindow));
  renderWindowPills(meta, reqWindow);
  // A phone left holding the confirm sheet when the organiser closed up would
  // otherwise still land its request on the next tap. Dismissing is the same
  // "no" as tapping the backdrop.
  if (!open && viewMode === "room" && requestSheet.isSheetOpen()) closeRequestSheet();
  // Same for the songbook: with the door shut it would only offer taps that
  // can't land.
  if (!open && viewMode === "room" && songbookSheet.isSheetOpen()) closeSongbook();
}

// The link's state, worded once for both views: the request view's rules line
// says what the room can do (it only shows while requests are open), the full
// app's chip names the link the organiser controls.
function renderWindowPills(meta, reqWindow) {
  const { state, at } = windowStatus({
    mode: meta.requestsOpen,
    window: reqWindow,
    now: new Date(),
  });
  const time = at ? sessionTimeLabel(at) : "";
  roomWindow.textContent =
    state === "open" && time ? `Requests open until ${time}` : "Requests open";
  windowChip.textContent = {
    open: time ? `Request link open until ${time}` : "Request link open",
    later: `Request link opens at ${time}`,
    closed: "Request link is view only",
  }[state];
  windowChip.dataset.state = state;
}

windowChip.addEventListener("click", () => {
  sharePanel.revealRequests();
});

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
  settingsPanel.setEditionVisible(!home);
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
    sync.leaveSession(); // also clears the session's createdAt
    app.upNext = [];
    app.requests = [];
    closeReview();
    persist();
    renderUpNext();
    renderRequests();
    setView("home");
    updateShareUi();
    home.refresh();
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
        : `Couldn’t open that session: ${err.message}`,
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
  sharePanel.setOpen(open);
}

// Re-render the share panel from sync's current state.
function refreshSharePanel() {
  sharePanel.update({
    id: sync.getSessionId(),
    label: currentSessionLabel(),
    meta: sync.getMeta(),
    createdAt: sync.getCreatedAt(),
  });
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
  refreshSharePanel();
  if (!id) setSharePanelOpen(false); // no session → nothing to show
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
function renderSessionMeta() {
  if (!sessionView.hidden) headerTitle.textContent = currentSessionLabel();
  refreshSharePanel();
  applyRequestsOpen();
  // The room's empty note changes with the switch, and a room device may be
  // sitting on this session right now.
  renderRequests();
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

  sharePanel.setRoster(id ? roster : []);
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

// Offer a link: the native share sheet on mobile (the primary target), else
// copy to clipboard. Returns whether it was copied, so the button that was
// tapped can flash a confirmation (SharePanel.svelte does).
async function offerLink(url, title) {
  if (navigator.share) {
    try {
      await navigator.share({ title, url });
    } catch {
      /* user dismissed the share sheet, or it rejected the payload — no-op */
    }
    return false;
  }
  await copyToClipboard(url);
  return true;
}

// The full-app link. Carries the night's date label in the share payload, so
// the recipient sees which session this is, not a generic app title.
async function shareSessionLink() {
  const id = sync.getSessionId();
  if (!id) return false;
  const label = currentSessionLabel();
  return offerLink(
    sessionUrl(id),
    label ? `${label} · Ukulele Tuesday` : "Ukulele Tuesday setlist",
  );
}

// The room-view link (#86): what goes to the room's WhatsApp group.
async function shareRoomLink() {
  const id = sync.getSessionId();
  if (!id) return false;
  const label = currentSessionLabel();
  return offerLink(
    roomSessionUrl(id),
    label ? `Requests for ${label} · Ukulele Tuesday` : "Ukulele Tuesday requests",
  );
}

// Tap Share: the popover is now purely in-session (every set of lists already
// belongs to a session), so this just opens it.
function onShareTap(event) {
  event.stopPropagation();
  setSettingsOpen(false);
  setSharePanelOpen(!sharePanel.isPanelOpen());
}

// Shared / Unlisted. Unlisted removes the row from the club's list only — the
// link keeps working, which the note under the dropdown says out loud. The
// panel shows the pick at once and reverts it if this rejects.
async function changeVisibility(listed) {
  scanFlow.clearError();
  try {
    await sync.setSessionListed(listed);
  } catch (err) {
    showSessionError(`Couldn’t change the session’s visibility: ${err.message}`);
    throw err;
  }
}

// Auto / Taking requests / View only (#86, #NEW). Dropping to view-only takes
// the add field off every room phone on the session (live, through
// onMetaChange) and points them at the whiteboard; forcing it open does the
// opposite regardless of the schedule; auto hands control back to the window.
// Same optimistic-then-revert shape as visibility, since all three are one
// tap that has to survive a flaky pub wifi.
async function changeRequestsMode(mode) {
  scanFlow.clearError();
  try {
    await sync.setRequestsMode(mode);
  } catch (err) {
    showSessionError(`Couldn’t change the request link: ${err.message}`);
    throw err;
  }
  refreshSharePanel();
  applyRequestsOpen();
  renderRequests();
}

// The two override time fields (#NEW). The panel always sends both sides'
// current values, so one save can't silently clear the other.
async function changeRequestsWindow({ opensAt, closesAt }) {
  scanFlow.clearError();
  try {
    await sync.setRequestsWindow({ opensAt, closesAt });
  } catch (err) {
    refreshSharePanel(); // revert the input to what's actually stored
    showSessionError(`Couldn’t change the request window: ${err.message}`);
    throw err;
  }
  refreshSharePanel();
  applyRequestsOpen();
}

shareToggle.addEventListener("click", onShareTap);

// The request window's open/opening-soon/closed state (#NEW) can flip with no
// Firestore snapshot arriving at all — an unattended auto session crossing
// its own open or close instant. A 1-minute tick is enough resolution for a
// whole-minutes message and does no network I/O, just re-runs
// applyRequestsOpen() against a fresh clock. Same setInterval/clearInterval-
// in-a-stop-function shape as presence.ts's heartbeat, started/stopped at the
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
// Home.svelte, mounted above. It loads and lays out the history itself
// (session-index.ts); this file only routes its taps.

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

// The sheet itself is WhatsNewSheet.svelte; this keeps the doors (banner and
// footer link) and the "seen" bookkeeping, which belong to the home screen.
function openWhatsNewSheet(entries) {
  whatsNewSheet.open(entries);
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

// --- One-time name reset ----------------------------------------------------
// The names saved in the full app drifted into jokes, so this build runs a
// name amnesty: once per device, the typed name is cleared and this sheet
// asks for a real one. The decision logic and copy live in name-reset.ts —
// including why room devices are exempt and why a first-ever visitor never
// sees it. Runs at boot, before presence can broadcast the old name anywhere.
function maybeResetName() {
  let hasSavedState = false;
  try {
    hasSavedState = localStorage.getItem(STORAGE_KEY) !== null;
  } catch {
    /* storage blocked — nothing saved means nothing to reset */
  }
  const plan = resolveNameReset({
    mode: viewMode,
    done: readNameResetDone(),
    hasSavedState,
  });
  if (plan.clearName && app.name) setPlayerName("");
  if (plan.markDone) writeNameResetDone();
  if (plan.showSheet) {
    nameResetMessage.textContent = NAME_RESET_MESSAGE;
    nameResetName.value = "";
    nameResetSheet.hidden = false;
  }
}

// Every way out is a "later", not a refusal to comply: the flag is already
// set, so the sheet never returns, and the settings gear still holds the name
// field. Save with an empty field is just a dismiss — no error to read in a
// dark pub. Not focused on open: the sheet appears at boot, unprompted, and a
// keyboard shooting up over it would bury the message it exists to deliver.
function closeNameResetSheet() {
  nameResetSheet.hidden = true;
}
nameResetSave.addEventListener("click", () => {
  const name = nameResetName.value.trim();
  if (name) setPlayerName(name);
  closeNameResetSheet();
});
nameResetName.addEventListener("keydown", (event) => {
  if (event.key === "Enter") nameResetSave.click();
});
nameResetLater.addEventListener("click", closeNameResetSheet);
nameResetSheet.addEventListener("click", (event) => {
  if (event.target === nameResetSheet) closeNameResetSheet();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !nameResetSheet.hidden) closeNameResetSheet();
});

// --- New session sheet ------------------------------------------------------
// NewSessionSheet.svelte owns the fields, the planned-night gate and Start's
// states; creating the session is app state, so it happens here.
async function createNewSession({ createdAt, listed, editionId }) {
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
  renderUpNext();
  renderRequests();
  persist();
  newSessionSheet.close();
  await navigateTo(id, { cameFromHome: homeSection.hidden === false });
  renderSessionMeta(sync.getMeta());
  updateShareUi();
}

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
// The fetched editions listing, kept for the new-session sheet and for
// resolving a picked id back to its {id, title} on create. Empty until (and
// unless) /api/editions answers — both selects ship a hardcoded "current"
// option so the default path never depends on this request.
let editionsList = [];

// Point the settings select at the session's book. The panel grows an option
// for an id the listing doesn't know (editions may still be loading when the
// doc arrives).
function syncEditionSelect(editionId) {
  settingsPanel.selectEdition(editionId);
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
  settingsPanel.setEditions(editionsList);
  settingsPanel.selectEdition(app.edition?.id || "current");
  newSessionSheet.setEditions(editionsList.map((e) => ({ id: e.id, label: editionLabel(e) })));
}

// Load the catalogue for an edition independently of any photo, so manual add
// works before (or without) a scan. Never wipes the setlist. Requests are
// sequenced: hopping between sessions with different books can leave two
// fetches in flight, and the slower (stale) one must not win.
let catalogueLoadSeq = 0;
// The edition the latest fetch asked for, and when: what a staleness re-check
// re-fetches. Not loadedCatalogueEditionId, which lags a switch still in
// flight, and re-fetching it would supersede the switch.
let catalogueLoadEditionId = null;
let catalogueLoadAttemptAt = 0;
async function loadCatalogue(edition) {
  const seq = ++catalogueLoadSeq;
  catalogueLoadEditionId = edition;
  catalogueLoadAttemptAt = Date.now();
  try {
    const res = await fetch(`${API_BASE}/api/catalogue?edition=${encodeURIComponent(edition)}`);
    if (seq !== catalogueLoadSeq) return;
    if (!res.ok) {
      catalogueLoadAttemptAt = 0; // retry on the next foreground, not in 15 min
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
    catalogueLoadAttemptAt = 0; // retry on the next foreground, not in 15 min
    if (!app.catalogue.length) catalogueStatus = "error";
    refreshPickers();
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
// typed during a slow load must not silently read as "no such song". The
// review sheet's pickers and the songbook both follow the data they're given.
function refreshPickers() {
  scanFlow.refresh(scanContext());
  refreshSongbook();
}

// Adding by name opens the songbook in both modes. The request view's button
// leads its page; the full app's sits first in the add row, beside the camera.
// Both are mounted and the mode CSS shows one, like every other room/full
// difference. Worded per audience: a player requests, an organiser adds on
// the board's behalf.
function mountManualAdd() {
  roomAddHost.replaceChildren(buildSongbookTrigger("Request a tune"));
}

function buildSongbookTrigger(label) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "songbook-trigger";
  button.append(...iconLabel("add", label));
  button.onclick = openSongbook;
  return button;
}

// --- The songbook sheet ------------------------------------------------------
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

function closeSongbook() {
  songbookSheet.close();
}

// Peers keep adding, voting and playing while the sheet is open: re-tag the
// book with the night as it now stands. Svelte batches back-to-back calls.
function refreshSongbook() {
  if (songbookSheet.isSheetOpen()) songbookSheet.setData(songbookData());
}

// The same flow in both modes. The one room-only part is the request link's
// brakes (open/closed and the one-a-minute wait, see room-limits.ts): they
// govern that link, and an organiser adds whatever the switch says.
function onSongbookPick(entry) {
  const room = viewMode === "room";
  // Belt and braces: applyRequestsOpen() closes this sheet when the door
  // shuts, but a tap can race the change.
  if (room && !requestsState().open) {
    closeSongbook();
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
      renderUpNext();
      renderRequests();
      persist();
    }
    closeSongbook();
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
  closeSongbook();
  openRequestSheet(entry);
}

// Returns whether a row was actually added, so the request sheet can tell a
// completed pick from a refusal. `comment` reuses the row's `notes` slot — the
// same field a scanned board annotation ("please NO!!!") lands in, so it
// syncs and renders with no new schema.
function addManualEntry(entry, comment) {
  // Same song already on the night's lists (#52)? Say where it is instead of
  // quietly doubling it. Binned copies don't block — see dupes.ts.
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
// ScanFlow.svelte owns the screens (photo, overlay, cancel and timeout,
// errors, the review sheet); this is what a scan does to the night.

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

// One photo, start to finish: shrink it, send it, take the catalogue it
// brings back, and add the confident rows straight to Requests. Returns what's
// left for review. Rejects (abort included) for ScanFlow to word.
async function runScan(file, signal) {
  // The long edge governs the upload now, not just the server's resize — the
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
      // Tuning knobs from the settings panel — the API clamps/ignores
      // anything out of range and falls back to its configured defaults.
      model,
      disableThinking,
      sendCatalogue,
      maxImageEdge: maxEdge,
    },
    signal,
  );
  // Refresh catalogue/edition metadata from the parse response.
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
    renderRequests();
    persist();
  }
  return { flagged, autoAdded: fresh.length, autoSkipped: skipped };
}

// What review kept goes to Requests, each row its board asker's vote.
function onReviewConfirm(kept) {
  app.requests.push(...kept);
  for (const row of kept) app.votes = seedAsker(app.votes, row.uid, ASKER);
  renderRequests();
  persist();
}

// Whether the review sheet is up: an in-flight review means songs are
// coming, so the session view leaves its fresh (camera hero) state.
let reviewing = false;
function onReviewChange(open) {
  reviewing = open;
  // The photo is only reachable from the review sheet.
  if (!open) photoLightbox.close();
  updateSessionMode();
}

function closeReview() {
  scanFlow.closeReview();
}

// The night as review rows need it: duplicates, the picker, suggestions.
function scanContext() {
  return {
    upNext: app.upNext,
    requests: app.requests,
    catalogue: app.catalogue,
    catalogueStatus,
    showSuggestions: settingsPanel.settings().showSuggestions,
  };
}

// --- Rendering -------------------------------------------------------------
function rerender() {
  renderUpNext();
  renderRequests();
  scanFlow.refresh(scanContext());
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
    app.upNext.length === 0 && app.requests.length === 0 && !reviewing && viewMode !== "room";
  sessionView.classList.toggle("fresh", fresh);
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

// The two lists and the bin render from one snapshot of the night. Rows go
// over as fresh copies, so a row edited in place (played, binned, a
// correction) still reads as changed.
function listsData() {
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
    exportEmpty: exportedRows().length === 0,
    openingSoon: openingSoonText,
  };
}

function refreshLists() {
  const data = listsData();
  upNextSection.setData(data);
  requestsSection.setData(data);
  binGroup.setData(data);
}

// Every mutation path (local edits, remote snapshots, review confirm)
// funnels through these two, which keep the session's mode, the songbook's
// tags and the edition footnote current alongside the lists.
function renderUpNext() {
  renderEditionNote();
  updateSessionMode();
  refreshSongbook();
  refreshLists();
}

function renderRequests() {
  updateSessionMode();
  refreshSongbook();
  refreshLists();
}

// A room device on a View-only link doesn't vote either: the share panel
// promises those people can "open tonight's pool and watch it", and a live
// control would make that copy a lie. The full app always votes — closing the
// link is about the link.
function votingEnabled() {
  return viewMode !== "room" || requestsState().open;
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

// The row behind a uid from the lists, for actions that take the row itself.
function withRow(uid, fn) {
  const row = [...app.upNext, ...app.requests].find((e) => e.uid === uid);
  if (row) fn(row);
}

// Played and binned are mutually exclusive: a tune can't be both "done" and
// "skipped" (gig-state.ts owns that, and stamps when each was set). Both
// follow the mutate -> render -> persist pattern used elsewhere.
function togglePlayed(row) {
  setPlayed(row, !row.played);
  rerender();
  persist();
}

function toggleBinned(row) {
  setBinned(row, !row.binned);
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

// A drag ended (UpNextSection.svelte): the visible rows' uids in their new
// order. Played/binned rows aren't among them, so indexOf gives them -1 and
// the (stable) sort parks them at the front in their existing order. That's
// relied on: played songs belong at the top conceptually, and binned rows are
// position-agnostic until un-binned.
function commitOrder(uids) {
  app.upNext.sort((a, b) => uids.indexOf(a.uid) - uids.indexOf(b.uid));
  renderUpNext();
  persist();
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
    (row) => !row.removed && (settingsPanel.settings().includeCrossed || !row.crossed_out),
  );
}

function exportText() {
  return exportedRows()
    .map((row) =>
      row.match
        ? `${row.match.display} (p.${row.match.page})`
        : `?? ${row.raw_title}${row.raw_page ? ` (p.${row.raw_page})` : ""}`,
    )
    .join("\n");
}

// Drop the internal UI/provenance fields from the exported JSON. `played` and
// `binned` are live gig-tracking state, not part of the setlist payload; the
// times they were set (`playedAt` / `binnedAt`) stay, as the night's record of
// what got played when. A row carrying `playedAt` is a played row.
function stripInternal({ uid, source, addedBy, removed, played, binned, ...rest }) {
  return rest;
}

async function copySetlist() {
  await copyToClipboard(exportText());
}

function downloadSetlist() {
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
}

// --- Init ------------------------------------------------------------------
(async function init() {
  restore();
  // Resolve the view mode before the first render: renderRequests keys row
  // interactivity off it, so a sticky room device must know before painting.
  applyViewMode();
  // After restore() (there must be a name to clear) and applyViewMode() (the
  // amnesty is full-view only), before the first render or any presence write.
  maybeResetName();
  // Hydrate search from the cached catalogue immediately; the network fetch
  // below replaces it (a Cloud Function cold start can take several seconds).
  // Keyed by the edition restore() brought back — joining a session with a
  // different book re-scopes via applyRemoteState.
  restoreCatalogueCache(app.edition?.id || settingsPanel.selectedEdition());
  settingsPanel.setName(app.name);
  renderRoomIdentity();
  mountManualAdd();
  renderUpNext();
  renderRequests();
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
    loadCatalogue(app.edition?.id || settingsPanel.selectedEdition()),
  ]);
})();
