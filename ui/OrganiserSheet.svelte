<!--
  Registering this phone from the organiser link (#151). organiser.svelte.ts
  runs the steps; this draws whichever one it's on. The name step shows only
  when the phone has no name yet: the row is how the organisers see whose
  phone registered.

  Closing it never undoes anything: a registration that landed stays, and one
  that didn't is a re-tap of the link away.

  The ids and classes are load-bearing: style.css and the e2e suite select on
  them. No scoped <style> here; the global stylesheet stays global.
-->
<script lang="ts">
  import Sheet from "./Sheet.svelte";
  import { organiser, register, registerAs } from "./organiser.svelte.js";

  let { onclose }: { onclose: () => void } = $props();

  let name = $state("");

  function submit() {
    if (name.trim()) registerAs(name);
  }
</script>

<Sheet id="organiser-sheet" labelledby="organiser-title" {onclose}>
  {#if organiser.sheet === "name"}
    <h2 id="organiser-title">Run nights from this phone</h2>
    <p class="note">Add your name so the other organisers know whose phone this is.</p>
    <label class="field">
      <span>Your name</span>
      <input
        type="text"
        id="organiser-name"
        autocomplete="name"
        maxlength="60"
        placeholder="e.g. Alex"
        bind:value={name}
        onkeydown={(event) => {
          if (event.key === "Enter") submit();
        }}
      />
    </label>
    <div class="actions">
      <button id="organiser-register" onclick={submit} disabled={!name.trim()}>Register</button>
      <button class="secondary" onclick={onclose}>Not now</button>
    </div>
  {:else if organiser.sheet === "working"}
    <h2 id="organiser-title">Registering this phone…</h2>
    <p class="note">One moment.</p>
  {:else if organiser.sheet === "done"}
    <h2 id="organiser-title">You’re an organiser</h2>
    <p id="organiser-message" class="note">This phone can now run nights.</p>
    <div class="actions">
      <button id="organiser-ok" onclick={onclose}>OK</button>
    </div>
  {:else if organiser.sheet === "stale"}
    <h2 id="organiser-title">Link out of date</h2>
    <p id="organiser-message" class="note">
      That organiser link is out of date. Ask for the latest one in the organisers’ chat.
    </p>
    <div class="actions">
      <button id="organiser-ok" onclick={onclose}>OK</button>
    </div>
  {:else}
    <h2 id="organiser-title">Couldn’t register this phone</h2>
    <p id="organiser-message" class="note">{organiser.error}</p>
    <div class="actions">
      <button id="organiser-retry" onclick={register}>Try again</button>
      <button class="secondary" onclick={onclose}>Close</button>
    </div>
  {/if}
  <p class="sheet-hint">Tap outside to close</p>
</Sheet>
