<!--
  The way to add by name, in both modes: the whole songbook, browsable. At the
  club people rarely know an exact title ("that Beatles one", "p.42"), so a
  blank type-ahead asks for recall they don't have; a list lets them
  recognise the tune instead, in the printed book's page order. Every row
  carries tonight's state, so "already asked for" becomes a thumbs up rather
  than a refusal after the tap. Same pinned-chrome layout as What's new: it
  runs several screens long, so Close stays under the thumb.

  It shows the catalogue tagged with the night as it stands, and reports picks
  through `onPick`; what a pick DOES (thumbs up, played note, cool-down, the
  confirm sheet) is adds.ts's, which answers with a note (notices.songbook) or
  by closing the sheet. Matching is search.ts, tonight's state dupes.ts and
  votes.ts, the brake room-limits.ts.

  The ids and classes are load-bearing: style.css and the e2e suite select on
  them. No scoped <style> here; the global stylesheet stays global.
-->
<script lang="ts">
  import { tick, untrack } from "svelte";
  import Icon from "./Icon.svelte";
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

  let {
    open = $bindable(false),
    onPick,
  }: { open?: boolean; onPick: (entry: CatalogueEntry) => void } = $props();

  let query = $state("");
  let waiting = $state(false);
  // Why a tap didn't add, said in the sheet the person is looking at. It
  // stands in for the wait line while shown: the cool-down note says the same
  // thing with the number in it.
  const status = $derived(notices.songbook.text);
  let waitTimer: ReturnType<typeof setTimeout> | undefined;

  let search: HTMLInputElement | undefined = $state();
  let list: HTMLUListElement | undefined = $state();
  let closeButton: HTMLButtonElement | undefined = $state();

  const songs = $derived(query.trim() ? searchSongs(catalogue.entries, query) : catalogue.entries);
  // Peers keep adding, voting and playing while the sheet is open: the book
  // re-tags in place, so the reader keeps their scroll.
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

  // Each opening starts at the top of an unfiltered book.
  $effect.pre(() => {
    if (!open) return;
    untrack(() => {
      query = "";
      notices.songbook.clear();
      refreshWait();
    });
  });

  // Not the search field: focusing it raises the keyboard over the list, and
  // browsing is the point. Typing is one tap away at the top.
  $effect(() => {
    if (!open) return;
    untrack(() => {
      if (list) list.scrollTop = 0;
      closeButton?.focus({ preventScroll: true });
    });
  });

  // However it closes (here, or a pick that moved on to the confirm sheet),
  // any note still up goes with it, along with the wait's timer.
  $effect(() => {
    if (open) return;
    untrack(() => {
      search?.blur();
      notices.songbook.clear();
      clearTimeout(waitTimer);
    });
  });

  function close() {
    open = false;
  }

  // The wait between requests, told up front rather than discovered on a
  // tap. No number in it: a figure that sat still for a minute would be
  // wrong, and a ticking one would chatter at screen readers. The exact wait
  // comes with the tap (note()). Re-checked once, when the wait runs out.
  function refreshWait() {
    clearTimeout(waitTimer);
    const remaining = view.mode === "room" ? cooldownRemaining(readLastRoomAdd(), Date.now()) : 0;
    waiting = remaining > 0;
    if (remaining) waitTimer = setTimeout(refreshWait, remaining + 50);
  }

  async function onSearch(event: Event) {
    query = (event.currentTarget as HTMLInputElement).value;
    await tick();
    if (list) list.scrollTop = 0;
  }

  // The keyboard's search key means "show me": drop the keyboard so the
  // results it was covering come into view.
  function onSearchKeydown(event: KeyboardEvent) {
    if (event.key === "Enter") search?.blur();
  }

  // Dragging the list means reading it, so put the keyboard away. touchmove,
  // not scroll: the list also scrolls programmatically as you type.
  function onListTouchmove() {
    if (document.activeElement === search) search?.blur();
  }

  function onBackdrop(event: MouseEvent) {
    if (event.target === event.currentTarget) close();
  }

  function onKeydown(event: KeyboardEvent) {
    if (event.key === "Escape" && open) close();
  }
</script>

<svelte:document onkeydown={onKeydown} />

<!-- The backdrop's click is the tap-outside shortcut, not the accessible way
     out: Close is a real button, and Escape is handled on the document. -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<div
  id="songbook-sheet"
  class="sheet-backdrop"
  hidden={!open}
  role="dialog"
  aria-modal="true"
  aria-labelledby="songbook-title"
  tabindex="-1"
  onclick={onBackdrop}
>
  <div class="sheet">
    <h2 id="songbook-title">The songbook</h2>
    <input
      type="search"
      id="songbook-search"
      class="song-picker-input"
      placeholder="Title, artist or page"
      autocomplete="off"
      enterkeyhint="search"
      aria-label="Search the songbook"
      value={query}
      bind:this={search}
      oninput={onSearch}
      onkeydown={onSearchKeydown}
    />
    <!-- Shown while this phone's one-a-minute wait runs: new requests pause,
         browsing and thumbs up don't. -->
    <p id="songbook-wait" class="note songbook-wait" hidden={!waiting || Boolean(status)}>
      Your next request opens up shortly. Thumbs up work any time.
    </p>
    <!-- Why a tap didn't add. aria-live so it reaches screen readers without
         moving focus. -->
    <p id="songbook-status" class="songbook-status" aria-live="polite" hidden={!status}>
      {status}
    </p>
    <ul id="songbook-list" class="songbook-list" bind:this={list} ontouchmove={onListTouchmove}>
      {#each rows as { entry, existing, count, mine, state }, i (i)}
        <li>
          <!-- click, not pointerdown: in a list you scroll with the same
               finger, and a pick on touch-down would fire on every scroll
               that starts on a row. -->
          <button
            type="button"
            class={existing ? `songbook-song ${existing.where}` : "songbook-song"}
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
        class="secondary"
        type="button"
        bind:this={closeButton}
        onclick={close}
      >
        Close
      </button>
    </div>
  </div>
</div>
