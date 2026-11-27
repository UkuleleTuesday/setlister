<script lang="ts">
  import Icon from "./Icon.svelte";
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
  <!-- A session control, so hidden on home: the new-session sheet picks there. -->
  <section class="settings-group" hidden={view.page === "home"}>
    <h3 class="eyebrow">This session</h3>
    <label class="field" id="edition-setting">
      <span>Songbook edition</span>
      <select id="edition" bind:value={() => catalogue.editionId, onEdition}>
        {#each editionOptions as option (option.id)}
          <option value={option.id}>{option.label}</option>
        {/each}
      </select>
    </label>
    <p class="setting-help">Changes the songbook for everyone in this session.</p>
  </section>
  <section class="settings-group">
    <h3 class="eyebrow">Display</h3>
    <label class="setting-row">
      <span class="setting-text">
        Suggest other matches
        <span class="setting-help">Under a scanned tune, offer close songbook matches.</span>
      </span>
      <input
        type="checkbox"
        role="switch"
        class="switch"
        id="show-suggestions"
        bind:checked={() => settings.showSuggestions, (v) => set("showSuggestions", v)}
      />
    </label>
  </section>
  <details class="disclosure" id="organiser-setting">
    <summary>Organisers<Icon name="chevron" extraClass="disclosure-chevron" /></summary>
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
  <details class="disclosure" id="advanced-setting">
    <summary>Advanced<Icon name="chevron" extraClass="disclosure-chevron" /></summary>
    <label class="field">
      <span>Model</span>
      <select id="model" bind:value={() => settings.model, (v) => set("model", v)}>
        <option value="">default (gemini-2.5-flash)</option>
        <option value="gemini-2.5-flash">gemini-2.5-flash</option>
        <option value="gemini-2.5-flash-lite">gemini-2.5-flash-lite (faster)</option>
      </select>
    </label>
    <label class="setting-row">
      <span class="setting-text">Disable model thinking (faster)</span>
      <input
        type="checkbox"
        role="switch"
        class="switch"
        id="disable-thinking"
        bind:checked={() => settings.disableThinking, (v) => set("disableThinking", v)}
      />
    </label>
    <label class="setting-row">
      <span class="setting-text">Send songbook to model (better handwriting reads)</span>
      <input
        type="checkbox"
        role="switch"
        class="switch"
        id="send-catalogue"
        bind:checked={() => settings.sendCatalogue, (v) => set("sendCatalogue", v)}
      />
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
    <p class="setting-help">Photos are shrunk to this on your phone before uploading.</p>
  </details>
</div>
