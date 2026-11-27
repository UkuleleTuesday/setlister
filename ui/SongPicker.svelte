<!-- Not a <datalist>: no dropdown on iOS Safari, flaky on Android. -->
<script module lang="ts">
  // A tap handled at pointerdown still gets a synthesized click up to hundreds
  // of ms later, landing on whatever onPick put under the finger.
  function swallowNextClick() {
    let timer: ReturnType<typeof setTimeout>;
    const swallow = (event: Event) => {
      event.stopPropagation();
      event.preventDefault();
      clearTimeout(timer);
      document.removeEventListener("click", swallow, true);
    };
    document.addEventListener("click", swallow, true);
    // A keyboard pick has no trailing click.
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
    autofocus?: boolean;
    onPick: (entry: CatalogueEntry) => void;
    onMenuChange: (open: boolean) => void;
  } = $props();

  // Short: the menu hangs under a field the keyboard is already squeezing.
  const LIMIT = 8;

  const uid = $props.id();
  const menuId = `song-picker-menu-${uid}`;
  let query = $state("");
  let typing = $state(false);
  let active = $state(-1);

  const matches = $derived(
    query.trim() ? searchSongs(catalogue, query, { limit: LIMIT }) : ([] as CatalogueEntry[]),
  );
  const tonight = $derived(indexTonight(upNext, requests));
  const menuOpen = $derived(typing && (matches.length > 0 || query.trim() !== ""));

  $effect(() => {
    onMenuChange(menuOpen);
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

  function setQuery(value: string) {
    query = value;
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
    bind:value={() => query, setQuery}
    {@attach (el) => {
      if (autofocus) el.focus();
    }}
    onkeydown={onKeydown}
    onblur={onBlur}
  />
  <ul class="song-picker-menu" id={menuId} role="listbox" hidden={!menuOpen}>
    {#if menuOpen && matches.length}
      {#each matches as entry, i (i)}
        {@const existing = tonight.get(matchKey(entry))}
        <!-- pointerdown fires before the input's blur, so the pick lands first. -->
        <li
          id={`${menuId}-opt-${i}`}
          class={["song-picker-option", { active: i === active }]}
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
