<!--
  The settings popover behind the gear: this device's name, the session's
  songbook, two display toggles, and the scan parser's knobs under Advanced.

  The device settings (settings.svelte.ts) are edited in place here; every
  change is reported through the props so App can persist it (and, for the
  name, tell the session's peers).

  The ids and classes are load-bearing: style.css and the e2e suite select on
  them. No scoped <style> here; the global stylesheet stays global.
-->
<script lang="ts">
  import { catalogue } from "./catalogue.svelte.js";
  import { editionLabel } from "./editions.js";
  import { night } from "./night.svelte.js";
  import { type Settings, settings } from "./settings.svelte.js";
  import { view } from "./view.svelte.js";

  let {
    onName,
    onChange,
    onEdition,
    onclose,
  }: {
    /** The name field changed (every keystroke). */
    onName: (name: string) => void;
    /** A device setting changed. */
    onChange: (key: keyof Settings) => void;
    /** The session's songbook was switched. */
    onEdition: (editionId: string) => void;
    onclose: () => void;
  } = $props();

  // The editions listing (empty until /api/editions answers) and the
  // session's book. A session can name an edition the listing doesn't know
  // (an unlisted book, or the listing failed), so it gets an option anyway:
  // the select shows the truth instead of silently snapping to another book.
  const editionOptions = $derived.by(() => {
    const id = catalogue.editionId;
    const known = catalogue.editions.length ? catalogue.editions : [{ id: "current" }];
    const all = known.some((e) => e.id === id) ? known : [...known, { id }];
    return all.map((e) => ({ id: e.id, label: editionLabel(e) }));
  });

  let panel: HTMLDivElement | undefined = $state();

  // Each control writes its setting, then reports it, so the save that
  // follows sees the new value.
  function set<K extends keyof Settings>(key: K, value: Settings[K]) {
    settings[key] = value;
    onChange(key);
  }

  // Forgiving dismissal: a tap anywhere outside closes it (the gear's own tap
  // stops propagation in App.svelte, so it toggles instead). Escape is a
  // desktop bonus.
  function onDocumentClick(event: MouseEvent) {
    const target = event.target as Node | null;
    if (target && !panel?.contains(target)) onclose();
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
  <!-- The name shows in three places a player might not expect: song
       attribution, the "Here now" roster and "Started by" on the home list. -->
  <p class="note">Shown on songs you add, in “Here now”, and on sessions you start.</p>
  <!-- Session control, not a device setting: it changes THIS session's
       songbook for everyone in it, so it's hidden on the home screen (the
       new-session sheet owns the choice there). -->
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
  <!-- Everything below is vocabulary for whoever is tuning the parser, not a
       ukulele player: it starts closed so the panel reads as four things a
       club member might actually want. -->
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
    <!-- This knob governs the upload, not just the server's resize (#44):
         worth saying, because a reader would assume a full-size upload
         shrunk on arrival. -->
    <p class="note">Photos are shrunk to this on your phone before uploading.</p>
  </details>
</div>
