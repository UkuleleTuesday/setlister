<script lang="ts">
  import Icon from "./Icon.svelte";
  import Sheet from "./Sheet.svelte";
  import {
    fromDateTimeInputValue,
    roomNote,
    scheduleLabel,
    switchHelp,
    toDateTimeInputValue,
  } from "./request-window.js";
  import { session } from "./session.svelte.js";
  import type { RequestsSwitch } from "./types.js";

  let {
    onMode,
    onWindow,
    onclose,
  }: {
    /** Rejects if the write didn't land. */
    onMode: (mode: RequestsSwitch) => Promise<void>;
    /** null clears a side. */
    onWindow: (window: { opensAt: Date | null; closesAt: Date | null }) => Promise<void>;
    onclose: () => void;
  } = $props();

  const forced = $derived(session.meta.requestsOpen !== null);
  // The fields show the resolved window, so they never look empty.
  const resolved = $derived(session.link.window);
  const openTimeValue = $derived(resolved ? toDateTimeInputValue(resolved.opensAt) : "");
  const closeTimeValue = $derived(resolved ? toDateTimeInputValue(resolved.closesAt) : "");

  let busy = $state(false);
  let error = $state("");
  let openTimeInput: HTMLInputElement | undefined = $state();
  let closeTimeInput: HTMLInputElement | undefined = $state();

  async function setMode(mode: RequestsSwitch, input?: HTMLInputElement) {
    busy = true;
    error = "";
    try {
      await onMode(mode);
    } catch {
      error = "Couldn’t change the request link. Try again.";
      // The switch flipped itself; the stored state didn't move, so nothing re-renders it.
      if (input) input.checked = session.link.open;
    } finally {
      busy = false;
    }
  }

  // Sends the other side's stored override too, so one save can't clear it.
  // An empty field clears this side.
  async function changeWindow(side: "open" | "close") {
    const opensAt =
      side === "open" ? fromDateTimeInputValue(openTimeInput?.value) : session.meta.requestsOpensAt;
    const closesAt =
      side === "close"
        ? fromDateTimeInputValue(closeTimeInput?.value)
        : session.meta.requestsClosesAt;
    error = "";
    try {
      await onWindow({ opensAt, closesAt });
    } catch {
      error = "Couldn’t change the times. Try again.";
      // One-way bound: an unchanged value wouldn't reach the DOM on its own.
      if (openTimeInput) openTimeInput.value = openTimeValue;
      if (closeTimeInput) closeTimeInput.value = closeTimeValue;
    }
  }

  function resetSide(side: "open" | "close") {
    const input = side === "open" ? openTimeInput : closeTimeInput;
    if (input) input.value = "";
    changeWindow(side);
  }
</script>

<Sheet id="request-link-sheet" labelledby="request-link-title" {onclose}>
  <h2 id="request-link-title">Request link</h2>
  <label class="setting-row">
    <span class="setting-text">
      Taking requests
      <span class="setting-help" id="request-link-help">
        {switchHelp(session.meta.requestsOpen, session.link)}
      </span>
    </span>
    <input
      type="checkbox"
      role="switch"
      class="switch"
      id="request-link-switch"
      aria-describedby="request-link-help"
      checked={session.link.open}
      disabled={busy}
      onchange={(event) => {
        const input = event.currentTarget;
        setMode(input.checked ? "open" : "closed", input);
      }}
    />
  </label>
  {#if forced}
    <button
      type="button"
      id="request-link-auto"
      class="link-button request-link-auto"
      disabled={busy}
      onclick={() => setMode("auto")}
    >
      Back to schedule
    </button>
  {/if}
  <p class="note request-link-note" id="request-link-note">{roomNote(session.link.open)}</p>
  {#if error}<p class="error" role="alert">{error}</p>{/if}

  <!-- datetime-local, so a close time past midnight has no day to infer. -->
  <details class="disclosure" id="request-link-schedule">
    <summary>
      <span>
        Schedule
        <span class="disclosure-detail">
          {forced ? "(paused)" : scheduleLabel(resolved) && `· ${scheduleLabel(resolved)}`}
        </span>
      </span>
      <Icon name="chevron" extraClass="disclosure-chevron" />
    </summary>
    <label class="field">
      <span>Requests open</span>
      <input
        type="datetime-local"
        id="request-link-open-time"
        value={openTimeValue}
        bind:this={openTimeInput}
        onchange={() => changeWindow("open")}
      />
    </label>
    <button
      type="button"
      id="request-link-open-reset"
      class="link-button"
      hidden={session.meta.requestsOpensAt === null}
      onclick={() => resetSide("open")}
    >
      Use default
    </button>
    <label class="field">
      <span>Requests close</span>
      <input
        type="datetime-local"
        id="request-link-close-time"
        value={closeTimeValue}
        bind:this={closeTimeInput}
        onchange={() => changeWindow("close")}
      />
    </label>
    <button
      type="button"
      id="request-link-close-reset"
      class="link-button"
      hidden={session.meta.requestsClosesAt === null}
      onclick={() => resetSide("close")}
    >
      Use default
    </button>
    {#if forced}
      <p class="note">These apply once the link is back on schedule.</p>
    {/if}
  </details>

  <div class="actions">
    <button type="button" id="request-link-close" class="btn btn-soft" onclick={onclose}>
      Close
    </button>
  </div>
  <p class="sheet-hint">Tap outside to close</p>
</Sheet>
