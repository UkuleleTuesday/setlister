<!--
  Every add by name confirms here: a mis-tap in a dark pub shouldn't land a
  tune for everyone. adds.ts commits the answer, guards included.
-->
<script lang="ts">
  import { onMount } from "svelte";
  import Sheet from "./Sheet.svelte";
  import { night } from "./night.svelte.js";
  import type { CatalogueEntry } from "./types.js";

  export interface RequestAnswer {
    entry: CatalogueEntry | null;
    /** Null when the sheet didn't ask for one. */
    name: string | null;
    comment: string;
  }

  let {
    entry,
    onConfirm,
    onclose,
  }: {
    /** Null for a rename (from "change"). */
    entry: CatalogueEntry | null;
    onConfirm: (answer: RequestAnswer) => void;
    onclose: () => void;
  } = $props();

  // Fixed at opening, so typing a name doesn't make the field vanish under the thumb.
  const hasName = Boolean(night.name.trim());
  let name = $state(night.name);
  let comment = $state("");
  let error = $state("");

  const askName = $derived(!hasName || !entry);
  const title = $derived(entry ? (hasName ? "Add this request?" : "Who’s asking?") : "Your name");

  let nameInput: HTMLInputElement | undefined = $state();
  let confirmButton: HTMLButtonElement | undefined = $state();

  // Raise the keyboard only when there's typing to do.
  onMount(() => (askName ? nameInput : confirmButton)?.focus());

  function confirm() {
    if (askName && !name.trim()) {
      error = "Add a name so the room knows whose request it is.";
      nameInput?.focus();
      return;
    }
    const answer = { entry, name: askName ? name : null, comment };
    onclose();
    onConfirm(answer);
  }

  function onEnter(event: KeyboardEvent) {
    if (event.key === "Enter") confirm();
  }
</script>

<Sheet id="room-request-sheet" labelledby="room-request-title" {onclose}>
  <h2 id="room-request-title">{title}</h2>
  <p id="room-request-song" class="room-request-song" hidden={!entry}>{entry?.display ?? ""}</p>
  <div id="room-request-name-field" hidden={!askName}>
    <label class="field">
      <span>Your name</span>
      <input
        type="text"
        id="room-request-name"
        autocomplete="name"
        placeholder="e.g. Alex"
        bind:value={name}
        bind:this={nameInput}
        onkeydown={onEnter}
      />
    </label>
    <p class="note">It goes on your request, so the room knows whose tune it is.</p>
  </div>
  <div id="room-request-comment-field" hidden={!entry}>
    <label class="field">
      <span>Comment (optional)</span>
      <input
        type="text"
        id="room-request-comment"
        maxlength="120"
        autocomplete="off"
        placeholder="e.g. birthday request!"
        bind:value={comment}
        onkeydown={onEnter}
      />
    </label>
  </div>
  <div id="room-request-error" class="error" hidden={!error}>{error}</div>
  <div class="actions">
    <button
      id="room-request-confirm"
      class="btn btn-primary"
      bind:this={confirmButton}
      onclick={confirm}
    >
      {entry ? "Add request" : "Save"}
    </button>
    <button id="room-request-cancel" class="btn btn-soft" onclick={onclose}>Cancel</button>
  </div>
  <p class="sheet-hint">Tap outside to close</p>
</Sheet>
