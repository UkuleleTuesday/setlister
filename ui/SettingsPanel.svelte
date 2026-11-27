<script lang="ts">
  import Icon from "./Icon.svelte";
  import { night } from "./night.svelte.js";
  import { organiserStatus } from "./organiser-status.svelte.js";
  import { registerFromPaste } from "./organiser.svelte.js";

  let {
    onName,
    onclose,
  }: {
    /** Fires on every keystroke. */
    onName: (name: string) => void;
    onclose: () => void;
  } = $props();

  let panel: HTMLDivElement | undefined = $state();

  // The gear's tap stops propagation in App.svelte, so it toggles instead.
  function onDocumentClick(event: MouseEvent) {
    const target = event.target as Node | null;
    if (target && !panel?.contains(target)) onclose();
  }

  let organiserLink = $state("");
  let organiserLinkBad = $state(false);

  function submitOrganiserLink() {
    organiserLinkBad = !registerFromPaste(organiserLink);
  }

  function onKeydown(event: KeyboardEvent) {
    if (event.key === "Escape") onclose();
  }
</script>

<svelte:document onclick={onDocumentClick} onkeydown={onKeydown} />

<div
  id="settings-panel"
  class="settings-panel popover"
  role="dialog"
  aria-label="Settings"
  bind:this={panel}
>
  <section class="settings-group">
    <h3 class="eyebrow">You</h3>
    <label class="field">
      <span>Your name</span>
      <input
        type="text"
        id="player-name"
        placeholder="e.g. Alex"
        autocomplete="name"
        bind:value={() => night.name, onName}
      />
    </label>
    <p class="setting-help">Shown on songs you add, in “Here now”, and on sessions you start.</p>
  </section>
  <details class="disclosure" id="organiser-setting">
    <summary>Organisers<Icon name="chevron" extraClass="disclosure-chevron" /></summary>
    {#if organiserStatus.isOrganiser}
      <p id="organiser-status" class="note">
        This device is on the organiser list{organiserStatus.name
          ? `, as ${organiserStatus.name}`
          : ""}.
      </p>
    {:else}
      <label class="field">
        <span>Paste your organiser link</span>
        <input
          type="text"
          id="organiser-link"
          autocomplete="off"
          autocapitalize="off"
          spellcheck="false"
          enterkeyhint="go"
          placeholder="https://…#organise=…"
          bind:value={organiserLink}
          oninput={() => (organiserLinkBad = false)}
          onkeydown={(event) => {
            if (event.key === "Enter") submitOrganiserLink();
          }}
        />
      </label>
      {#if organiserLinkBad}
        <p class="error" role="alert">That doesn’t look like an organiser link.</p>
      {/if}
      <div class="actions">
        <button
          id="organiser-link-register"
          class="btn btn-soft"
          disabled={!organiserLink.trim()}
          onclick={submitOrganiserLink}
        >
          Register
        </button>
      </div>
      <p class="note">
        Use this if Setlister lives on your home screen: links from the chat open in your browser
        instead.
      </p>
    {/if}
  </details>
</div>
