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
    startOpen = false,
    numbered = false,
  }: {
    id: string;
    iconName: IconName;
    noun: string;
    rows: Row[];
    context: RowContext;
    actions: RowActions;
    startOpen?: boolean;
    numbered?: boolean;
  } = $props();

  // Only the first value counts: a later change mustn't fold a list in use.
  // svelte-ignore state_referenced_locally
  let open = $state(startOpen);
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
      <svelte:element
        this={numbered ? "ol" : "ul"}
        id={`${id}-rows`}
        class="group-rows"
        class:numbered
      >
        {#each rows as row, i (row.uid)}
          <RowCard {row} {context} {actions} first={i === 0} last={i === rows.length - 1} />
        {/each}
      </svelte:element>
    {/if}
  </div>
{/if}
