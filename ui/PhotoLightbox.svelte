<!--
  Full-screen viewer for the scanned board, opened from a flagged review row's
  warning so a match can be checked against the handwriting by eye.

  Mobile-first dismissal: there's no Escape key on a phone and "tap the
  backdrop but not the photo" is a fiddly target, so tapping ANYWHERE on the
  overlay closes it. The ✕ stays as the obvious, thumb-sized way out; Escape
  is a harmless desktop bonus.

  The ids and classes are load-bearing: style.css and the e2e suite select on
  them. No scoped <style> here; the global stylesheet stays global.
-->
<script lang="ts">
  import Icon from "./Icon.svelte";

  let {
    src = $bindable(null),
  }: {
    /** The photo on show; null closes the viewer. */
    src?: string | null;
  } = $props();

  function close() {
    src = null;
  }

  function onKeydown(event: KeyboardEvent) {
    if (event.key === "Escape" && src) close();
  }
</script>

<svelte:document onkeydown={onKeydown} />

<!-- The whole overlay is the tap-to-close target; the ✕ button is the
     keyboard-reachable way out, and Escape is handled on the document. -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<div
  id="photo-lightbox"
  class="photo-lightbox"
  hidden={!src}
  role="dialog"
  aria-modal="true"
  aria-label="Scanned request board"
  tabindex="-1"
  onclick={close}
>
  <button
    id="photo-lightbox-close"
    class="photo-lightbox-close"
    type="button"
    aria-label="Close photo"
  >
    <Icon name="close" />
  </button>
  <img id="photo-lightbox-img" alt="Scanned request board" src={src ?? undefined} />
  <p class="photo-lightbox-hint">Tap anywhere to close</p>
</div>
