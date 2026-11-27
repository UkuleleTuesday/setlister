<!-- A past night, read-only: what got played, in order. Edit (App.svelte)
     brings back the full tools. -->
<script lang="ts">
  import ExportActions from "./ExportActions.svelte";
  import RowCard, { type RowActions } from "./Row.svelte";
  import RowGroup from "./RowGroup.svelte";
  import { night } from "./night.svelte.js";
  import { playedOrder } from "./recap.js";
  import { sortForDisplay } from "./votes.js";

  let {
    actions,
    canEdit,
    onCopy,
    onDownload,
  }: {
    actions: RowActions;
    canEdit: boolean;
    onCopy: () => Promise<void>;
    onDownload: () => void;
  } = $props();

  const played = $derived(playedOrder(night.upNext));
  // Queue first, as it was the nearer miss.
  const unplayed = $derived([
    ...night.upNext.filter((row) => !row.played && !row.binned),
    ...sortForDisplay(
      night.requests.filter((row) => !row.binned),
      night.votes,
    ),
  ]);
</script>

<section id="recap">
  <p id="recap-note" class="recap-note">
    This night is over. Here’s what got played.
    {#if canEdit && played.length}Spot a mistake? Tap Edit.{/if}
  </p>

  <div class="setlist-head">
    <h2 class="eyebrow">
      Played <span id="recap-count" class="count" hidden={played.length === 0}>
        · {played.length}
      </span>
    </h2>
    <ExportActions {onCopy} {onDownload} />
  </div>
  <ol id="recap-rows" class="recap-list numbered">
    {#each played as row (row.uid)}
      <RowCard {row} context="recap" {actions} />
    {/each}
  </ol>
  <p id="recap-empty" class="note" hidden={played.length > 0}>
    {canEdit
      ? "Nothing was ticked off on this night. Tap Edit to add what was played."
      : "Nothing was ticked off on this night."}
  </p>

  <RowGroup
    id="unplayed-group"
    iconName="unplayed"
    noun="not played"
    rows={unplayed}
    context="recap"
    {actions}
  />
</section>
