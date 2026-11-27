<script lang="ts">
  import Icon from "./Icon.svelte";
  import { night } from "./night.svelte.js";
  import { organiserStatus } from "./organiser-status.svelte.js";
  import { registerFromPaste } from "./organiser.svelte.js";
  import { getAnonName } from "./presence.js";

  let {
    onName,
    onclose,
    focusName = false,
  }: {
    /** Fires on every keystroke. */
    onName: (name: string) => void;
    onclose: () => void;
    focusName?: boolean;
  } = $props();

  let panel: HTMLDivElement | undefined = $state();
  let nameInput: HTMLInputElement | undefined = $state();

  // What the room sees while the field is empty.
  const anonName = getAnonName();
  const named = $derived(Boolean(night.name.trim()));

  $effect(() => {
    if (focusName) nameInput?.focus();
  });

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
      <span>Name</span>
      <input
        type="text"
        id="player-name"
        placeholder={anonName}
        autocomplete="name"
        bind:this={nameInput}
        bind:value={() => night.name, onName}
      />
    </label>
    <p id="player-name-help" class="setting-help">
      {named
        ? "Shown on songs you add, in “Here now” and on nights you start."
        : `Until you add one, the room sees you as ${anonName}.`}
    </p>
    {#if organiserStatus.isOrganiser}
      <p id="organiser-status" class="callout organiser-status">
        <Icon name="check" />Organiser on this device
      </p>
    {/if}
  </section>
  {#if !organiserStatus.isOrganiser}
    <details class="disclosure" id="organiser-setting">
      <summary>Organisers<Icon name="chevron" extraClass="disclosure-chevron" /></summary>
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
    </details>
  {/if}
</div>
