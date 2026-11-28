<script lang="ts">
  import Icon from "./Icon.svelte";
  import RowCard, { type RowActions } from "./Row.svelte";
  import { workingRequests } from "./gig-state.js";
  import { lists, rowVote } from "./lists.svelte.js";
  import { night } from "./night.svelte.js";
  import { notices } from "./notices.svelte.js";
  import { sortForDisplay } from "./votes.js";

  let {
    actions,
    onAddTune,
    onSnap,
    snapDisabled,
  }: {
    actions: RowActions;
    onAddTune: () => void;
    onSnap: () => void;
    snapDisabled: boolean;
  } = $props();

  const visible = $derived(workingRequests(night.requests));
  const sorted = $derived(sortForDisplay(visible, night.votes));

  // The room has no camera, and a closed link has no way in to point at.
  const emptyText = $derived(
    lists.room
      ? lists.roomOpen
        ? "No requests yet. Be the first: tap Request a tune."
        : "No requests yet."
      : "No requests yet. Snap the board, or add one above.",
  );
</script>

<section id="requests">
  <h2 class="eyebrow">
    Requests <span id="requests-count" class="count" hidden={visible.length === 0}>
      · {visible.length}
    </span>
  </h2>
  <!-- A closed room can't vote, so no hint about thumbs. -->
  <p
    id="requests-hint"
    class="list-hint"
    hidden={visible.length === 0 || !lists.room || !lists.roomOpen}
  >
    Thumbs up the ones you want to hear.
  </p>
  <!-- Pinned to the bottom of the screen (style.css), so a shouted request
       goes in from anywhere in the lists. -->
  <div id="manual-add" class="manual-add">
    <button type="button" class="songbook-trigger btn btn-primary btn-lg" onclick={onAddTune}>
      <Icon name="add" /><span class="btn-label">Add a tune</span>
    </button>
    <!-- A button, not a <label> for the file input, so keyboards and switch
         access can use it. -->
    <button
      id="camera-button"
      class="camera-button btn btn-soft btn-lg"
      type="button"
      disabled={snapDisabled}
      onclick={onSnap}
    >
      <Icon name="camera" /><span class="btn-label">Snap the board</span>
    </button>
  </div>
  <!-- Shown by mode CSS only, not `hidden`, so a room device loading a closed
       session never flashes a control it can't use. -->
  <p id="requests-closed-note" class="requests-closed-note note">
    {lists.closedNote}
  </p>
  <p id="requests-opening-soon-note" class="requests-opening-soon-note note">
    {lists.openingSoon}
  </p>
  <p
    id="add-feedback"
    class="flash-note callout"
    aria-live="polite"
    hidden={!notices.requests.text}
  >
    {notices.requests.text}
  </p>
  <ul id="requests-rows">
    {#each sorted as row (row.uid)}
      <RowCard {row} context={lists.room ? "room" : "requests"} {actions} vote={rowVote(row)} />
    {/each}
  </ul>
  <p id="requests-empty" class="note" hidden={visible.length > 0}>{emptyText}</p>
</section>
