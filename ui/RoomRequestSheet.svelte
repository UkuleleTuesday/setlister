<!--
  Both modes (#86, #88): the sheet every add by name goes through, doing two
  jobs at the moment a song is picked. It CONFIRMS the request (a row in the
  pool is in for everyone, and a mis-tap in a dark pub shouldn't land a tune
  unasked) and, while there's no name yet, asks the one that will go on it,
  so a regular is one tap from adding. Also reached from "change" with no
  request attached: then it's just a rename.

  It only gathers and checks the answer: committing the name and adding the
  row (with its duplicate guard, the open/closed brake and the cool-down)
  are adds.ts's, behind `onConfirm`.

  The ids and classes are load-bearing: style.css and the e2e suite select on
  them. No scoped <style> here; the global stylesheet stays global.
-->
<script lang="ts">
  import { onMount } from "svelte";
  import Sheet from "./Sheet.svelte";
  import { night } from "./night.svelte.js";
  import type { CatalogueEntry } from "./types.js";

  /** What a confirm hands to `onConfirm`. */
  export interface RequestAnswer {
    /** The tune to add, or null for a rename. */
    entry: CatalogueEntry | null;
    /** The typed name when the sheet asked for one, else null. */
    name: string | null;
    comment: string;
  }

  let {
    entry,
    onConfirm,
    onclose,
  }: {
    /** The picked tune, or null for a rename (from "change"). */
    entry: CatalogueEntry | null;
    onConfirm: (answer: RequestAnswer) => void;
    onclose: () => void;
  } = $props();

  // Each opening mounts the sheet afresh, from the saved name. Whether there
  // was one is fixed at opening: typing a name doesn't make the field vanish
  // under the thumb. The comment is about this tune, not a sticky preference.
  const hasName = Boolean(night.name.trim());
  let name = $state(night.name);
  let comment = $state("");
  let error = $state("");

  const askName = $derived(!hasName || !entry);
  const title = $derived(entry ? (hasName ? "Add this request?" : "Who’s asking?") : "Your name");

  let nameInput: HTMLInputElement | undefined = $state();
  let confirmButton: HTMLButtonElement | undefined = $state();

  // Only raise the keyboard when there's typing to do; a confirm-only sheet
  // puts the thumb on the button instead.
  onMount(() => (askName ? nameInput : confirmButton)?.focus());

  // The answer goes to adds.ts's confirmRequest, which commits the name and
  // the request together.
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

<!-- Dismissing (backdrop, Escape, Cancel) is a "no": the request simply
     doesn't happen. -->
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
  <!-- Optional note that rides on the request ("it's Sam's birthday"). Only
       while a request is being confirmed; a rename has nothing to pin it
       to. -->
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
    <!-- The button says what will happen: a request is waiting on this
         sheet, a rename isn't. -->
    <button id="room-request-confirm" bind:this={confirmButton} onclick={confirm}>
      {entry ? "Add request" : "Save"}
    </button>
    <button id="room-request-cancel" class="secondary" onclick={onclose}>Cancel</button>
  </div>
  <p class="sheet-hint">Tap outside to close</p>
</Sheet>
