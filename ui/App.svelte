<!--
  The whole page: the header with its two popovers, home (the club's history)
  and the session view, the sheets and the footnote. It draws the state
  modules (*.svelte.ts) and wires each part to the actions that change them
  (adds.ts, rows.ts, sharing.ts, routing.ts, ...). Which sheet or popover is
  up is overlays.svelte.ts: each is mounted only while its flag is set.

  The ids and classes are load-bearing: style.css and the e2e suite select on
  them. No scoped <style> here; the global stylesheet stays global.
-->
<script lang="ts">
  import BinGroup from "./BinGroup.svelte";
  import Home from "./Home.svelte";
  import Icon from "./Icon.svelte";
  import NewSessionSheet from "./NewSessionSheet.svelte";
  import OrganiserSheet from "./OrganiserSheet.svelte";
  import PhotoLightbox from "./PhotoLightbox.svelte";
  import RequestsSection from "./RequestsSection.svelte";
  import RoomRequestSheet from "./RoomRequestSheet.svelte";
  import ScanFlow from "./ScanFlow.svelte";
  import SettingsPanel from "./SettingsPanel.svelte";
  import SharePanel from "./SharePanel.svelte";
  import SongbookSheet from "./SongbookSheet.svelte";
  import UpNextSection from "./UpNextSection.svelte";
  import WhatsNewSheet from "./WhatsNewSheet.svelte";
  import { addFromBoard, confirmRequest, pickSong, scanBoard } from "./adds.js";
  import { catalogue, scopeCatalogueToEdition } from "./catalogue.svelte.js";
  import { editionLabel } from "./editions.js";
  import { night } from "./night.svelte.js";
  import { notices } from "./notices.svelte.js";
  import { organiser } from "./organiser.svelte.js";
  import { overlays } from "./overlays.svelte.js";
  import { setPlayerName } from "./player.js";
  import { roomWindowText, windowChipText } from "./request-window.js";
  import { leaveToHome, openSession, startSession } from "./routing.js";
  import { commitOrder, copySetlist, downloadSetlist, rowActions } from "./rows.js";
  import { persist } from "./save.js";
  import { pageTitle } from "./session-index.js";
  import { session } from "./session.svelte.js";
  import {
    changeRequestsMode,
    changeRequestsWindow,
    changeVisibility,
    shareRoomLink,
    shareSessionLink,
  } from "./sharing.js";
  import { view } from "./view.svelte.js";
  import {
    type WhatsNewEntry,
    latestEntry,
    readWhatsNewSeen,
    sortedEntries,
    writeWhatsNewSeen,
  } from "./whats-new.js";

  const BRAND_TITLE = "🎶 Setlister";

  // The one imperative call into a part: a file input's click() has to run
  // inside the tap itself.
  let scanFlow: ScanFlow | undefined = $state();
  // Taps on these open the share panel, so they mustn't count as "outside".
  let shareToggle: HTMLButtonElement;
  let windowChip: HTMLButtonElement | undefined = $state();

  const inSession = $derived(view.page === "session");

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
  // No songs yet: the view collapses to the add buttons ("Fresh session" in
  // style.css). An in-flight review means songs are coming. Never in room
  // mode: the fresh state is a camera hero, and the room has no camera.
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

  // When the request link shuts (a peer's switch, or the window's own close),
  // close the confirm sheet and the songbook so they don't offer taps that
  // can't land. Same "no" as the backdrop.
  $effect(() => {
    if (view.room && !session.link.open) {
      overlays.request = null;
      overlays.songbook = false;
    }
  });

  // The popovers close themselves on an outside tap or Escape. These taps
  // stop propagating so they toggle rather than count as outside, and never
  // leave both header popovers open.
  function onShareTap(event: MouseEvent) {
    event.stopPropagation();
    overlays.settings = false;
    overlays.share = overlays.share ? false : "top";
  }

  function onSettingsTap(event: MouseEvent) {
    event.stopPropagation();
    overlays.share = false;
    overlays.settings = !overlays.settings;
  }

  // What's new has two doors for two jobs. The banner shows only while the
  // latest entry is unseen on this device, opens that entry alone, and one
  // tap retires it, so home carries no permanent extra furniture. The footer
  // link is the quiet, always-there door to the whole history: someone who
  // goes looking is browsing, not being told.
  const latest = latestEntry<WhatsNewEntry>();
  let bannerSeen = $state(readWhatsNewSeen() === latest?.date);

  function openWhatsNew(entries: WhatsNewEntry[]) {
    overlays.whatsNew = entries;
    // Opening is seeing: the banner has done its job for this entry.
    bannerSeen = true;
    writeWhatsNewSeen(latest?.date || "");
  }

  function onReviewChange(reviewing: boolean) {
    view.reviewing = reviewing;
    // The photo is only reachable from the review sheet.
    if (!reviewing) overlays.photo = null;
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
    aria-expanded={!!overlays.share}
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
    aria-expanded={overlays.settings}
    aria-controls="settings-panel"
    onclick={onSettingsTap}
  >
    <Icon name="settings" />
  </button>
  <!-- The "whiteboard of wishes" is the physical board the app photographs,
       so the phrase belongs to the scan ritual, not the app's name. In a
       session the h1 is the night's date, between the share and settings
       buttons that act on it, under the club's name (see .club-name in
       style.css; hidden on home, where the brand is the title). -->
  <div class="title-stack">
    <p class="club-name">Ukulele Tuesday</p>
    <h1>{inSession ? session.label : BRAND_TITLE}</h1>
  </div>
  <p class="subtitle">Snap the whiteboard of wishes, build the setlist together.</p>

  {#if overlays.share}
    <SharePanel
      at={overlays.share}
      onclose={() => (overlays.share = false)}
      onVisibility={changeVisibility}
      onRequestsMode={changeRequestsMode}
      onWindow={changeRequestsWindow}
      onShareLink={shareSessionLink}
      onShareRoomLink={shareRoomLink}
      openers={() => [shareToggle, windowChip].filter((el) => el !== undefined)}
    />
  {/if}
  <!-- Settings are saved with the lists: losing a toggle you set last
       Tuesday reads as a bug at the club. Switching the book is a cache-first
       re-scope, saved at once so a cached switch reaches the session's peers
       even if the background refresh never lands (pub wifi). -->
  {#if overlays.settings}
    <SettingsPanel
      onclose={() => (overlays.settings = false)}
      onName={setPlayerName}
      onChange={persist}
      onEdition={(editionId) => {
        scopeCatalogueToEdition(editionId);
        persist();
      }}
    />
  {/if}
</header>

<main>
  {#if inSession}
    <!-- One session's working state. The mode classes drive the CSS: room
         (the request view, #86), fresh (no songs yet), and the request link
         closed or about to open. -->
    <div
      id="session-view"
      class:room={view.room}
      class:fresh
      class:requests-closed={!session.link.open && session.link.soonMinutes === null}
      class:requests-opening-soon={session.link.soonMinutes !== null}
    >
      <!-- Session-level navigation is just the way out: you leave a set by
           walking away from it, never by wiping it for everyone in the room
           (see AGENTS.md). -->
      <div class="session-bar">
        <button id="back-home" class="link-button" type="button" onclick={leaveToHome}>
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
          onclick={() => (overlays.share = "requests")}
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
          <button type="button" class="songbook-trigger" onclick={() => (overlays.songbook = true)}>
            <Icon name="add" /><span class="btn-label">Request a tune</span>
          </button>
        </div>
        <!-- The link's rules, up front rather than discovered by bumping into
             them, plus the name this phone requests under. -->
        <div class="room-rules">
          <span id="room-window" class="window-pill">{roomWindowText(session.link.status)}</span>
          <span>One request a minute</span>
          <!-- The confirm sheet asks for the name when it's first needed; this
               line is its only trace. "change" reopens that sheet, since the
               gear that holds "Your name" is hidden in room mode. -->
          <span id="room-identity" class="room-identity" hidden={!roomName}>
            <span id="room-identity-text">As {roomName}</span>
            <button
              id="room-identity-change"
              class="link-button"
              type="button"
              onclick={() => (overlays.request = { entry: null })}
            >
              change
            </button>
          </span>
        </div>
      </div>

      <!-- Shown purely by the fresh class, never the hidden attribute, which
           would override the mode CSS. -->
      <div class="fresh-intro">
        <h2>No tunes yet</h2>
        <p>Snap the whiteboard, or add tunes from the songbook.</p>
      </div>

      <UpNextSection
        actions={rowActions}
        onReorder={commitOrder}
        onCopy={copySetlist}
        onDownload={downloadSetlist}
      />
      <RequestsSection
        actions={rowActions}
        onAddTune={() => (overlays.songbook = true)}
        onSnap={() => scanFlow?.pickPhoto()}
      />

      <!-- #add (the photo, its scanning overlay, the post-scan note and the
           error line) and #review (the rows the parser wasn't sure about). -->
      <ScanFlow
        bind:this={scanFlow}
        scan={scanBoard}
        onConfirm={addFromBoard}
        onShowPhoto={(imageUrl) => (overlays.photo = imageUrl)}
        {onReviewChange}
      />

      <!-- Binned songs, at the very bottom, below the add controls, so the
           discard pile never wedges itself between Requests and the controls
           that feed it. -->
      <BinGroup actions={rowActions} />
    </div>
  {:else}
    <!-- Home, whenever the URL carries no ?session= param: the app is a
         session picker until you pick one. -->
    <section id="home">
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
        onPick={openSession}
        onNewSession={() => {
          notices.home.clear();
          overlays.newSession = true;
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
  {/if}
</main>

<!-- Each sheet is mounted only while it's up, so every opening starts fresh. -->
{#if overlays.newSession}
  <NewSessionSheet onStart={startSession} onclose={() => (overlays.newSession = false)} />
{/if}
{#if overlays.request}
  <RoomRequestSheet
    entry={overlays.request.entry}
    onConfirm={confirmRequest}
    onclose={() => (overlays.request = null)}
  />
{/if}
{#if overlays.songbook}
  <SongbookSheet onPick={pickSong} onclose={() => (overlays.songbook = false)} />
{/if}
{#if organiser.sheet}
  <OrganiserSheet />
{/if}
{#if overlays.whatsNew}
  <WhatsNewSheet entries={overlays.whatsNew} onclose={() => (overlays.whatsNew = null)} />
{/if}

<!-- Which songbook edition rows were matched against, and when it was
     generated. A quiet page footer: provenance, not part of the running order
     up top. -->
<footer id="edition-note" class="note" hidden={!inSession}>{editionNote}</footer>

{#if overlays.photo}
  <PhotoLightbox src={overlays.photo} onclose={() => (overlays.photo = null)} />
{/if}
