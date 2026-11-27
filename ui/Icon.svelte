<!-- Decorative: whatever it labels carries the accessible name. -->
<script lang="ts">
  import { ICONS, type IconName } from "./icons.js";

  let { name, extraClass = "" }: { name: IconName; extraClass?: string } = $props();
</script>

<svg
  xmlns="http://www.w3.org/2000/svg"
  width="24"
  height="24"
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="2"
  stroke-linecap="round"
  stroke-linejoin="round"
  class={["icon", extraClass]}
  aria-hidden="true"
>
  {#each ICONS[name] as [tag, attrs], i (i)}
    <svelte:element this={tag} {...attrs} />
  {/each}
</svg>
