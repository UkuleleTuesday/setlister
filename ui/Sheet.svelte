<script lang="ts">
  import type { Snippet } from "svelte";

  let {
    id,
    labelledby,
    onclose,
    children,
  }: {
    id: string;
    labelledby: string;
    onclose: () => void;
    children: Snippet;
  } = $props();

  function onBackdrop(event: MouseEvent) {
    if (event.target === event.currentTarget) onclose();
  }

  function onKeydown(event: KeyboardEvent) {
    if (event.key === "Escape") onclose();
  }
</script>

<svelte:document onkeydown={onKeydown} />

<!-- The backdrop click is a tap-outside shortcut; every sheet also has a real
     button. -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<div
  {id}
  class="sheet-backdrop"
  role="dialog"
  aria-modal="true"
  aria-labelledby={labelledby}
  tabindex="-1"
  onclick={onBackdrop}
>
  <div class="sheet">
    {@render children()}
  </div>
</div>
