<script lang="ts">
  import BinGroup from "./BinGroup.svelte";
  import Home from "./Home.svelte";
  import Icon from "./Icon.svelte";
  import NewSessionSheet from "./NewSessionSheet.svelte";
  import OrganiserSheet from "./OrganiserSheet.svelte";
  import PhotoLightbox from "./PhotoLightbox.svelte";
  import Recap from "./Recap.svelte";
  import RequestLinkSheet from "./RequestLinkSheet.svelte";
  import RequestsSection from "./RequestsSection.svelte";
  import RoomRequestSheet from "./RoomRequestSheet.svelte";
  import ScanFlow from "./ScanFlow.svelte";
  import SessionDetailsSheet from "./SessionDetailsSheet.svelte";
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
    changeBlurb,
    changeRequestsMode,
    changeRequestsWindow,
    changeVisibility,
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

  const BRAND_TITLE = "Setlister";

  // Imperative because a file input's click() has to run inside the tap itself.
  let scanFlow: ScanFlow | undefined = $state();
  let shareToggle: HTMLButtonElement;

  const inSession = $derived(view.page === "session");
  // Held off mid-scan: swapping views would drop the review.
  const recap = $derived(
    session.past && !(view.editingPast && view.mode === "full") && !view.reviewing,
  );

  $effect(() => {
    document.body.classList.toggle("in-session", inSession);
    document.body.classList.toggle("room-mode", view.room);
  });

  // A count of one is only you, so it says nothing.
  const shareCount = $derived(
    inSession && session.id && session.roster.length > 1 ? session.roster.length : 0,
  );
  // The chevron rides the last word, so a wrapped title never strands it on a line alone.
  const titleBreak = $derived(session.label.lastIndexOf(" ") + 1);
  const titleHead = $derived(session.label.slice(0, titleBreak));
  const titleTail = $derived(session.label.slice(titleBreak));
  const shareLabel = $derived(
    !session.id
      ? "Share session"
      : session.roster.length > 1
        ? `Sharing session ${session.id}, ${session.roster.length} people here. Tap for options`
        : `Sharing session ${session.id}. Tap for options`,
  );
  // Not in room mode: the fresh state is a camera hero, and the room has no camera.
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

  // Once the link shuts, don't leave sheets offering taps that can't land.
  $effect(() => {
    if (view.room && !session.link.open) {
      overlays.request = null;
      overlays.songbook = false;
    }
  });

  // Stop propagation, or the popovers' outside-tap handlers would close what
  // this toggles.
  function onShareTap(event: MouseEvent) {
    event.stopPropagation();
    overlays.settings = false;
    overlays.share = !overlays.share;
  }

  function openRequestLink() {
    overlays.share = false;
    overlays.sessionDetails = false;
    overlays.requestLink = true;
  }

  function openSessionDetails() {
    overlays.share = false;
    overlays.sessionDetails = true;
  }

  // Stops propagation for the same reason as the header taps.
  function openNameSetting(event: MouseEvent) {
    event.stopPropagation();
    overlays.share = false;
    overlays.settings = "name";
  }

  function onSettingsTap(event: MouseEvent) {
    event.stopPropagation();
    overlays.share = false;
    overlays.settings = !overlays.settings;
  }

  const latest = latestEntry<WhatsNewEntry>();
  let bannerSeen = $state(readWhatsNewSeen() === latest?.date);

  function openWhatsNew() {
    overlays.whatsNew = sortedEntries<WhatsNewEntry>();
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

<header class="app-header">
  <div class="title-stack">
    <p class="club-name eyebrow">Ukulele Tuesday</p>
    <h1>
      {#if inSession && view.mode === "full"}
        <button
          id="session-title"
          class="title-button tap-target"
          type="button"
          aria-haspopup="dialog"
          onclick={openSessionDetails}
        >
          {titleHead}<span class="title-tail">
            {titleTail}<Icon name="chevron" extraClass="title-chevron" />
          </span>
        </button>
      {:else}
        {inSession ? session.label : BRAND_TITLE}
      {/if}
    </h1>
  </div>
  <div class="header-actions">
    {#if !inSession}
      <button
        id="whats-new-banner"
        class="whats-new-banner tap-target"
        class:unseen={!bannerSeen}
        type="button"
        hidden={!latest}
        onclick={openWhatsNew}
      >
        <Icon name="news" /><span class="btn-label">What’s new</span>
        <span class="badge badge-dot" aria-hidden="true" hidden={bannerSeen}></span>
      </button>
    {/if}
    <button
      id="share-toggle"
      class="share-toggle icon-button"
      type="button"
      aria-label={shareLabel}
      aria-expanded={!!overlays.share}
      aria-controls="share-panel"
      hidden={!inSession}
      bind:this={shareToggle}
      onclick={onShareTap}
    >
      <Icon name="share" />
      <span id="share-count-badge" class="badge" aria-hidden="true" hidden={shareCount === 0}>
        {shareCount || ""}
      </span>
    </button>
    <button
      id="settings-toggle"
      class="settings-toggle icon-button"
      type="button"
      aria-label="Settings"
      aria-expanded={Boolean(overlays.settings)}
      aria-controls="settings-panel"
      onclick={onSettingsTap}
    >
      <Icon name="settings" />
    </button>
  </div>

  {#if overlays.share}
    <SharePanel
      onclose={() => (overlays.share = false)}
      onShareLink={shareSessionLink}
      onRequestLink={openRequestLink}
      onAddName={openNameSetting}
      openers={() => [shareToggle]}
    />
  {/if}
  {#if overlays.settings}
    <SettingsPanel
      onclose={() => (overlays.settings = false)}
      onName={setPlayerName}
      focusName={overlays.settings === "name"}
    />
  {/if}
</header>

<main>
  {#if inSession}
    <div
      id="session-view"
      class:room={view.room}
      class:fresh={fresh && !recap}
      class:recap
      class:requests-closed={!session.link.open && session.link.soonMinutes === null}
      class:requests-opening-soon={session.link.soonMinutes !== null}
    >
      <!-- Only a way out, never a way to wipe the set for everyone (AGENTS.md). -->
      <div class="session-bar">
        <button id="back-home" class="link-button" type="button" onclick={leaveToHome}>
          <Icon name="back" /><span class="btn-label">All sessions</span>
        </button>
        {#if !session.past}
          <button
            id="window-chip"
            class="window-pill"
            type="button"
            data-state={session.link.status.state}
            aria-haspopup="dialog"
            onclick={openRequestLink}
          >
            {windowChipText(session.link.status, session.now)}<Icon
              name="forward"
              extraClass="window-pill-chevron"
            />
          </button>
        {:else if view.mode === "full"}
          <button
            id="past-edit"
            class="link-button"
            type="button"
            onclick={() => (view.editingPast = !view.editingPast)}
          >
            {#if view.editingPast}
              <Icon name="check" /><span class="btn-label">Done</span>
            {:else}
              <Icon name="edit" /><span class="btn-label">Edit</span>
            {/if}
          </button>
        {/if}
      </div>

      {#if session.meta.blurb}
        <section id="night-note" class="night-note callout" aria-labelledby="night-note-label">
          <p id="night-note-label" class="eyebrow">From the organisers</p>
          <p class="night-note-text">{session.meta.blurb}</p>
        </section>
      {/if}

      {#if recap}
        <Recap
          actions={rowActions}
          canEdit={view.mode === "full"}
          onCopy={copySetlist}
          onDownload={downloadSetlist}
        />
      {:else}
        <p id="past-edit-note" class="past-edit-note callout" hidden={!session.past}>
          Editing a past night. Changes reach everyone who opens it.
        </p>

        <div class="room-top">
          <h2 class="room-purpose">Pick a tune for tonight</h2>
          <p class="room-purpose-sub">
            Choose one from the Ukulele Tuesday songbook and add it to tonight's requests.
          </p>
          <div id="room-add" class="room-add">
            <button
              type="button"
              class="songbook-trigger btn btn-primary btn-lg"
              onclick={() => (overlays.songbook = true)}
            >
              <Icon name="add" /><span class="btn-label">Request a tune</span>
            </button>
          </div>
          <div class="room-rules">
            <span id="room-window" class="window-pill">{roomWindowText(session.link.status)}</span>
            <span>One request a minute</span>
            <!-- "change" reopens the confirm sheet: room mode hides the gear. -->
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

        <!-- No `hidden` here: it would override the mode CSS. -->
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

        <ScanFlow
          bind:this={scanFlow}
          scan={scanBoard}
          onConfirm={addFromBoard}
          onShowPhoto={(imageUrl) => (overlays.photo = imageUrl)}
          {onReviewChange}
        />

        <BinGroup actions={rowActions} />
      {/if}
    </div>
  {:else}
    <section id="home">
      <Home
        onPick={openSession}
        onNewSession={() => {
          notices.home.clear();
          overlays.newSession = true;
        }}
      />
    </section>
  {/if}
</main>

{#if overlays.newSession}
  <NewSessionSheet onStart={startSession} onclose={() => (overlays.newSession = false)} />
{/if}
{#if overlays.requestLink}
  <RequestLinkSheet
    onMode={changeRequestsMode}
    onWindow={changeRequestsWindow}
    onclose={() => (overlays.requestLink = false)}
  />
{/if}
{#if overlays.sessionDetails}
  <SessionDetailsSheet
    onEdition={(editionId) => {
      // At once, so a cached book switch reaches peers even if the refresh
      // never lands.
      scopeCatalogueToEdition(editionId);
      persist();
    }}
    onVisibility={changeVisibility}
    onBlurb={changeBlurb}
    onRequestLink={openRequestLink}
    onclose={() => (overlays.sessionDetails = false)}
  />
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

<footer id="edition-note" class="note" hidden={!inSession || !editionNote}>
  {editionNote}{#if view.mode === "full"}<span class="edition-sep" aria-hidden="true">
      ·
    </span><button
      type="button"
      id="edition-change"
      class="link-button"
      onclick={openSessionDetails}
    >
      Change
    </button>{/if}
</footer>

{#if overlays.photo}
  <PhotoLightbox src={overlays.photo} onclose={() => (overlays.photo = null)} />
{/if}
