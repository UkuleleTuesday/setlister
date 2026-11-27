<!-- A tap anywhere closes it, the photo included. The ✕ has no handler of its
     own: its click bubbles to the overlay. -->
<script lang="ts">
  import Icon from "./Icon.svelte";

  let { src, onclose }: { src: string; onclose: () => void } = $props();

  function onKeydown(event: KeyboardEvent) {
    if (event.key === "Escape") onclose();
  }
</script>

<svelte:document onkeydown={onKeydown} />

<!-- svelte-ignore a11y_click_events_have_key_events -->
<div
  id="photo-lightbox"
  class="photo-lightbox"
  role="dialog"
  aria-modal="true"
  aria-label="Scanned request board"
  tabindex="-1"
  onclick={onclose}
>
  <button
    id="photo-lightbox-close"
    class="photo-lightbox-close"
    type="button"
    aria-label="Close photo"
  >
    <Icon name="close" />
  </button>
  <img id="photo-lightbox-img" alt="Scanned request board" {src} />
  <p class="photo-lightbox-hint">Tap anywhere to close</p>
</div>
