<!--
  A lucide icon, for Svelte markup: the same <svg class="icon"> that icon() in
  icons.ts builds for the legacy code, inlined with no wrapper element, so
  ported screens render the exact DOM they replace.
-->
<script lang="ts">
  import { type IconName, icon } from "./icons.js";

  let { name, extraClass = "" }: { name: IconName; extraClass?: string } = $props();

  const markup = $derived(icon(name, extraClass).outerHTML);
</script>

<!-- Static lucide markup built from our own icon table; never user input. -->
<!-- eslint-disable-next-line svelte/no-at-html-tags -->
{@html markup}
