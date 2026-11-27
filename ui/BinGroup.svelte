<!-- Binned rows stay in their home arrays, so un-binning restores each in place. -->
<script lang="ts">
  import type { RowActions } from "./Row.svelte";
  import RowGroup from "./RowGroup.svelte";
  import { night } from "./night.svelte.js";

  let { actions }: { actions: RowActions } = $props();

  const binned = $derived([...night.upNext, ...night.requests].filter((e) => e.binned));
</script>

<RowGroup id="bin-group" iconName="bin" noun="binned" rows={binned} context="bin" {actions} />
