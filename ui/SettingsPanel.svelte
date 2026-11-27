<script lang="ts">
  import { catalogue } from "./catalogue.svelte.js";
  import { editionLabel } from "./editions.js";
  import { night } from "./night.svelte.js";
  import { organiserStatus } from "./organiser-status.svelte.js";
  import { registerFromPaste } from "./organiser.svelte.js";
  import { type Settings, settings } from "./settings.svelte.js";
  import { view } from "./view.svelte.js";

  let {
    onName,
    onChange,
    onEdition,
    onclose,
  }: {
    /** Fires on every keystroke. */
    onName: (name: string) => void;
    onChange: (key: keyof Settings) => void;
    onEdition: (editionId: string) => void;
    onclose: () => void;
  } = $props();

  // The session's book may be missing from the listing; list it anyway so the
  // select doesn't silently snap to another book.
  const editionOptions = $derived.by(() => {
    const id = catalogue.editionId;
    const known = catalogue.editions.length ? catalogue.editions : [{ id: "current" }];
    const all = known.some((e) => e.id === id) ? known : [...known, { id }];
    return all.map((e) => ({ id: e.id, label: editionLabel(e) }));
  });

  let panel: HTMLDivElement | undefined = $state();

  // Write before reporting, so the save that follows sees the new value.
  function set<K extends keyof Settings>(key: K, value: Settings[K]) {
    settings[key] = value;
    onChange(key);
  }

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
  class="settings-panel"
  role="dialog"
  aria-label="Settings"
  bind:this={panel}
>
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
  <p class="note">Shown on songs you add, in “Here now”, and on sessions you start.</p>
  <!-- A session control, so hidden on home: the new-session sheet picks there. -->
  <label class="field" id="edition-setting" hidden={view.page === "home"}>
    <span>Songbook edition</span>
    <select id="edition" bind:value={() => catalogue.editionId, onEdition}>
      {#each editionOptions as option (option.id)}
        <option value={option.id}>{option.label}</option>
      {/each}
    </select>
    <span class="note">Changes this session's songbook for everyone in it.</span>
  </label>
  <label class="field toggle">
    <input
      type="checkbox"
      id="show-suggestions"
      bind:checked={() => settings.showSuggestions, (v) => set("showSuggestions", v)}
    />
    <span>Show alternative suggestions</span>
  </label>
  <label class="field toggle">
    <input
      type="checkbox"
      id="include-crossed"
      bind:checked={() => settings.includeCrossed, (v) => set("includeCrossed", v)}
    />
    <span>Include crossed-out rows in export</span>
  </label>
  <details class="advanced" id="organiser-setting">
    <summary>Organisers</summary>
    {#if organiserStatus.isOrganiser}
      <p id="organiser-status" class="note">
        This phone is on the organiser list{organiserStatus.name
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
          class="secondary"
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
  <details class="advanced">
    <summary>Advanced</summary>
    <label class="field">
      <span>Model</span>
      <select id="model" bind:value={() => settings.model, (v) => set("model", v)}>
        <option value="">default (gemini-2.5-flash)</option>
        <option value="gemini-2.5-flash">gemini-2.5-flash</option>
        <option value="gemini-2.5-flash-lite">gemini-2.5-flash-lite (faster)</option>
      </select>
    </label>
    <label class="field toggle">
      <input
        type="checkbox"
        id="disable-thinking"
        bind:checked={() => settings.disableThinking, (v) => set("disableThinking", v)}
      />
      <span>Disable model thinking (faster)</span>
    </label>
    <label class="field toggle">
      <input
        type="checkbox"
        id="send-catalogue"
        bind:checked={() => settings.sendCatalogue, (v) => set("sendCatalogue", v)}
      />
      <span>Send songbook to model (better handwriting reads)</span>
    </label>
    <!-- Not bind:value: a number input would hand back a number, on every
         keystroke; the setting is a string, saved on commit. -->
    <label class="field">
      <span>Max image edge (px)</span>
      <input
        type="number"
        id="max-image-edge"
        min="256"
        max="4096"
        step="128"
        placeholder="1600"
        value={settings.maxImageEdge}
        onchange={(event) => set("maxImageEdge", event.currentTarget.value)}
      />
    </label>
    <p class="note">Photos are shrunk to this on your phone before uploading.</p>
  </details>
</div>
