<!--
  The in-session share popover, anchored under the share button: what the
  night is called, its visibility, the request link's mode and window, who's
  here, and the two links.

  It renders what main.ts hands it through update() / setRoster() /
  setRequestNote(), and hands every change back through the props. Session
  metadata (listed, requestsOpen, the window) is written by main.ts through
  sync.ts's own metadata writes, never the debounced row push (see the sync.ts
  header); the panel only owns the optimistic-then-revert dance around them.

  The ids and classes are load-bearing: style.css and the e2e suite select on
  them. No scoped <style> here; the global stylesheet stays global.
-->
<script lang="ts">
  import { tick } from "svelte";
  import Icon from "./Icon.svelte";
  import Presence from "./Presence.svelte";
  import type { RosterEntry } from "./presence.js";
  import { fromDateTimeInputValue, resolveWindow, toDateTimeInputValue } from "./request-window.js";
  import type { SessionMeta } from "./types.js";

  export type RequestsMode = "auto" | "open" | "closed";

  /** What the panel shows, from sync's current state. */
  export interface ShareView {
    id: string | null;
    label: string;
    meta: SessionMeta;
    createdAt: Date | null;
  }

  let {
    onVisibility,
    onRequestsMode,
    onWindow,
    onShareLink,
    onShareRoomLink,
    onOpenChange,
    openers,
  }: {
    /** Write `listed`; reject if it didn't land (the select reverts). */
    onVisibility: (listed: boolean) => Promise<void>;
    /** Write the request link's mode; reject if it didn't land. */
    onRequestsMode: (mode: RequestsMode) => Promise<void>;
    /** Write the window overrides (null clears a side); reject if it didn't land. */
    onWindow: (window: { opensAt: Date | null; closesAt: Date | null }) => Promise<void>;
    /** Offer the full-app link; true when it was copied rather than shared. */
    onShareLink: () => Promise<boolean>;
    /** Offer the room's request link; true when it was copied. */
    onShareRoomLink: () => Promise<boolean>;
    onOpenChange: (open: boolean) => void;
    /** Elements outside the panel that open it: taps on them don't close it. */
    openers: () => Element[];
  } = $props();

  // The markup carries the open wording so the panel reads correctly before
  // the first render.
  const OPEN_NOTE =
    "The request link is a view for the room: people can add tunes and follow the set, not change it.";

  let isOpen = $state(false);
  let view: ShareView = $state({
    id: null,
    label: "",
    meta: {
      createdBy: "",
      listed: false,
      requestsOpen: null,
      requestsOpensAt: null,
      requestsClosesAt: null,
      legacy: false,
    },
    createdAt: null,
  });
  let roster: RosterEntry[] = $state([]);
  let requestNote = $state(OPEN_NOTE);

  // The two selects are optimistic: they show the pick at once and revert if
  // the write doesn't land, so they hold their own value between updates.
  let visibility: "shared" | "unlisted" = $state("unlisted");
  let requestsMode: RequestsMode = $state("auto");
  let visibilityBusy = $state(false);
  let requestsBusy = $state(false);
  // Which share button is showing "Link copied".
  let flashing: "link" | "room" | null = $state(null);
  let flashTimer: ReturnType<typeof setTimeout> | undefined;

  let panel: HTMLDivElement | undefined = $state();
  let requestsField: HTMLLabelElement | undefined = $state();
  let openTimeInput: HTMLInputElement | undefined = $state();
  let closeTimeInput: HTMLInputElement | undefined = $state();

  // The window fields show the CURRENTLY RESOLVED window (an explicit
  // override if set, else the smart default) so they never look empty, and
  // "Use default" shows only on a side that has an override to clear. All
  // hidden outside auto mode: a forced open/closed makes the window inert,
  // and live-looking fields for a schedule that isn't in effect would lie.
  const auto = $derived(view.meta.requestsOpen === null);
  const resolved = $derived(
    resolveWindow({
      sessionCreatedAt: view.createdAt,
      opensAtOverride: view.meta.requestsOpensAt,
      closesAtOverride: view.meta.requestsClosesAt,
    }),
  );
  const openTimeValue = $derived(resolved ? toDateTimeInputValue(resolved.opensAt) : "");
  const closeTimeValue = $derived(resolved ? toDateTimeInputValue(resolved.closesAt) : "");

  function modeOf(meta: SessionMeta): RequestsMode {
    return meta.requestsOpen === true ? "open" : meta.requestsOpen === false ? "closed" : "auto";
  }

  /** Re-render from sync's state (a peer's flip, a write landing, a route). */
  export function update(next: ShareView) {
    view = next;
    visibility = next.meta.listed ? "shared" : "unlisted";
    requestsMode = modeOf(next.meta);
    // A failed window write leaves the input showing the rejected value;
    // putting back what's stored is the revert. The fields are one-way bound,
    // so an unchanged value wouldn't reach the DOM on its own.
    if (openTimeInput) openTimeInput.value = openTimeValue;
    if (closeTimeInput) closeTimeInput.value = closeTimeValue;
  }

  export function setRoster(next: RosterEntry[]) {
    roster = next;
  }

  /** What the request link does right now (main.ts resolves it against the clock). */
  export function setRequestNote(text: string) {
    requestNote = text;
  }

  export function setOpen(open: boolean) {
    if (isOpen === open) return;
    isOpen = open;
    onOpenChange(open);
  }

  export function isPanelOpen() {
    return isOpen;
  }

  /** Open on the request link's row: the window chip's shortcut. */
  export async function revealRequests() {
    setOpen(true);
    await tick();
    requestsField?.scrollIntoView({ block: "nearest" });
  }

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
  async function changeRequestsMode(previous: RequestsMode) {
    requestsBusy = true;
    try {
      await onRequestsMode(requestsMode);
    } catch {
      requestsMode = previous; // the write didn't land
    } finally {
      requestsBusy = false;
    }
  }

  // Each side writes independently: touching Opens never disturbs whatever
  // Closes currently resolves to, and vice versa. Both current values always
  // go out, so one save can't silently clear the other side. An empty field
  // (a cleared picker, or "Use default") clears that side's override.
  async function changeWindow(side: "open" | "close") {
    const opensAt =
      side === "open" ? fromDateTimeInputValue(openTimeInput?.value) : view.meta.requestsOpensAt;
    const closesAt =
      side === "close" ? fromDateTimeInputValue(closeTimeInput?.value) : view.meta.requestsClosesAt;
    try {
      await onWindow({ opensAt, closesAt });
    } catch {
      // main.ts re-renders through update() on failure, which puts the stored
      // value back in the field.
    }
  }

  function resetSide(side: "open" | "close") {
    const input = side === "open" ? openTimeInput : closeTimeInput;
    if (input) input.value = "";
    changeWindow(side);
  }

  async function share(which: "link" | "room") {
    const copied = await (which === "link" ? onShareLink() : onShareRoomLink());
    if (!copied) return;
    clearTimeout(flashTimer);
    flashing = which;
    flashTimer = setTimeout(() => (flashing = null), 1500);
  }

  // Forgiving dismissal: a tap anywhere outside closes it, except on the
  // buttons that open it. Escape is a desktop bonus.
  function onDocumentClick(event: MouseEvent) {
    const target = event.target as Node | null;
    if (!isOpen || !target || panel?.contains(target)) return;
    if (openers().some((el) => el.contains(target))) return;
    setOpen(false);
  }

  function onKeydown(event: KeyboardEvent) {
    if (event.key === "Escape") setOpen(false);
  }
</script>

<svelte:document onclick={onDocumentClick} onkeydown={onKeydown} />

<!-- In-session popover (mirrors the settings panel, anchored top-left). Only
     shown once a session is active. -->
<div
  id="share-panel"
  class="share-panel"
  role="dialog"
  aria-label="Session sharing"
  hidden={!isOpen}
  bind:this={panel}
>
  <!-- Lead with what the night is called; the raw id is just the link slug,
       demoted to a footnote so it can still be matched against the URL read
       out across the table. -->
  <p class="share-session-name" id="share-session-name">{view.label}</p>
  <p class="share-session-label note">
    Session id: <strong id="share-session-id">{view.id ?? ""}</strong>
  </p>
  <p class="note">Anyone with the link can view and edit these lists live.</p>
  <!-- Whether this night appears in the club's session list. NOT a privacy
       control: the link works either way (see firestore.rules), which is
       what the note underneath is for: "Shared" names the listed state, not
       a different level of access. -->
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
  <!-- Whether the request link below still takes tunes (#86). Named after
       that LINK, not after "requests", and its states describe what the link
       does: "Requests: Closed" above a button offering to share a request
       link read as a contradiction, and to an organiser as the club having
       stopped taking requests at all, when the whiteboard carries on. -->
  <label class="field" bind:this={requestsField}>
    <span>Request link</span>
    <select
      id="share-requests"
      value={requestsMode}
      disabled={requestsBusy}
      onchange={(event) => {
        const previous = requestsMode;
        requestsMode = event.currentTarget.value as RequestsMode;
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
    hidden={!auto || view.meta.requestsOpensAt === null}
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
    hidden={!auto || view.meta.requestsClosesAt === null}
    onclick={() => resetSide("close")}
  >
    Use default
  </button>
  <Presence roster={view.id ? roster : []} />
  <!-- The room link (#86) opens the room view: it's what goes to the club's
       WhatsApp group, distinct from the full link. This note says what that
       link does RIGHT NOW: a fixed promise that people can add tunes would be
       a lie for half the switch's states, and it's also where the organiser
       is told the whiteboard is unaffected. -->
  <p class="note" id="share-request-note">{requestNote}</p>
  <div class="actions">
    <button id="share-link" onclick={() => share("link")}>
      {#if flashing === "link"}<Icon name="check" /><span class="btn-label">
          Link copied
        </span>{:else}<Icon name="share" /><span class="btn-label">Share link</span>{/if}
    </button>
    <button id="share-room-link" class="secondary" onclick={() => share("room")}>
      {#if flashing === "room"}<Icon name="check" /><span class="btn-label">
          Link copied
        </span>{:else}<Icon name="share" /><span class="btn-label">Share request link</span>{/if}
    </button>
  </div>
</div>
