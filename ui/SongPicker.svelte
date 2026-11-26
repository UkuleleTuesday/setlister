<!--
  A small custom combobox for picking a song: the review sheet's per-row
  correction picker. Hand-rolled rather than a native <datalist>, because
  datalist support is unreliable on the mobile browsers this app targets (no
  dropdown on iOS Safari, flaky on Android).

  The ids and classes are load-bearing: style.css and the e2e suite select on
  them. No scoped <style> here; the global stylesheet stays global.
-->
<script module lang="ts">
  // A tap handled at pointerdown still leaves the browser to synthesize a
  // trailing click from the same gesture, tens to hundreds of milliseconds
  // later. By then onPick may have put something new under that point, and
  // the stray click lands on it as a phantom second tap. One gesture is one
  // interaction: swallow that trailing click.
  function swallowNextClick() {
    let timer: ReturnType<typeof setTimeout>;
    const swallow = (event: Event) => {
      event.stopPropagation();
      event.preventDefault();
      clearTimeout(timer);
      document.removeEventListener("click", swallow, true);
    };
    document.addEventListener("click", swallow, true);
    // Nothing to swallow when the pick came from the keyboard: retire quietly.
    timer = setTimeout(() => document.removeEventListener("click", swallow, true), 700);
  }
</script>

<script lang="ts">
  import { indexTonight, matchKey } from "./dupes.js";
  import { searchSongs } from "./search.js";
  import { type CatalogueStatus, catalogueEmptyMessage, tonightTagLabel } from "./songbook.js";
  import type { CatalogueEntry, Row } from "./types.js";

  let {
    placeholder,
    catalogue,
    catalogueStatus,
    upNext,
    requests,
    autofocus = false,
    onPick,
    onMenuChange,
  }: {
    placeholder: string;
    catalogue: CatalogueEntry[];
    catalogueStatus: CatalogueStatus;
    upNext: Row[];
    requests: Row[];
    /** Focus the field on mount (opened from a "Change song" tap). */
    autofocus?: boolean;
    onPick: (entry: CatalogueEntry) => void;
    /** The menu opened or closed: the row lifts itself above its neighbours. */
    onMenuChange: (open: boolean) => void;
  } = $props();

  // The dropdown keeps a short list: it hangs under a field the keyboard is
  // already squeezing.
  const LIMIT = 8;

  const uid = $props.id();
  const menuId = `song-picker-menu-${uid}`;
  let query = $state("");
  // Opened by typing, closed by a pick, Escape or leaving the field. While
  // open, the matches follow the catalogue: text typed during a slow load
  // must not silently read as "no such song" once the book arrives.
  let typing = $state(false);
  let active = $state(-1);
  let input: HTMLInputElement | undefined = $state();

  const matches = $derived(
    query.trim() ? searchSongs(catalogue, query, { limit: LIMIT }) : ([] as CatalogueEntry[]),
  );
  const tonight = $derived(indexTonight(upNext, requests));
  const menuOpen = $derived(typing && (matches.length > 0 || query.trim() !== ""));

  $effect(() => {
    onMenuChange(menuOpen);
  });

  $effect(() => {
    if (autofocus) input?.focus();
  });

  function close() {
    typing = false;
    active = -1;
  }

  function pick(entry: CatalogueEntry) {
    query = "";
    close();
    swallowNextClick();
    onPick(entry);
  }

  function onInput(event: Event) {
    query = (event.currentTarget as HTMLInputElement).value;
    typing = true;
    active = -1;
  }

  function onKeydown(event: KeyboardEvent) {
    if (!menuOpen) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      active = Math.min(active + 1, matches.length - 1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      active = Math.max(active - 1, 0);
    } else if (event.key === "Enter" && active >= 0) {
      event.preventDefault();
      pick(matches[active]);
    } else if (event.key === "Escape") {
      close();
    }
  }

  // Delay so a pending option pointerdown can win the race with blur.
  function onBlur() {
    setTimeout(close, 120);
  }
</script>

<div class="song-picker">
  <input
    class="song-picker-input"
    type="text"
    {placeholder}
    autocomplete="off"
    role="combobox"
    aria-autocomplete="list"
    aria-expanded={menuOpen}
    aria-controls={menuId}
    aria-activedescendant={menuOpen && matches.length && active >= 0
      ? `${menuId}-opt-${active}`
      : undefined}
    value={query}
    bind:this={input}
    oninput={onInput}
    onkeydown={onKeydown}
    onblur={onBlur}
  />
  <ul class="song-picker-menu" id={menuId} role="listbox" hidden={!menuOpen}>
    {#if menuOpen && matches.length}
      {#each matches as entry, i (i)}
        {@const existing = tonight.get(matchKey(entry))}
        <!-- pointerdown fires before the input's blur, so the pick registers
             instead of the field closing first (mouse and touch alike). -->
        <li
          id={`${menuId}-opt-${i}`}
          class={i === active ? "song-picker-option active" : "song-picker-option"}
          role="option"
          aria-selected={i === active ? "true" : "false"}
          onpointerdown={(event) => {
            event.preventDefault();
            pick(entry);
          }}
        >
          <span class="song-picker-name">{entry.display}</span>{#if existing}<span
              class="tonight-tag"
            >
              {tonightTagLabel(existing.where)}
            </span>{/if}<span class="page-badge">p.{entry.page}</span>
        </li>
      {/each}
    {:else if menuOpen}
      <li class="song-picker-status">{catalogueEmptyMessage(catalogueStatus, query)}</li>
    {/if}
  </ul>
</div>
