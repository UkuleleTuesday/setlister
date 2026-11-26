<!--
  The whole page: the header with its two popovers, home (the club's history)
  and the session view, the sheets and the footnote. main.ts mounts it on the
  bare index.html and changes the night (the lists, sync, the catalogue,
  routing); this file draws the chrome from the state modules and wires the
  parts to each other.

  Wiring that is pure chrome stays here: the header buttons toggling their
  popovers, the window chip opening the share panel, the photo viewer, the
  What's new doors. Everything that changes the night goes out through
  `handlers`. main.ts drives the parts through their exports (parts()).

  The ids and classes are load-bearing: style.css and the e2e suite select on
  them. No scoped <style> here; the global stylesheet stays global.
-->
<script module lang="ts">
  import type { NewSessionChoice } from "./NewSessionSheet.svelte";
  import type { RequestAnswer } from "./RoomRequestSheet.svelte";
  import type { RowActions } from "./Row.svelte";
  import type { ScanOutcome } from "./ScanFlow.svelte";
  import type { Settings } from "./settings.svelte.js";
  import type { CatalogueEntry, RequestsSwitch, Row } from "./types.js";

  /** What the page asks of main.ts. */
  export interface AppHandlers {
    /** "All sessions". */
    onBack: () => void;
    /** A night picked on home. */
    onPickSession: (id: string) => void;
    onStartSession: (choice: NewSessionChoice) => Promise<void>;
    /** "Request a tune" (room) and "Add a tune" (full app): the songbook. */
    onAddTune: () => void;
    /** The room's "change" next to its name. */
    onChangeRoomName: () => void;
    onVisibility: (listed: boolean) => Promise<void>;
    onRequestsMode: (mode: RequestsSwitch) => Promise<void>;
    onWindow: (window: { opensAt: Date | null; closesAt: Date | null }) => Promise<void>;
    onShareLink: () => Promise<boolean>;
    onShareRoomLink: () => Promise<boolean>;
    onName: (name: string) => void;
    onSettingChange: (key: keyof Settings) => void;
    onEdition: (editionId: string) => void;
    onRequestConfirm: (answer: RequestAnswer) => void;
    onSongbookPick: (entry: CatalogueEntry) => void;
    scan: (file: File, signal: AbortSignal) => Promise<ScanOutcome>;
    onReviewConfirm: (kept: Row[]) => void;
    rowActions: RowActions;
    onReorder: (uids: string[]) => void;
    onCopy: () => Promise<void>;
    onDownload: () => void;
  }
</script>

<script lang="ts">
  import BinGroup from "./BinGroup.svelte";
  import Home from "./Home.svelte";
  import Icon from "./Icon.svelte";
  import NameResetSheet from "./NameResetSheet.svelte";
  import NewSessionSheet from "./NewSessionSheet.svelte";
  import PhotoLightbox from "./PhotoLightbox.svelte";
  import RequestsSection from "./RequestsSection.svelte";
  import RoomRequestSheet from "./RoomRequestSheet.svelte";
  import ScanFlow from "./ScanFlow.svelte";
  import SettingsPanel from "./SettingsPanel.svelte";
  import SharePanel from "./SharePanel.svelte";
  import SongbookSheet from "./SongbookSheet.svelte";
  import UpNextSection from "./UpNextSection.svelte";
  import WhatsNewSheet from "./WhatsNewSheet.svelte";
  import { catalogue } from "./catalogue.svelte.js";
  import { editionLabel } from "./editions.js";
  import { night } from "./night.svelte.js";
  import { roomWindowText, windowChipText } from "./request-window.js";
  import { pageTitle } from "./session-index.js";
  import { session } from "./session.svelte.js";
  import { view } from "./view.svelte.js";
  import {
    type WhatsNewEntry,
    latestEntry,
    readWhatsNewSeen,
    sortedEntries,
    writeWhatsNewSeen,
  } from "./whats-new.js";

  let { handlers }: { handlers: AppHandlers } = $props();

  // Bound once at mount and never swapped, so plain lets: main.ts reads them
  // through parts() after mount() has flushed.
  let home: Home;
  let newSessionSheet: NewSessionSheet;
  let sharePanel: SharePanel;
  let settingsPanel: SettingsPanel;
  let requestSheet: RoomRequestSheet;
  let songbookSheet: SongbookSheet;
  let scanFlow: ScanFlow;
  let photoLightbox: PhotoLightbox;
  let requestsSection: RequestsSection;
  let nameResetSheet: NameResetSheet;
  let whatsNewSheet: WhatsNewSheet;
  let shareToggle: HTMLButtonElement;
  let windowChip: HTMLButtonElement;

  /** The parts main.ts drives. */
  export function parts() {
    return {
      home,
      newSessionSheet,
      sharePanel,
      settingsPanel,
      requestSheet,
      songbookSheet,
      scanFlow,
      requestsSection,
      nameResetSheet,
    };
  }

  const BRAND_TITLE = "🎶 Setlister";

  const inSession = $derived(view.page === "session");
  let shareOpen = $state(false);
  let settingsOpen = $state(false);

  // In a session the night's date IS the working title, so the brand retreats
  // to home; CSS keys the header's sizing off in-session, and room-mode
  // restyles the page around the request view (see "Room mode" in style.css).
  $effect(() => {
    document.body.classList.toggle("in-session", inSession);
    document.body.classList.toggle("room-mode", view.room);
  });

  const shareCount = $derived(inSession && session.id ? session.roster.length : 0);
  const shareLabel = $derived(
    !session.id
      ? "Share session"
      : session.roster.length > 1
        ? `Sharing session ${session.id}, ${session.roster.length} people here. Tap for options`
        : `Sharing session ${session.id}. Tap for options`,
  );
  // A session with no songs at all has exactly one job, get the board in, so
  // the view collapses to the add buttons. An in-flight review means songs
  // are coming. Never in room mode: the fresh state is a camera hero, and the
  // room has no camera.
  const fresh = $derived(
    night.upNext.length === 0 &&
      night.requests.length === 0 &&
      !view.reviewing &&
      view.mode !== "room",
  );
  const roomName = $derived(night.name.trim());
  const editionNote = $derived(
    night.edition
      ? `Matched against “${editionLabel(night.edition)}” ` +
          `(generated ${catalogue.generatedAt.slice(0, 10) || "unknown"})`
      : "",
  );

  // A phone left holding the confirm sheet or the songbook when the request
  // link shuts (a peer's switch, or the window's own close) would otherwise
  // still offer taps that can't land. Closing is the same "no" as the
  // backdrop.
  $effect(() => {
    if (view.room && !session.link.open) {
      requestSheet.close();
      songbookSheet.close();
    }
  });

  // The popovers close themselves on an outside tap or Escape. These taps
  // stop propagating so they toggle rather than counting as outside, and
  // never leave both header popovers open at once.
  function onShareTap(event: MouseEvent) {
    event.stopPropagation();
    settingsPanel.setOpen(false);
    sharePanel.setOpen(!sharePanel.isPanelOpen());
  }

  function onSettingsTap(event: MouseEvent) {
    event.stopPropagation();
    sharePanel.setOpen(false);
    settingsPanel.setOpen(!settingsPanel.isPanelOpen());
  }

  // What's new: announcement and archive are two jobs, so two doors. The
  // banner exists only while the latest entry is unseen on this device and
  // opens that entry alone; one tap retires it, so the home screen carries no
  // permanent extra furniture. The footer link is the quiet, always-there
  // door, and opens the whole history: someone who goes looking is browsing,
  // not being told.
  const latest = latestEntry<WhatsNewEntry>();
  let bannerSeen = $state(readWhatsNewSeen() === latest?.date);

  function openWhatsNew(entries: WhatsNewEntry[]) {
    whatsNewSheet.open(entries);
    // Opening is seeing: the banner has done its job for this entry.
    bannerSeen = true;
    writeWhatsNewSeen(latest?.date || "");
  }

  function onReviewChange(reviewing: boolean) {
    view.reviewing = reviewing;
    // The photo is only reachable from the review sheet.
    if (!reviewing) photoLightbox.close();
  }
</script>

<svelte:head>
  <title>{pageTitle(inSession ? session.label : "")}</title>
</svelte:head>

<header>
  <button
    id="share-toggle"
    class="share-toggle"
    class:active={!!session.id}
    type="button"
    aria-label={shareLabel}
    aria-expanded={shareOpen}
    aria-controls="share-panel"
    hidden={!inSession}
    bind:this={shareToggle}
    onclick={onShareTap}
  >
    <Icon name="share" />
  </button>
  <!-- Live count of people connected to the session, pinned to the share
       button's corner. -->
  <span
    id="share-count-badge"
    class="share-count-badge"
    aria-hidden="true"
    hidden={shareCount === 0}
  >
    {shareCount || ""}
  </span>
  <button
    id="settings-toggle"
    class="settings-toggle"
    type="button"
    aria-label="Settings"
    aria-expanded={settingsOpen}
    aria-controls="settings-panel"
    onclick={onSettingsTap}
  >
    <Icon name="settings" />
  </button>
  <!-- The app is Setlister; the "whiteboard of wishes" is the physical board
       it photographs: the phrase belongs to the scan ritual, not the app. In
       a session the h1 is the night's date, between the share and settings
       buttons that act on it, and the club's name sits over it, so a link
       opened away from the pub (forwarded, reopened next day) still says
       whose night this is. Hidden on home, where the brand is the title. -->
  <div class="title-stack">
    <p class="club-name">Ukulele Tuesday</p>
    <h1>{inSession ? session.label : BRAND_TITLE}</h1>
  </div>
  <p class="subtitle">Snap the whiteboard of wishes, build the setlist together.</p>

  <SharePanel
    bind:this={sharePanel}
    onVisibility={handlers.onVisibility}
    onRequestsMode={handlers.onRequestsMode}
    onWindow={handlers.onWindow}
    onShareLink={handlers.onShareLink}
    onShareRoomLink={handlers.onShareRoomLink}
    onOpenChange={(open) => (shareOpen = open)}
    openers={() => [shareToggle, windowChip]}
  />
  <!-- Settings survive a reload like the lists do (main.ts persists them),
       and the songbook select edits the session's book, for everyone. -->
  <SettingsPanel
    bind:this={settingsPanel}
    onName={handlers.onName}
    onChange={handlers.onSettingChange}
    onEdition={handlers.onEdition}
    onOpenChange={(open) => (settingsOpen = open)}
  />
</header>

<main>
  <!-- Home: the club's session history. Shown whenever the URL carries no
       ?session= param: the app is a session picker until you pick one. -->
  <section id="home" hidden={inSession}>
    <!-- Above the heading, so it reads as an announcement, never as part of
         the pick-a-session flow below. -->
    <button
      id="whats-new-banner"
      class="whats-new-banner"
      type="button"
      hidden={!latest || bannerSeen}
      onclick={() => latest && openWhatsNew([latest])}
    >
      <Icon name="news" /><span class="btn-label">What’s new</span>
    </button>

    <Home
      bind:this={home}
      onPick={handlers.onPickSession}
      onNewSession={() => {
        home.clearError();
        newSessionSheet.open();
      }}
    />

    <!-- Footer register: app-meta belongs at the bottom, like the edition
         note in the session view. -->
    <p id="whats-new-footer" class="whats-new-footer" hidden={!latest}>
      <button
        id="whats-new-open"
        class="link-button"
        type="button"
        onclick={() => openWhatsNew(sortedEntries<WhatsNewEntry>())}
      >
        What’s new
      </button>
    </p>
  </section>

  <!-- One session's working state, wrapped so the view swap is a single
       attribute. The mode classes drive the CSS: room (the request view,
       #86), fresh (no songs yet), and the request link closed or about to
       open. -->
  <div
    id="session-view"
    hidden={!inSession}
    class:room={view.room}
    class:fresh
    class:requests-closed={!session.link.open && session.link.soonMinutes === null}
    class:requests-opening-soon={session.link.soonMinutes !== null}
  >
    <!-- Session-level navigation: just the way out. You stop working on a set
         by walking away from it, never by wiping it for everyone else in the
         room (there is no "Start over"). -->
    <div class="session-bar">
      <button id="back-home" class="link-button" type="button" onclick={handlers.onBack}>
        <Icon name="back" /><span class="btn-label">All sessions</span>
      </button>
      <!-- Where the request link stands right now, so an organiser sees it
           without opening the share panel; tapping opens that panel. -->
      <button
        id="window-chip"
        class="window-pill"
        type="button"
        data-state={session.link.status.state}
        bind:this={windowChip}
        onclick={() => sharePanel.revealRequests()}
      >
        {windowChipText(session.link.status)}
      </button>
    </div>

    <!-- Request view only: what this page is for and the one thing to do on
         it, first. Someone who just scanned a QR code needs both before they
         need the running order. Hidden by the mode CSS while requests are
         closed or about to open, where the notes in Requests take over. -->
    <div class="room-top">
      <h2 class="room-purpose">Pick a tune for tonight</h2>
      <p class="room-purpose-sub">
        Choose one from the Ukulele Tuesday songbook and add it to tonight's requests.
      </p>
      <div id="room-add" class="room-add">
        <button type="button" class="songbook-trigger" onclick={handlers.onAddTune}>
          <Icon name="add" /><span class="btn-label">Request a tune</span>
        </button>
      </div>
      <!-- The link's rules, up front instead of discovered by bumping into
           them, plus the name this phone requests under. -->
      <div class="room-rules">
        <span id="room-window" class="window-pill">{roomWindowText(session.link.status)}</span>
        <span>One request a minute</span>
        <!-- The name is asked for in the confirm sheet at the moment it's
             needed. Once set it's fire-and-forget and this is its only trace;
             "change" reopens that sheet, since the gear that normally holds
             "Your name" is hidden in room mode. -->
        <span id="room-identity" class="room-identity" hidden={!roomName}>
          <span id="room-identity-text">As {roomName}</span>
          <button
            id="room-identity-change"
            class="link-button"
            type="button"
            onclick={handlers.onChangeRoomName}
          >
            change
          </button>
        </span>
      </div>
    </div>

    <!-- A brand-new session has exactly one job, get songs in, so while both
         lists are empty the view collapses to this line plus the two add
         affordances. Shown purely by the fresh class, never the hidden
         attribute, which would override the mode CSS. -->
    <div class="fresh-intro">
      <h2>No tunes yet</h2>
      <p>Snap the whiteboard, or add tunes from the songbook.</p>
    </div>

    <UpNextSection
      actions={handlers.rowActions}
      onReorder={handlers.onReorder}
      onCopy={handlers.onCopy}
      onDownload={handlers.onDownload}
    />
    <RequestsSection
      bind:this={requestsSection}
      actions={handlers.rowActions}
      onAddTune={handlers.onAddTune}
      onSnap={() => scanFlow.pickPhoto()}
    />

    <!-- The scan flow: #add (the photo, its scanning overlay, the post-scan
         note and the error line) and #review (the rows the parser wasn't
         sure about). -->
    <ScanFlow
      bind:this={scanFlow}
      scan={handlers.scan}
      onConfirm={handlers.onReviewConfirm}
      onShowPhoto={(imageUrl) => photoLightbox.open(imageUrl)}
      {onReviewChange}
    />

    <!-- Binned songs, at the very bottom, below the add controls, so the
         discard pile never wedges itself between Requests and the controls
         that feed it. -->
    <BinGroup actions={handlers.rowActions} />
  </div>
</main>

<NewSessionSheet bind:this={newSessionSheet} onStart={handlers.onStartSession} />
<RoomRequestSheet bind:this={requestSheet} onConfirm={handlers.onRequestConfirm} />
<SongbookSheet bind:this={songbookSheet} onPick={handlers.onSongbookPick} />
<NameResetSheet bind:this={nameResetSheet} onSave={handlers.onName} />
<WhatsNewSheet bind:this={whatsNewSheet} />

<!-- Which songbook edition rows were matched against, and when it was
     generated. A quiet page footer: provenance, not part of the running order
     up top. -->
<footer id="edition-note" class="note" hidden={!inSession}>{editionNote}</footer>

<PhotoLightbox bind:this={photoLightbox} />
