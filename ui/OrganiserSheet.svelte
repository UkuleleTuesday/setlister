<!--
  Registering this phone from the organiser link (#151), tapped from the chat
  or pasted in Settings. organiser.svelte.ts runs the steps; this draws
  whichever one it's on. The name step always shows, filled in with the
  phone's name: it says who is registering and what's about to happen.

  Closing it never undoes anything. A tap outside keeps the link for this tab,
  so a reload offers the sheet again; Cancel forgets it. Each step's heading
  takes focus and the message is announced, so a screen reader follows along.

  The ids and classes are load-bearing: style.css and the e2e suite select on
  them. No scoped <style> here; the global stylesheet stays global.
-->
<script lang="ts">
  import Sheet from "./Sheet.svelte";
  import { night } from "./night.svelte.js";
  import {
    closeOrganiserSheet,
    organiser,
    register,
    registerAs,
    reloadToRegister,
  } from "./organiser.svelte.js";

  let name = $state(night.name.trim());
  let heading: HTMLHeadingElement | undefined = $state();

  // A new step is a new heading: move focus there so it's read out.
  $effect(() => {
    void organiser.sheet;
    heading?.focus();
  });

  function submit() {
    if (name.trim()) registerAs(name);
  }
</script>

<Sheet id="organiser-sheet" labelledby="organiser-title" onclose={() => closeOrganiserSheet()}>
  {#if organiser.sheet === "name"}
    <h2 id="organiser-title" tabindex="-1" bind:this={heading}>Register as an organiser</h2>
    <p class="note">
      Add your name so the other organisers know whose phone this is. It’s also the name the room
      sees on your requests.
    </p>
    <label class="field">
      <span>Your name</span>
      <input
        type="text"
        id="organiser-name"
        autocomplete="name"
        autocapitalize="words"
        enterkeyhint="go"
        maxlength="60"
        placeholder="e.g. Alex"
        bind:value={name}
        onkeydown={(event) => {
          if (event.key === "Enter") submit();
        }}
      />
    </label>
    <div class="actions">
      <button id="organiser-register" onclick={submit} disabled={!name.trim()}>
        Register this phone
      </button>
      <button
        id="organiser-cancel"
        class="secondary"
        onclick={() => closeOrganiserSheet({ forget: true })}
      >
        Cancel
      </button>
    </div>
  {:else if organiser.sheet === "working"}
    <h2 id="organiser-title" tabindex="-1" bind:this={heading}>Registering this phone</h2>
    <p id="organiser-message" class="note" role="status">Tuning up… This takes a few seconds.</p>
  {:else if organiser.sheet === "done"}
    <h2 id="organiser-title" tabindex="-1" bind:this={heading}>You’re on the organiser list</h2>
    <p id="organiser-message" class="note" role="status">
      Registered as {organiser.name}. Nothing changes yet: when running nights becomes
      organisers-only, this phone is ready.
    </p>
    <div class="actions">
      <button id="organiser-ok" onclick={() => closeOrganiserSheet()}>OK</button>
    </div>
  {:else if organiser.sheet === "stale"}
    <h2 id="organiser-title" tabindex="-1" bind:this={heading}>This link has been retired</h2>
    <p id="organiser-message" class="note" role="status">
      The organiser link has changed. Open the newest one pinned in the organisers’ chat.
    </p>
    <div class="actions">
      <button id="organiser-ok" onclick={() => closeOrganiserSheet()}>OK</button>
    </div>
  {:else}
    <h2 id="organiser-title" tabindex="-1" bind:this={heading}>Couldn’t register this phone</h2>
    <p id="organiser-message" class="note" role="alert">{organiser.failure?.message}</p>
    <div class="actions">
      {#if organiser.failure?.action === "reload"}
        <button id="organiser-reload" onclick={reloadToRegister}>Reload</button>
      {:else}
        <button id="organiser-retry" onclick={register}>Try again</button>
      {/if}
      <button class="secondary" onclick={() => closeOrganiserSheet()}>Close</button>
    </div>
  {/if}
  {#if organiser.sheet !== "working"}
    <p class="sheet-hint">Tap outside to close</p>
  {/if}
</Sheet>
