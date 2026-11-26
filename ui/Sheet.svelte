<!--
  The centred sheet every dialog wraps. App.svelte mounts each dialog only
  while it's open, so each opening starts fresh.

  Forgiving dismissal: a tap anywhere on the backdrop closes it, since the
  card is small and the backdrop is most of the screen; a tap inside the card
  doesn't. Escape is a desktop bonus, never the only way out: every sheet also
  has a real button.

  The ids and classes are load-bearing: style.css and the e2e suite select on
  them. No scoped <style> here; the global stylesheet stays global.
-->
<script lang="ts">
  import type { Snippet } from "svelte";

  let {
    id,
    labelledby,
    onclose,
    children,
  }: {
    id: string;
    /** The id of the sheet's heading, its accessible name. */
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

<!-- The backdrop's click is the tap-outside shortcut, not the accessible way
     out (see the header). -->
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
