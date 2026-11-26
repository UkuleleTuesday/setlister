<!--
  The in-session share popover, anchored under the share button: what the
  night is called, its visibility, the request link's mode and window, who's
  here, and the session link.

  It renders the session as sync last reported it (session.svelte.ts) and
  hands every change back through the props; sharing.ts writes the metadata.
  The panel only owns the optimistic-then-revert dance around those writes.

  The ids and classes are load-bearing: style.css and the e2e suite select on
  them. No scoped <style> here; the global stylesheet stays global.
-->
<script lang="ts">
  import Icon from "./Icon.svelte";
  import Presence from "./Presence.svelte";
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
    /** Write `listed`; reject if it didn't land (the select reverts). */
    onVisibility: (listed: boolean) => Promise<void>;
    /** Write the request link's mode; reject if it didn't land. */
    onRequestsMode: (mode: RequestsSwitch) => Promise<void>;
    /** Write the window overrides (null clears a side); reject if it didn't land. */
    onWindow: (window: { opensAt: Date | null; closesAt: Date | null }) => Promise<void>;
    /** Offer the session link; true when it was copied rather than shared. */
    onShareLink: () => Promise<boolean>;
    /** Where to open: the top, or scrolled to the request link. */
    at: "top" | "requests";
    onclose: () => void;
    /** Elements outside the panel that open it: taps on them don't close it. */
    openers: () => Element[];
  } = $props();

  // The two selects are optimistic: they show the pick at once and revert if
  // the write doesn't land. Each follows the stored value until then.
  let visibility: "shared" | "unlisted" = $derived(session.meta.listed ? "shared" : "unlisted");
  let requestsMode: RequestsSwitch = $derived(modeOf(session.meta));
  let visibilityBusy = $state(false);
  let requestsBusy = $state(false);
  // The share button is showing "Link copied".
  let flashing = $state(false);
  let flashTimer: ReturnType<typeof setTimeout> | undefined;

  let panel: HTMLDivElement | undefined = $state();
  let requestsField: HTMLLabelElement | undefined = $state();
  let openTimeInput: HTMLInputElement | undefined = $state();
  let closeTimeInput: HTMLInputElement | undefined = $state();

  // The window fields show the RESOLVED window (an override if set, else the
  // smart default) so they never look empty, and "Use default" shows only on
  // a side that has an override to clear. All hidden outside auto mode: a
  // forced open/closed makes the window inert, and live-looking fields for a
  // schedule that isn't in effect would lie.
  const auto = $derived(session.meta.requestsOpen === null);
  const resolved = $derived(session.link.window);
  const openTimeValue = $derived(resolved ? toDateTimeInputValue(resolved.opensAt) : "");
  const closeTimeValue = $derived(resolved ? toDateTimeInputValue(resolved.closesAt) : "");

  function modeOf(meta: SessionMeta): RequestsSwitch {
    return meta.requestsOpen === true ? "open" : meta.requestsOpen === false ? "closed" : "auto";
  }

  // The window chip's shortcut: the request link's row, in view.
  $effect(() => {
    if (at === "requests") requestsField?.scrollIntoView({ block: "nearest" });
  });

  // Shared / Unlisted. Unlisted removes the row from the club's list only;
  // the link keeps working, which the note under the select says out loud.
  async function changeVisibility(next: "shared" | "unlisted") {
    visibility = next;
    const listed = next === "shared";
    visibilityBusy = true;
    try {
      await onVisibility(listed);
    } catch {
      visibility = listed ? "unlisted" : "shared"; // the write didn't land
    } finally {
      visibilityBusy = false;
    }
  }

  // Auto / Taking requests / View only. The previous value is remembered
  // rather than inferred: a 3-way revert can't be read off "not this".
  async function changeRequestsMode(previous: RequestsSwitch) {
    requestsBusy = true;
    try {
      await onRequestsMode(requestsMode);
    } catch {
      requestsMode = previous; // the write didn't land
    } finally {
      requestsBusy = false;
    }
  }

  // Each side writes independently: the other side's stored override goes
  // out with it, so one save can't silently clear the other. An empty field
  // (a cleared picker, or "Use default") clears that side's override.
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
      // Put back what's stored. The fields are one-way bound, so an unchanged
      // value wouldn't reach the DOM on its own.
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

  // Forgiving dismissal: a tap anywhere outside closes it, except on the
  // buttons that open it. Escape is a desktop bonus.
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

<!-- Anchored top-left under the share button, mirroring the settings panel. -->
<div
  id="share-panel"
  class="share-panel"
  role="dialog"
  aria-label="Session sharing"
  bind:this={panel}
>
  <!-- Lead with what the night is called; the raw id is just the link slug,
       demoted to a footnote so it can still be matched against the URL read
       out across the table. -->
  <p class="share-session-name" id="share-session-name">{session.label}</p>
  <p class="share-session-label note">
    Session id: <strong id="share-session-id">{session.id ?? ""}</strong>
  </p>
  <p class="note">
    Anyone with the link can follow the night and add requests. Only organisers can run it.
  </p>
  <!-- Whether this night appears in the club's session list. NOT a privacy
       control: the link works either way (see firestore.rules), as the note
       underneath says. "Shared" names the listed state, not a level of
       access. -->
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
  <!-- Whether the request link below takes tunes (#86). Named after that
       LINK, not "requests", with states that say what the link does:
       "Requests: Closed" above a "Share request link" button would read as a
       contradiction, or as the club having stopped taking requests while the
       whiteboard carries on. -->
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
  <!-- The request window: when Auto's own schedule opens/closes the link.
       datetime-local rather than a bare time picker, so there's no
       day-of-week to infer for a close time past midnight. -->
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
  <!-- What the link does for the room (#86) right
       now: see requestNote in request-window.ts. -->
  <p class="note" id="share-request-note">
    {requestNote(session.meta.requestsOpen, session.link)}
  </p>
  <div class="actions">
    <button id="share-link" onclick={share}>
      {#if flashing}<Icon name="check" /><span class="btn-label">Link copied</span>{:else}<Icon
          name="share"
        /><span class="btn-label">Share link</span>{/if}
    </button>
  </div>
</div>
