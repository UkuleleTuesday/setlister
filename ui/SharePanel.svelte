<script lang="ts">
  import Icon from "./Icon.svelte";
  import Presence from "./Presence.svelte";
  import { features } from "./features.js";
  import { fromDateTimeInputValue, requestNote, toDateTimeInputValue } from "./request-window.js";
  import { session } from "./session.svelte.js";
  import type { RequestsSwitch, SessionMeta } from "./types.js";

  let {
    onVisibility,
    onRequestsMode,
    onWindow,
    onShareLink,
    at,
    onclose,
    openers,
  }: {
    /** Rejects if the write didn't land, and the select reverts. */
    onVisibility: (listed: boolean) => Promise<void>;
    onRequestsMode: (mode: RequestsSwitch) => Promise<void>;
    /** null clears a side. */
    onWindow: (window: { opensAt: Date | null; closesAt: Date | null }) => Promise<void>;
    /** True when the link was copied rather than shared. */
    onShareLink: () => Promise<boolean>;
    at: "top" | "requests";
    onclose: () => void;
    /** Taps on these don't count as outside. */
    openers: () => Element[];
  } = $props();

  // Optimistic: the selects show a pick at once and revert if the write fails.
  // Until then each follows the stored value.
  let visibility: "shared" | "unlisted" = $derived(session.meta.listed ? "shared" : "unlisted");
  let requestsMode: RequestsSwitch = $derived(modeOf(session.meta));
  let visibilityBusy = $state(false);
  let requestsBusy = $state(false);
  let flashing = $state(false);
  let flashTimer: ReturnType<typeof setTimeout> | undefined;

  let panel: HTMLDivElement | undefined = $state();
  let requestsField: HTMLLabelElement | undefined = $state();
  let openTimeInput: HTMLInputElement | undefined = $state();
  let closeTimeInput: HTMLInputElement | undefined = $state();

  // The fields show the resolved window, so they never look empty. Hidden
  // outside auto, where the schedule isn't in effect.
  const auto = $derived(session.meta.requestsOpen === null);
  const resolved = $derived(session.link.window);
  const openTimeValue = $derived(resolved ? toDateTimeInputValue(resolved.opensAt) : "");
  const closeTimeValue = $derived(resolved ? toDateTimeInputValue(resolved.closesAt) : "");

  function modeOf(meta: SessionMeta): RequestsSwitch {
    return meta.requestsOpen === true ? "open" : meta.requestsOpen === false ? "closed" : "auto";
  }

  $effect(() => {
    if (at === "requests") requestsField?.scrollIntoView({ block: "nearest" });
  });

  async function changeVisibility(next: "shared" | "unlisted") {
    visibility = next;
    const listed = next === "shared";
    visibilityBusy = true;
    try {
      await onVisibility(listed);
    } catch {
      visibility = listed ? "unlisted" : "shared";
    } finally {
      visibilityBusy = false;
    }
  }

  // Passed in: a 3-way revert can't be read off "not this".
  async function changeRequestsMode(previous: RequestsSwitch) {
    requestsBusy = true;
    try {
      await onRequestsMode(requestsMode);
    } catch {
      requestsMode = previous;
    } finally {
      requestsBusy = false;
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
    try {
      await onWindow({ opensAt, closesAt });
    } catch {
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

  async function share() {
    if (!(await onShareLink())) return;
    clearTimeout(flashTimer);
    flashing = true;
    flashTimer = setTimeout(() => (flashing = false), 1500);
  }

  function onDocumentClick(event: MouseEvent) {
    const target = event.target as Node | null;
    if (!target || panel?.contains(target)) return;
    if (openers().some((el) => el.contains(target))) return;
    onclose();
  }

  function onKeydown(event: KeyboardEvent) {
    if (event.key === "Escape") onclose();
  }
</script>

<svelte:document onclick={onDocumentClick} onkeydown={onKeydown} />

<div
  id="share-panel"
  class="share-panel popover"
  role="dialog"
  aria-label="Session sharing"
  bind:this={panel}
>
  <!-- The id stays so it can be matched against a URL read out across the table. -->
  <p class="share-session-name" id="share-session-name">{session.label}</p>
  <p class="share-session-label note">
    Session id: <strong id="share-session-id">{session.id ?? ""}</strong>
  </p>
  <p class="note">
    Anyone with the link can follow the night and add requests. Only organisers can run it.
  </p>
  {#if features.unlistedSessions}
    <!-- Not a privacy control: the link works either way (see firestore.rules). -->
    <label class="field">
      <span>Visibility</span>
      <select
        id="share-visibility"
        value={visibility}
        disabled={visibilityBusy}
        onchange={(event) => changeVisibility(event.currentTarget.value as "shared" | "unlisted")}
      >
        <option value="shared">Shared</option>
        <option value="unlisted">Unlisted</option>
      </select>
    </label>
    <p class="note">Anyone with the link can open it either way.</p>
  {/if}
  <!-- Named for the link: "Requests: Closed" would read as the club no longer
       taking requests while the whiteboard carries on. -->
  <label class="field" bind:this={requestsField}>
    <span>Request link</span>
    <select
      id="share-requests"
      value={requestsMode}
      disabled={requestsBusy}
      onchange={(event) => {
        const previous = requestsMode;
        requestsMode = event.currentTarget.value as RequestsSwitch;
        changeRequestsMode(previous);
      }}
    >
      <option value="auto">Auto (follows the schedule)</option>
      <option value="open">Taking requests</option>
      <option value="closed">View only</option>
    </select>
  </label>
  <!-- datetime-local, so a close time past midnight has no day to infer. -->
  <label class="field" id="share-requests-open-time-field" hidden={!auto}>
    <span>Requests open</span>
    <input
      type="datetime-local"
      id="share-requests-open-time"
      value={auto ? openTimeValue : ""}
      bind:this={openTimeInput}
      onchange={() => changeWindow("open")}
    />
  </label>
  <button
    type="button"
    id="share-requests-open-reset"
    class="link-button"
    hidden={!auto || session.meta.requestsOpensAt === null}
    onclick={() => resetSide("open")}
  >
    Use default
  </button>
  <label class="field" id="share-requests-close-time-field" hidden={!auto}>
    <span>Requests close</span>
    <input
      type="datetime-local"
      id="share-requests-close-time"
      value={auto ? closeTimeValue : ""}
      bind:this={closeTimeInput}
      onchange={() => changeWindow("close")}
    />
  </label>
  <button
    type="button"
    id="share-requests-close-reset"
    class="link-button"
    hidden={!auto || session.meta.requestsClosesAt === null}
    onclick={() => resetSide("close")}
  >
    Use default
  </button>
  <Presence roster={session.id ? session.roster : []} />
  <p class="note" id="share-request-note">
    {requestNote(session.meta.requestsOpen, session.link)}
  </p>
  <div class="actions">
    <button id="share-link" class="btn btn-primary" onclick={share}>
      {#if flashing}<Icon name="check" /><span class="btn-label">Link copied</span>{:else}<Icon
          name="share"
        /><span class="btn-label">Share link</span>{/if}
    </button>
  </div>
</div>
