<!--
  The one-time name amnesty: shows once per device, on the first full-app
  open after a reset round ships. main.ts decides whether (name-reset.ts holds
  the rules and the copy) and has already cleared the saved name by the time
  this opens. Same centred-sheet idiom as starting a night.

  Every way out is a "later", not a refusal to comply: the flag is already
  set, so the sheet never returns, and the settings gear still holds the name
  field. Save with an empty field is just a dismiss, no error to read in a
  dark pub. Not focused on open: the sheet appears at boot, unprompted, and a
  keyboard shooting up over it would bury the message it exists to deliver.

  The ids and classes are load-bearing: style.css and the e2e suite select on
  them. No scoped <style> here; the global stylesheet stays global.
-->
<script lang="ts">
  let { onSave }: { onSave: (name: string) => void } = $props();

  let isOpen = $state(false);
  let message = $state("");
  let name = $state("");

  /** Ask for a real name, with name-reset.ts's message (the tests pin it). */
  export function open(text: string) {
    message = text;
    name = "";
    isOpen = true;
  }

  function close() {
    isOpen = false;
  }

  function save() {
    const trimmed = name.trim();
    if (trimmed) onSave(trimmed);
    close();
  }

  // Forgiving dismissal: a tap on the backdrop itself closes, a tap inside
  // the card doesn't.
  function onBackdrop(event: MouseEvent) {
    if (event.target === event.currentTarget) close();
  }

  function onKeydown(event: KeyboardEvent) {
    if (event.key === "Escape" && isOpen) close();
  }
</script>

<svelte:document onkeydown={onKeydown} />

<!-- The backdrop's click is the tap-outside shortcut, not the accessible way
     out: Later is a real button, and Escape is handled on the document. -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<div
  id="name-reset-sheet"
  class="sheet-backdrop"
  hidden={!isOpen}
  role="dialog"
  aria-modal="true"
  aria-labelledby="name-reset-title"
  tabindex="-1"
  onclick={onBackdrop}
>
  <div class="sheet">
    <h2 id="name-reset-title">Names, please</h2>
    <p id="name-reset-message" class="note">{message}</p>
    <label class="field">
      <span>Your name</span>
      <input
        type="text"
        id="name-reset-name"
        autocomplete="name"
        placeholder="e.g. Alex"
        bind:value={name}
        onkeydown={(event) => {
          if (event.key === "Enter") save();
        }}
      />
    </label>
    <div class="actions">
      <button id="name-reset-save" onclick={save}>Save</button>
      <button id="name-reset-later" class="secondary" onclick={close}>Later</button>
    </div>
    <p class="sheet-hint">Tap outside to close</p>
  </div>
</div>
