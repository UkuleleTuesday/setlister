<script lang="ts">
  import type { Snippet } from "svelte";

  let {
    id,
    labelledby,
    onclose,
    holdsInput = false,
    children,
  }: {
    id: string;
    labelledby: string;
    onclose: () => void;
    /** Something typed is in it: a stray tap outside mustn't throw it away. */
    holdsInput?: boolean;
    children: Snippet;
  } = $props();

  function onBackdrop(event: MouseEvent) {
    if (event.target === event.currentTarget && !holdsInput) onclose();
  }

  function onKeydown(event: KeyboardEvent) {
    if (event.key === "Escape") onclose();
  }
</script>

<svelte:document onkeydown={onKeydown} />

<!-- The backdrop click is an unlabelled tap-outside shortcut (DESIGN.md rule 8);
     every sheet also has a real button. -->
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
