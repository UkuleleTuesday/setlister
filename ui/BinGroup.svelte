<!--
  The bin: every binned row from both lists, collapsed to one line at the
  foot of the session view. Binned rows stay in their home arrays, so
  un-binning restores each one in place. A thin wrapper over RowGroup that
  takes main.ts's ListsData like the two sections do.
-->
<script lang="ts">
  import type { RowActions } from "./Row.svelte";
  import RowGroup from "./RowGroup.svelte";
  import { EMPTY_LISTS, type ListsData } from "./lists.js";

  let { actions }: { actions: RowActions } = $props();

  let data: ListsData = $state.raw(EMPTY_LISTS);
  const binned = $derived([...data.upNext, ...data.requests].filter((e) => e.binned));

  /** Fresh lists from main.ts. */
  export function setData(next: ListsData) {
    data = next;
  }
</script>

<RowGroup
  id="bin-group"
  iconName="bin"
  noun="binned"
  rows={binned}
  context="bin"
  {actions}
  showSuggestions={data.showSuggestions}
/>
