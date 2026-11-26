<!--
  The settings popover behind the gear: this device's name, the session's
  songbook, two display toggles, and the scan parser's knobs under Advanced.

  main.ts reads the values through settings() (persist(), the scan request,
  rendering) and restores saved ones with apply(); every change comes back
  through the props so main.ts can persist and re-render.

  The ids and classes are load-bearing: style.css and the e2e suite select on
  them. No scoped <style> here; the global stylesheet stays global.
-->
<script lang="ts">
  import { editionLabel } from "./editions.js";
  import type { Edition } from "./types.js";

  /** The device settings persist() saves under `settings`. */
  export interface Settings {
    model: string;
    disableThinking: boolean;
    sendCatalogue: boolean;
    showSuggestions: boolean;
    includeCrossed: boolean;
    maxImageEdge: string;
  }

  let {
    onName,
    onChange,
    onEdition,
    onOpenChange,
  }: {
    /** The name field changed (every keystroke). */
    onName: (name: string) => void;
    /** A device setting changed. */
    onChange: (key: keyof Settings) => void;
    /** The session's songbook was switched. */
    onEdition: (editionId: string) => void;
    onOpenChange: (open: boolean) => void;
  } = $props();

  let isOpen = $state(false);
  let name = $state("");
  let model = $state("");
  let disableThinking = $state(true);
  let sendCatalogue = $state(true);
  let showSuggestions = $state(false);
  let includeCrossed = $state(false);
  let maxImageEdge = $state("");
  // The editions listing (empty until /api/editions answers) and the
  // session's book. A session can name an edition the listing doesn't know
  // (an unlisted book, or the listing failed), so it gets an option anyway:
  // the select shows the truth instead of silently snapping to another book.
  let editions: Pick<Edition, "id" | "title">[] = $state([]);
  let editionId = $state("current");
  let editionVisible = $state(true);

  const editionOptions = $derived.by(() => {
    const known = editions.length ? editions : [{ id: "current" }];
    const all = known.some((e) => e.id === editionId) ? known : [...known, { id: editionId }];
    return all.map((e) => ({ id: e.id, label: editionLabel(e) }));
  });

  let panel: HTMLDivElement | undefined = $state();

  /** The current device settings. */
  export function settings(): Settings {
    return {
      model,
      disableThinking,
      sendCatalogue,
      showSuggestions,
      includeCrossed,
      maxImageEdge,
    };
  }

  /** Restore saved settings; anything of the wrong type is ignored. */
  export function apply(saved: unknown) {
    if (!saved || typeof saved !== "object") return;
    const s = saved as Record<string, unknown>;
    if (typeof s.model === "string") model = s.model;
    if (typeof s.disableThinking === "boolean") disableThinking = s.disableThinking;
    if (typeof s.sendCatalogue === "boolean") sendCatalogue = s.sendCatalogue;
    if (typeof s.showSuggestions === "boolean") showSuggestions = s.showSuggestions;
    if (typeof s.includeCrossed === "boolean") includeCrossed = s.includeCrossed;
    if (typeof s.maxImageEdge === "string") maxImageEdge = s.maxImageEdge;
  }

  /** Reflect a name set elsewhere (room mode's sheet, the name amnesty). */
  export function setName(value: string) {
    name = value;
  }

  /** The songbook listing, once /api/editions answers. */
  export function setEditions(list: Pick<Edition, "id" | "title">[]) {
    if (list.length) editions = list;
  }

  /** Point the select at the session's book. */
  export function selectEdition(id: string) {
    editionId = id;
  }

  /** The songbook select, as it stands (before any session names a book). */
  export function selectedEdition() {
    return editionId;
  }

  /** It's a session control, so the home screen hides it. */
  export function setEditionVisible(visible: boolean) {
    editionVisible = visible;
  }

  export function setOpen(open: boolean) {
    if (isOpen === open) return;
    isOpen = open;
    onOpenChange(open);
  }

  export function isPanelOpen() {
    return isOpen;
  }

  // Forgiving dismissal: a tap anywhere outside closes it (the gear's own tap
  // stops propagation in App.svelte, so it toggles instead). Escape is a desktop
  // bonus.
  function onDocumentClick(event: MouseEvent) {
    const target = event.target as Node | null;
    if (isOpen && target && !panel?.contains(target)) setOpen(false);
  }

  function onKeydown(event: KeyboardEvent) {
    if (event.key === "Escape") setOpen(false);
  }
</script>

<svelte:document onclick={onDocumentClick} onkeydown={onKeydown} />

<div
  id="settings-panel"
  class="settings-panel"
  role="dialog"
  aria-label="Settings"
  hidden={!isOpen}
  bind:this={panel}
>
  <label class="field">
    <span>Your name</span>
    <input
      type="text"
      id="player-name"
      placeholder="e.g. Alex"
      autocomplete="name"
      value={name}
      oninput={(event) => {
        name = event.currentTarget.value;
        onName(name);
      }}
    />
  </label>
  <!-- The name shows in three places a player might not expect: song
       attribution, the "Here now" roster and "Started by" on the home list. -->
  <p class="note">Shown on songs you add, in “Here now”, and on sessions you start.</p>
  <!-- Session control, not a device setting: it changes THIS session's
       songbook for everyone in it, so it's hidden on the home screen (the
       new-session sheet owns the choice there). -->
  <label class="field" id="edition-setting" hidden={!editionVisible}>
    <span>Songbook edition</span>
    <select
      id="edition"
      value={editionId}
      onchange={(event) => {
        editionId = event.currentTarget.value;
        onEdition(editionId);
      }}
    >
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
      checked={showSuggestions}
      onchange={(event) => {
        showSuggestions = event.currentTarget.checked;
        onChange("showSuggestions");
      }}
    />
    <span>Show alternative suggestions</span>
  </label>
  <label class="field toggle">
    <input
      type="checkbox"
      id="include-crossed"
      checked={includeCrossed}
      onchange={(event) => {
        includeCrossed = event.currentTarget.checked;
        onChange("includeCrossed");
      }}
    />
    <span>Include crossed-out rows in export</span>
  </label>
  <!-- Everything below is prompt-engineering vocabulary aimed at whoever is
       tuning the parser, not at a ukulele player: it opens closed so the
       panel reads as four things a club member might actually want. -->
  <details class="advanced">
    <summary>Advanced</summary>
    <label class="field">
      <span>Model</span>
      <select
        id="model"
        value={model}
        onchange={(event) => {
          model = event.currentTarget.value;
          onChange("model");
        }}
      >
        <option value="">default (gemini-2.5-flash)</option>
        <option value="gemini-2.5-flash">gemini-2.5-flash</option>
        <option value="gemini-2.5-flash-lite">gemini-2.5-flash-lite (faster)</option>
      </select>
    </label>
    <label class="field toggle">
      <input
        type="checkbox"
        id="disable-thinking"
        checked={disableThinking}
        onchange={(event) => {
          disableThinking = event.currentTarget.checked;
          onChange("disableThinking");
        }}
      />
      <span>Disable model thinking (faster)</span>
    </label>
    <label class="field toggle">
      <input
        type="checkbox"
        id="send-catalogue"
        checked={sendCatalogue}
        onchange={(event) => {
          sendCatalogue = event.currentTarget.checked;
          onChange("sendCatalogue");
        }}
      />
      <span>Send songbook to model (better handwriting reads)</span>
    </label>
    <label class="field">
      <span>Max image edge (px)</span>
      <input
        type="number"
        id="max-image-edge"
        min="256"
        max="4096"
        step="128"
        placeholder="1600"
        value={maxImageEdge}
        onchange={(event) => {
          maxImageEdge = event.currentTarget.value;
          onChange("maxImageEdge");
        }}
      />
    </label>
    <!-- This knob governs the upload, not just the server's resize (#44):
         worth saying, because a reader would assume a full-size upload
         shrunk on arrival. -->
    <p class="note">Photos are shrunk to this on your phone before uploading.</p>
  </details>
</div>
