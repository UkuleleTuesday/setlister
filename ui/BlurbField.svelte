<script lang="ts">
  import { BLURB_MAX } from "./session-index.js";

  let {
    id,
    value = $bindable(),
    help,
    error = "",
    disabled = false,
    onchange,
  }: {
    id: string;
    value: string;
    help: string;
    error?: string;
    disabled?: boolean;
    onchange?: () => void;
  } = $props();

  // Near the cap only: maxlength cuts a paste off silently.
  const left = $derived(BLURB_MAX - value.length);

  // One line on the card: Enter finishes the note.
  function onkeydown(event: KeyboardEvent & { currentTarget: HTMLTextAreaElement }) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    event.currentTarget.blur();
  }
</script>

<label class="field">
  <span>Note for the room</span>
  <textarea
    {id}
    rows="3"
    maxlength={BLURB_MAX}
    placeholder={disabled ? "" : "A theme, a room change, a guest"}
    enterkeyhint="done"
    aria-describedby="{id}-help"
    {disabled}
    bind:value
    {onchange}
    {onkeydown}></textarea>
</label>
<p class="note" id="{id}-help">
  {help}{#if left <= 20}<span class="blurb-left"> {left} left.</span>{/if}
</p>
{#if error}<p class="error">{error}</p>{/if}
