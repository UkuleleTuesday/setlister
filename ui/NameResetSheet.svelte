<!--
  The one-time name amnesty: shows once per device, on the first full-app
  open after a reset round ships. player.ts decides whether (name-reset.ts
  holds the rules and the copy) and has already cleared the saved name by the
  time this opens. Same centred-sheet idiom as starting a night.

  Every way out is a "later", not a refusal to comply: the flag is already
  set, so the sheet never returns, and the settings gear still holds the name
  field. Save with an empty field is just a dismiss, no error to read in a
  dark pub. Not focused on open: the sheet appears at boot, unprompted, and a
  keyboard shooting up over it would bury the message it exists to deliver.

  The ids and classes are load-bearing: style.css and the e2e suite select on
  them. No scoped <style> here; the global stylesheet stays global.
-->
<script lang="ts">
  import Sheet from "./Sheet.svelte";
  import { NAME_RESET_MESSAGE } from "./name-reset.js";

  let { onSave, onclose }: { onSave: (name: string) => void; onclose: () => void } = $props();

  let name = $state("");

  function save() {
    const trimmed = name.trim();
    if (trimmed) onSave(trimmed);
    onclose();
  }
</script>

<Sheet id="name-reset-sheet" labelledby="name-reset-title" {onclose}>
  <h2 id="name-reset-title">Names, please</h2>
  <p id="name-reset-message" class="note">{NAME_RESET_MESSAGE}</p>
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
    <button id="name-reset-later" class="secondary" onclick={onclose}>Later</button>
  </div>
  <p class="sheet-hint">Tap outside to close</p>
</Sheet>
