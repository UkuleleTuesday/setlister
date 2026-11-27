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

{#if rows.length}
  <div {id} class="row-group">
    <button
      type="button"
      class="group-toggle"
      aria-expanded={open}
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
  </div>
{/if}
