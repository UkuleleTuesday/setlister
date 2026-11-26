<!--
  Both modes (#86, #88): the sheet every add by name goes through, doing two
  jobs at the moment a song is picked. It CONFIRMS the request (a row in the
  pool is in for everyone, and a mis-tap in a dark pub shouldn't land a tune
  unasked) and, on the first request, asks the name that will go on it. The
  name field is dropped once there is a name, so a regular is one tap from
  adding. Also reached from "change" with no request attached: then it's
  just a rename.

  It only gathers and checks the answer: committing the name and adding the
  row (with its duplicate guard, the open/closed brake and the cool-down)
  stay in main.ts, behind `onConfirm`.

  The ids and classes are load-bearing: style.css and the e2e suite select on
  them. No scoped <style> here; the global stylesheet stays global.
-->
<script lang="ts">
  import { tick } from "svelte";
  import type { CatalogueEntry } from "./types.js";

  /** What a confirm hands to main.ts. */
  export interface RequestAnswer {
    /** The tune to add, or null for a rename. */
    entry: CatalogueEntry | null;
    /** The typed name when the sheet asked for one, else null. */
    name: string | null;
    comment: string;
  }

  let { onConfirm }: { onConfirm: (answer: RequestAnswer) => void } = $props();

  let isOpen = $state(false);
  // The request this sheet will submit, or null when opened from "change".
  let entry: CatalogueEntry | null = $state(null);
  let hasName = $state(false);
  let name = $state("");
  let comment = $state("");
  let error = $state("");

  // One sheet, doing as little as the situation needs: it always confirms the
  // request, and adds the name field only while there's no name to put on it.
  const askName = $derived(!hasName || !entry);
  const title = $derived(entry ? (hasName ? "Add this request?" : "Who’s asking?") : "Your name");

  let nameInput: HTMLInputElement | undefined = $state();
  let confirmButton: HTMLButtonElement | undefined = $state();

  /** Open on a picked tune, or on null for a rename. */
  export async function open(next: CatalogueEntry | null, currentName: string) {
    entry = next;
    hasName = Boolean(currentName.trim());
    name = currentName;
    // The comment is about this tune, not a sticky preference.
    comment = "";
    error = "";
    isOpen = true;
    await tick();
    // Only raise the keyboard when there's typing to do; a confirm-only sheet
    // puts the thumb on the button instead.
    if (askName) nameInput?.focus();
    else confirmButton?.focus();
  }

  export function close() {
    isOpen = false;
    entry = null;
  }

  export function isSheetOpen() {
    return isOpen;
  }

  // The name is committed on confirm, not per keystroke, so an abandoned
  // sheet leaves the saved name untouched. The request goes in with the same
  // tap, so it can't be lost between the two.
  function confirm() {
    if (askName && !name.trim()) {
      error = "Add a name so the room knows whose request it is.";
      nameInput?.focus();
      return;
    }
    const answer = { entry, name: askName ? name : null, comment };
    close();
    onConfirm(answer);
  }

  function onEnter(event: KeyboardEvent) {
    if (event.key === "Enter") confirm();
  }

  // Same forgiving dismissal as the other sheets: tap the backdrop, or
  // Escape. Dismissing is a "no": the request simply doesn't happen.
  function onBackdrop(event: MouseEvent) {
    if (event.target === event.currentTarget) close();
  }

  function onKeydown(event: KeyboardEvent) {
    if (event.key === "Escape" && isOpen) close();
  }
</script>

<svelte:document onkeydown={onKeydown} />

<!-- The backdrop's click is the tap-outside shortcut, not the accessible way
     out: Cancel is a real button, and Escape is handled on the document. -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<div
  id="room-request-sheet"
  class="sheet-backdrop"
  hidden={!isOpen}
  role="dialog"
  aria-modal="true"
  aria-labelledby="room-request-title"
  tabindex="-1"
  onclick={onBackdrop}
>
  <div class="sheet">
    <h2 id="room-request-title">{title}</h2>
    <!-- The song is what's being confirmed, so it reads as the sheet's
         subject rather than as a caption. -->
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
      <button id="room-request-cancel" class="secondary" onclick={close}>Cancel</button>
    </div>
    <p class="sheet-hint">Tap outside to close</p>
  </div>
</div>
