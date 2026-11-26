<!--
  A collapsed one-line disclosure ("3 played" / "2 binned") instead of another
  stacked section: on a phone the count is always visible but the rows only
  on demand, so the group costs one row of screen however long the night
  gets. Hidden entirely while empty. Whether it's open is this phone's view
  state: not persisted, not synced.

  The ids and classes are load-bearing: style.css and the e2e suite select on
  them. No scoped <style> here; the global stylesheet stays global.
-->
<script lang="ts">
  import Icon from "./Icon.svelte";
  import RowCard, { type RowActions, type RowContext } from "./Row.svelte";
  import type { IconName } from "./icons.js";
  import type { Row } from "./types.js";

  let {
    id,
    iconName,
    noun,
    rows,
    context,
    actions,
    showSuggestions,
  }: {
    id: string;
    iconName: IconName;
    noun: string;
    rows: Row[];
    context: RowContext;
    actions: RowActions;
    showSuggestions: boolean;
  } = $props();

  let open = $state(false);
</script>

<div {id} class="row-group" hidden={rows.length === 0}>
  {#if rows.length}
    <button
      type="button"
      class="group-toggle"
      aria-expanded={open ? "true" : "false"}
      aria-controls={`${id}-rows`}
      onclick={() => (open = !open)}
    >
      <Icon name={iconName} /><span class="group-label">{rows.length} {noun}</span><Icon
        name="chevron"
        extraClass="group-chevron"
      />
    </button>
    {#if open}
      <ul id={`${id}-rows`} class="group-rows">
        {#each rows as row (row.uid)}
          <RowCard {row} {context} {actions} {showSuggestions} />
        {/each}
      </ul>
    {/if}
  {/if}
</div>
