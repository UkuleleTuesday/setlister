<script lang="ts">
  import Icon from "./Icon.svelte";
  import Presence from "./Presence.svelte";
  import { windowChipText } from "./request-window.js";
  import { session } from "./session.svelte.js";

  let {
    onShareLink,
    onRequestLink,
    onAddName,
    onclose,
    openers,
  }: {
    /** True when the link was copied rather than shared. */
    onShareLink: () => Promise<boolean>;
    onRequestLink: () => void;
    onAddName: (event: MouseEvent) => void;
    onclose: () => void;
    /** Taps on these don't count as outside. */
    openers: () => Element[];
  } = $props();

  let flashing = $state(false);
  let flashTimer: ReturnType<typeof setTimeout> | undefined;
  let panel: HTMLDivElement | undefined = $state();

  async function share() {
    if (!(await onShareLink())) return;
    clearTimeout(flashTimer);
    flashing = true;
    flashTimer = setTimeout(() => (flashing = false), 1500);
  }

  function onDocumentClick(event: MouseEvent) {
    const target = event.target as Node | null;
    if (!target || panel?.contains(target)) return;
    if (openers().some((el) => el.contains(target))) return;
    onclose();
  }

  function onKeydown(event: KeyboardEvent) {
    if (event.key === "Escape") onclose();
  }
</script>

<svelte:document onclick={onDocumentClick} onkeydown={onKeydown} />

<div
  id="share-panel"
  class="share-panel popover"
  role="dialog"
  aria-label="Session sharing"
  bind:this={panel}
>
  <p class="share-session-name" id="share-session-name">{session.label}</p>
  <p class="note">
    Anyone with the link can follow the night and add requests. Only organisers can run it.
  </p>
  <div class="actions">
    <button id="share-link" class="btn btn-primary" onclick={share}>
      {#if flashing}<Icon name="check" /><span class="btn-label">Link copied</span>{:else}<Icon
          name="share"
        /><span class="btn-label">Share link</span>{/if}
    </button>
  </div>
  <!-- The id stays so it can be matched against a URL read out across the table. -->
  <p class="share-session-label note">
    Session id: <strong id="share-session-id">{session.id ?? ""}</strong>
  </p>
  {#if !session.past}
    <div class="share-link-state">
      <span id="share-link-state-text">{windowChipText(session.link.status, session.now)}</span>
      <button type="button" id="share-request-change" class="link-button" onclick={onRequestLink}>
        Change
      </button>
    </div>
  {/if}
  <Presence roster={session.id ? session.roster : []} {onAddName} />
</div>
