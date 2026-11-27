<!--
  A browsable list, not a blank type-ahead: people rarely know an exact title.
  adds.ts's pickSong decides what a pick does and answers via notices.songbook.
-->
<script lang="ts">
  import { onMount, tick } from "svelte";
  import Icon from "./Icon.svelte";
  import Sheet from "./Sheet.svelte";
  import { indexTonight, matchKey } from "./dupes.js";
  import { catalogue } from "./catalogue.svelte.js";
  import { night } from "./night.svelte.js";
  import { notices } from "./notices.svelte.js";
  import * as presence from "./presence.js";
  import { readLastRoomAdd, cooldownRemaining } from "./room-limits.js";
  import { searchSongs } from "./search.js";
  import { catalogueEmptyMessage, tonightTagLabel } from "./songbook.js";
  import type { CatalogueEntry } from "./types.js";
  import { view } from "./view.svelte.js";
  import { hasVoted, voteCount } from "./votes.js";

  let { onPick, onclose }: { onPick: (entry: CatalogueEntry) => void; onclose: () => void } =
    $props();

  let query = $state("");
  let waiting = $state(false);
  // Replaces the wait line while shown: the cool-down note says the same, with
  // the number.
  const status = $derived(notices.songbook.text);
  let waitTimer: ReturnType<typeof setTimeout> | undefined;

  let search: HTMLInputElement | undefined = $state();
  let list: HTMLUListElement | undefined = $state();
  let closeButton: HTMLButtonElement | undefined = $state();

  const songs = $derived(query.trim() ? searchSongs(catalogue.entries, query) : catalogue.entries);
  const tonight = $derived(indexTonight(night.upNext, night.requests));
  const rows = $derived(
    songs.map((entry) => {
      const existing = tonight.get(matchKey(entry));
      if (!existing) return { entry, existing, count: 0, mine: false, state: "" };
      if (existing.where === "played") {
        return { entry, existing, count: 0, mine: false, state: ", played tonight" };
      }
      const count = voteCount(night.votes, existing.row.uid);
      const mine = hasVoted(night.votes, existing.row.uid, presence.getClientId());
      const state =
        `, ${existing.where === "upnext" ? "in Up next" : "requested"}, ` +
        `${count} ${count === 1 ? "person wants" : "people want"} it` +
        (mine ? ", including you" : "");
      return { entry, existing, count, mine, state };
    }),
  );

  // Focus Close, not the search field: that would raise the keyboard over the list.
  onMount(() => {
    notices.songbook.clear();
    refreshWait();
    closeButton?.focus({ preventScroll: true });
    return () => {
      notices.songbook.clear();
      clearTimeout(waitTimer);
    };
  });

  // No number in the wait line: a still one goes stale, a ticking one chatters
  // at screen readers. The tap's note has the exact wait.
  function refreshWait() {
    clearTimeout(waitTimer);
    const remaining = view.mode === "room" ? cooldownRemaining(readLastRoomAdd(), Date.now()) : 0;
    waiting = remaining > 0;
    if (remaining) waitTimer = setTimeout(refreshWait, remaining + 50);
  }

  async function setQuery(value: string) {
    query = value;
    await tick();
    if (list) list.scrollTop = 0;
  }

  // The search key drops the keyboard to reveal the results it covered.
  function onSearchKeydown(event: KeyboardEvent) {
    if (event.key === "Enter") search?.blur();
  }

  // touchmove, not scroll: the list also scrolls programmatically as you type.
  function onListTouchmove() {
    if (document.activeElement === search) search?.blur();
  }
</script>

<Sheet id="songbook-sheet" labelledby="songbook-title" {onclose}>
  <h2 id="songbook-title">The songbook</h2>
  <input
    type="search"
    id="songbook-search"
    class="song-picker-input"
    placeholder="Title, artist or page"
    autocomplete="off"
    enterkeyhint="search"
    aria-label="Search the songbook"
    bind:value={() => query, setQuery}
    bind:this={search}
    onkeydown={onSearchKeydown}
  />
  <p id="songbook-wait" class="note songbook-wait" hidden={!waiting || Boolean(status)}>
    Your next request opens up shortly. Thumbs up work any time.
  </p>
  <p id="songbook-status" class="songbook-status callout" aria-live="polite" hidden={!status}>
    {status}
  </p>
  <ul id="songbook-list" class="songbook-list" bind:this={list} ontouchmove={onListTouchmove}>
    {#each rows as { entry, existing, count, mine, state }, i (i)}
      <li>
        <!-- click, not pointerdown: a scroll starting on a row would pick it. -->
        <button
          type="button"
          class={["songbook-song", existing?.where]}
          aria-label={`${entry.display}, page ${entry.page}${state}`}
          onclick={() => onPick(entry)}
        >
          <span class="songbook-text">
            <span class="songbook-title">
              {entry.title || entry.display}
            </span>{#if entry.artist}<span class="songbook-artist">{entry.artist}</span>{/if}
          </span><span class="songbook-side">
            {#if existing?.where === "played"}<span class="tonight-tag">
                {tonightTagLabel("played")}
              </span>{:else if existing}<span class="tonight-tag" class:voted={mine}>
                <Icon name="want" />{` ${count} · ${tonightTagLabel(existing.where)}`}
              </span>{/if}<span class="page-badge">p.{entry.page}</span>
          </span>
        </button>
      </li>
    {/each}
  </ul>
  <p id="songbook-empty" class="note songbook-empty" hidden={songs.length > 0}>
    {songs.length ? "" : catalogueEmptyMessage(catalogue.status, query)}
  </p>
  <div class="actions">
    <button
      id="songbook-close"
      class="btn btn-soft"
      type="button"
      bind:this={closeButton}
      onclick={onclose}
    >
      Close
    </button>
  </div>
</Sheet>
