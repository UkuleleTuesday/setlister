<!--
  "Requests": the incoming pool. Everything added by name or snapped off the
  board lands here first, then gets promoted up into the set. Most wanted
  first (#83), for display only: the stored order stays arrival order,
  because rewriting that whole-array last-writer-wins field on every vote
  would fight every concurrent edit in the room.

  It renders from app.js's ListsData and hands every change back through
  `actions`. The camera and songbook buttons open the scan flow and the
  songbook, which live elsewhere.

  The ids and classes are load-bearing: style.css and the e2e suite select on
  them. No scoped <style> here; the global stylesheet stays global.
-->
<script lang="ts">
  import Icon from "./Icon.svelte";
  import RowCard, { type RowActions } from "./Row.svelte";
  import { EMPTY_LISTS, type ListsData, rowVote } from "./lists.js";
  import { sortForDisplay } from "./votes.js";

  let {
    actions,
    onAddTune,
    onSnap,
  }: {
    actions: RowActions;
    /** "Add a tune": open the songbook. */
    onAddTune: () => void;
    /** "Snap the board": open the camera. */
    onSnap: () => void;
  } = $props();

  // Long enough to read across the room, gone before it reads as a permanent
  // fixture.
  const FLASH_MS = 8000;

  let data: ListsData = $state.raw(EMPTY_LISTS);
  let feedback = $state("");
  let feedbackTimer: ReturnType<typeof setTimeout> | undefined;

  const visible = $derived(data.requests.filter((e) => !e.binned));
  // The sort is stable, so a tie keeps arrival order rather than reshuffling
  // the pool under the MC's thumb.
  const sorted = $derived(sortForDisplay(visible, data.votes));

  // The empty note mentions snapping the board, but the room has no camera:
  // there, adding by name is the only door, and once requests are closed
  // (#86) there's no door at all, so pointing at one would be a lie.
  const emptyText = $derived(
    data.room
      ? data.roomOpen
        ? "No requests yet. Be the first: tap Request a tune."
        : "No requests yet."
      : "No requests yet. Snap the board, or add one above.",
  );

  /** Fresh lists from app.js. */
  export function setData(next: ListsData) {
    data = next;
  }

  /** Why a quick add did or didn't land ("Already in Up next", #52). */
  export function flash(message: string) {
    feedback = message;
    clearTimeout(feedbackTimer);
    feedbackTimer = setTimeout(() => (feedback = ""), FLASH_MS);
  }
</script>

<section id="requests">
  <h2>
    Requests <span id="requests-count" class="count" hidden={visible.length === 0}>
      · {visible.length}
    </span>
  </h2>
  <!-- Players vote, organisers promote. A closed room can't vote, so it gets
       no hint about thumbs. -->
  <p
    id="requests-hint"
    class="list-hint"
    hidden={visible.length === 0 || (data.room && !data.roomOpen)}
  >
    {data.room
      ? "Thumbs up the ones you want to hear."
      : "Most wanted first. Move one up when it's time."}
  </p>
  <!-- Full app only: both ways in, side by side at the TOP of the pool.
       Mid-night someone shouts a request and it has to go in without
       scrolling past twenty cards; the board gets snapped from the same spot.
       The request view has its own add button up in .room-top. -->
  <div id="manual-add" class="manual-add">
    <button type="button" class="songbook-trigger" onclick={onAddTune}>
      <Icon name="add" /><span class="btn-label">Add a tune</span>
    </button>
    <!-- A real button (not a label) so it's reachable and activatable with a
         keyboard or switch access; it opens the scan flow's file input. -->
    <button id="camera-button" class="camera-button" type="button" onclick={onSnap}>
      <Icon name="camera" /><span class="btn-label">Snap the board</span>
    </button>
  </div>
  <!-- What replaces the add button once the request link closes (#86). Room
       mode only, and shown purely by the mode CSS (no hidden attribute) so a
       room device that loads a closed session never flashes a control it
       can't use. The pool below stays: the room still gets to watch. -->
  <p id="requests-closed-note" class="requests-closed-note note">
    Requests are closed here for tonight. Pop your tune on the whiteboard of wishes instead.
  </p>
  <!-- 30 minutes before the window opens, room devices see this instead of
       the closed note above: same mode-CSS swap, one extra state. -->
  <p id="requests-opening-soon-note" class="requests-opening-soon-note note">
    {data.openingSoon}
  </p>
  <!-- Why a quick add didn't add a row, or that it did. aria-live so it
       reaches screen readers without moving focus. -->
  <p id="add-feedback" class="flash-note" aria-live="polite" hidden={!feedback}>{feedback}</p>
  <!-- Room mode gets read-only rows apart from the want button. -->
  <ul id="requests-rows">
    {#each sorted as row (row.uid)}
      <RowCard
        {row}
        context={data.room ? "room" : "requests"}
        {actions}
        vote={rowVote(data, row)}
        showSuggestions={data.showSuggestions}
      />
    {/each}
  </ul>
  <p id="requests-empty" class="note" hidden={visible.length > 0}>{emptyText}</p>
</section>
