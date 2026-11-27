<script lang="ts">
  import Sheet from "./Sheet.svelte";
  import {
    closeOrganiserSheet,
    organiser,
    register,
    registerAs,
    reloadToRegister,
  } from "./organiser.svelte.js";
  import { organiserStatus } from "./organiser-status.svelte.js";

  let name = $state("");
  let heading: HTMLHeadingElement | undefined = $state();

  // Refocus the heading on each step so screen readers follow it.
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
      Add your name so the other organisers know whose device this is. It’s also the name the room
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
      <button
        id="organiser-register"
        class="btn btn-primary"
        onclick={submit}
        disabled={!name.trim()}
      >
        Register this device
      </button>
      <button
        id="organiser-cancel"
        class="btn btn-soft"
        onclick={() => closeOrganiserSheet({ forget: true })}
      >
        Cancel
      </button>
    </div>
  {:else if organiser.sheet === "working"}
    <h2 id="organiser-title" tabindex="-1" bind:this={heading}>Registering this device</h2>
    <p id="organiser-message" class="note" role="status">Tuning up… This takes a few seconds.</p>
  {:else if organiser.sheet === "done"}
    <h2 id="organiser-title" tabindex="-1" bind:this={heading}>You’re on the organiser list</h2>
    <p id="organiser-message" class="note" role="status">
      Registered as {organiserStatus.name}. This device can now run nights.
    </p>
    <div class="actions">
      <button id="organiser-ok" class="btn btn-primary" onclick={() => closeOrganiserSheet()}>
        OK
      </button>
    </div>
  {:else if organiser.sheet === "stale"}
    <h2 id="organiser-title" tabindex="-1" bind:this={heading}>This link has been retired</h2>
    <p id="organiser-message" class="note" role="status">
      The organiser link has changed. Open the newest one pinned in the organisers’ chat.
    </p>
    <div class="actions">
      <button id="organiser-ok" class="btn btn-primary" onclick={() => closeOrganiserSheet()}>
        OK
      </button>
    </div>
  {:else}
    <h2 id="organiser-title" tabindex="-1" bind:this={heading}>Couldn’t register this device</h2>
    <p id="organiser-message" class="note" role="alert">{organiser.failure?.message}</p>
    <div class="actions">
      {#if organiser.failure?.action === "reload"}
        <button id="organiser-reload" class="btn btn-primary" onclick={reloadToRegister}>
          Reload
        </button>
      {:else}
        <button id="organiser-retry" class="btn btn-primary" onclick={register}>Try again</button>
      {/if}
      <button class="btn btn-soft" onclick={() => closeOrganiserSheet()}>Close</button>
    </div>
  {/if}
  {#if organiser.sheet !== "working"}
    <p class="sheet-hint">Tap outside to close</p>
  {/if}
</Sheet>
