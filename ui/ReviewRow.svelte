<!--
  One scanned row in the review sheet: the validation surface, so it always
  shows what the board said next to what it was matched to, with the means to
  fix it (the correct-song picker, the alternatives) or drop it.

  Review rows use the stacked layout (their tools row carries a full-width
  picker) and never swipe, so they're their own component rather than a mode
  of the working lists' rows. Every change goes up through the props; the
  parent (ScanFlow.svelte) owns the rows.

  The ids and classes are load-bearing: style.css and the e2e suite select on
  them. No scoped <style> here; the global stylesheet stays global.
-->
<script lang="ts">
  import Icon from "./Icon.svelte";
  import SongPicker from "./SongPicker.svelte";
  import { type Duplicate, duplicateLabel } from "./dupes.js";
  import type { CatalogueStatus } from "./songbook.js";
  import type { CatalogueEntry, Row } from "./types.js";
  import { sourceLabel } from "./view-mode.js";

  let {
    row,
    duplicate,
    showSuggestions,
    catalogue,
    catalogueStatus,
    upNext,
    requests,
    onShowPhoto,
    onSetMatch,
    onToggleRemoved,
  }: {
    row: Row;
    /** The copy already on the night's lists, computed live (#52). */
    duplicate: Duplicate | null;
    showSuggestions: boolean;
    catalogue: CatalogueEntry[];
    catalogueStatus: CatalogueStatus;
    upNext: Row[];
    requests: Row[];
    onShowPhoto: () => void;
    onSetMatch: (entry: CatalogueEntry) => void;
    onToggleRemoved: () => void;
  } = $props();

  // The correct-song picker. A confident match rarely needs correcting, and
  // the picker roughly doubles a row's height, burying the few rows that do
  // need attention. So confirmed rows collapse it behind a button (which
  // swaps in the picker, focused), flagged ones show it, and a correction
  // (which confirms the row) collapses it again.
  let pickerExpanded = $state(false);
  // The dropdown has to escape its card, but `.row-body`'s z-index (for the
  // swipe layer) makes every card its own stacking context, so the NEXT card
  // would paint over the menu. Lift the whole card while it's open.
  let menuOpen = $state(false);

  // A match the parser wasn't sure of gets a warning that opens the photo.
  // (The space before it is part of the title text: Svelte would trim one
  // written at the start of the {#if}.)
  const flagged = $derived(Boolean(row.match) && row.status !== "confirmed");
  const reason = $derived(row.explanation || "Needs a check");
  const raw = $derived(
    `wrote: “${row.raw_title}”` +
      (row.raw_page ? ` · p.${row.raw_page}` : " · no page") +
      (row.notes ? ` · ${row.notes}` : "") +
      (row.crossed_out ? " · crossed out" : ""),
  );
  // Provenance: who added this tune and where it came from. Name it only when
  // there's a name (a name-less entry shows just the source).
  const provenance = $derived(
    row.addedBy ? `Added by ${row.addedBy} · ${sourceLabel(row.source)}` : sourceLabel(row.source),
  );
  const confidence = $derived(
    row.confidence && row.status === "confirmed" ? ` (${Math.round(row.confidence * 100)}%)` : "",
  );

  function setMatch(entry: CatalogueEntry) {
    pickerExpanded = false;
    onSetMatch(entry);
  }
</script>

<li
  class={`row-card ${row.status}`}
  class:crossed={row.crossed_out}
  class:removed={row.removed}
  class:played={row.played}
  class:binned={row.binned}
  class:picker-open={menuOpen}
  data-uid={row.uid}
>
  <div class="row-body">
    <div class="row-main">
      <div class="row-top">
        <span class="match-title">
          {(row.match ? row.match.display : `“${row.raw_title}”`) +
            (flagged ? " " : "")}{#if flagged}<button
              type="button"
              class="warn-icon"
              title={`${reason}. Tap to see the photo`}
              aria-label={`${reason}. Show the scanned photo to check this match.`}
              onclick={onShowPhoto}
            >
              <Icon name="warn" />
            </button>{/if}
        </span>{#if row.match}<span class="page-badge">p.{row.match.page}</span>{/if}
      </div>
      <!-- Always what the board said, so a match can be judged against the
           handwriting. -->
      <div class="raw">{raw}</div>
      <div class="added-by">{provenance}</div>
      {#if row.explanation}
        <div class="explanation">{row.explanation + confidence}</div>
      {/if}
      <!-- Rows that were duplicates at scan time arrive pre-removed; this
           line is why, and restore is the deliberate way back in. Computed
           live, so a correction to an already-listed song shows at once. -->
      {#if row.match && duplicate}
        <div class="dup-note">{duplicateLabel(duplicate.where)}</div>
      {/if}
      {#if showSuggestions && row.alternatives?.length && !row.removed}
        <div class="chips">
          {#each row.alternatives as alt, i (i)}
            <button onclick={() => setMatch(alt.entry)}>
              {alt.entry.title} (p.{alt.entry.page})
            </button>
          {/each}
        </div>
      {/if}
    </div>
    <div class="row-tools">
      {#if row.status === "confirmed" && !pickerExpanded}
        <button
          type="button"
          class="picker-toggle"
          title="Change song"
          aria-label={`Change song for “${row.raw_title}”`}
          onclick={() => (pickerExpanded = true)}
        >
          <Icon name="edit" />
        </button>
      {:else}
        <SongPicker
          placeholder="Correct song…"
          {catalogue}
          {catalogueStatus}
          {upNext}
          {requests}
          autofocus={pickerExpanded}
          onPick={setMatch}
          onMenuChange={(open) => (menuOpen = open)}
        />
      {/if}
      <button
        title={row.removed ? "Restore row" : "Remove row"}
        aria-label={row.removed ? "Restore row" : "Remove row"}
        onclick={onToggleRemoved}
      >
        <Icon name={row.removed ? "restore" : "bin"} />
      </button>
    </div>
  </div>
</li>
