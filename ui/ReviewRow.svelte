<script lang="ts">
  import Icon from "./Icon.svelte";
  import SongPicker from "./SongPicker.svelte";
  import { type Duplicate, duplicateLabel } from "./dupes.js";
  import { features } from "./features.js";
  import { alternativesOf } from "./row-shape.js";
  import type { CatalogueStatus } from "./songbook.js";
  import type { CatalogueEntry, Row } from "./types.js";
  import { sourceLabel } from "./view-mode.js";

  let {
    row,
    duplicate,
    catalogue,
    catalogueStatus,
    upNext,
    requests,
    onShowPhoto,
    onSetMatch,
    onToggleRemoved,
  }: {
    row: Row;
    duplicate: Duplicate | null;
    catalogue: CatalogueEntry[];
    catalogueStatus: CatalogueStatus;
    upNext: Row[];
    requests: Row[];
    onShowPhoto: () => void;
    onSetMatch: (entry: CatalogueEntry) => void;
    onToggleRemoved: () => void;
  } = $props();

  // The picker roughly doubles a row's height, burying the rows that need
  // attention, so confirmed rows keep it behind a button.
  let pickerExpanded = $state(false);
  // Lifts the card so the next one doesn't paint over the menu (.picker-open).
  let menuOpen = $state(false);

  // The space before the warning is part of the title text: Svelte would trim
  // one written at the start of the {#if}.
  const flagged = $derived(Boolean(row.match) && row.status !== "confirmed");
  const reason = $derived(row.explanation || "Needs a check");
  // Only where the reader wasn't sure: a clean match needs no second guess.
  const suggestions = $derived(
    features.reviewSuggestions && row.status !== "confirmed" && !row.removed
      ? alternativesOf(row)
      : [],
  );
  const raw = $derived(
    `wrote: “${row.raw_title}”` +
      (row.raw_page ? ` · p.${row.raw_page}` : " · no page") +
      (row.notes ? ` · ${row.notes}` : "") +
      (row.crossed_out ? " · crossed out" : ""),
  );
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
  class={["row-card", row.status]}
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
      <div class="raw">{raw}</div>
      <div class="added-by">{provenance}</div>
      {#if row.explanation}
        <div class="explanation">{row.explanation + confidence}</div>
      {/if}
      <!-- Scan-time duplicates arrive pre-removed; this line says why. -->
      {#if row.match && duplicate}
        <div class="dup-note">{duplicateLabel(duplicate.where)}</div>
      {/if}
      {#if suggestions.length}
        <div class="chips">
          <span class="chips-label">Or was it</span>
          {#each suggestions as alt, i (i)}
            <button
              type="button"
              aria-label={`Change to ${alt.entry.display}, page ${alt.entry.page}`}
              onclick={() => setMatch(alt.entry)}
            >
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
