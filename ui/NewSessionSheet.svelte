<!--
  Starting a night. The sheet owns its fields, the one-planned-night gate and
  the Start button's states; creating the session (sync.createSession, the
  app's lists, navigation) is routing.ts's, behind `onStart`. That's also what
  keeps the create path's doc shape where it was: this component never
  touches Firestore writes.

  The ids and classes are load-bearing: style.css and the e2e suite select on
  them. No scoped <style> here; the global stylesheet stays global.
-->
<script lang="ts">
  import Icon from "./Icon.svelte";
  import Sheet from "./Sheet.svelte";
  import { catalogue } from "./catalogue.svelte.js";
  import { editionLabel } from "./editions.js";
  import { history } from "./history.svelte.js";
  import { defaultWindowLabel } from "./request-window.js";
  import {
    type SessionEntry,
    fromDateInputValue,
    listSessions,
    partitionSessions,
    plannedSessionMessage,
    sessionDateLabel,
    toDateInputValue,
  } from "./session-index.js";

  /** What Start hands to `onStart`. */
  export interface NewSessionChoice {
    /** null means "now": the server stamps the moment of creation. */
    createdAt: Date | null;
    listed: boolean;
    editionId: string;
  }

  let {
    onStart,
    onclose,
  }: { onStart: (choice: NewSessionChoice) => Promise<void>; onclose: () => void } = $props();

  // firestore.rules caps createdAt at 60 days ahead; stop the picker a hair
  // earlier so a bad pick fails here, not as a rules error after Start.
  const MAX_AHEAD_DAYS = 59;

  // Each opening mounts the sheet afresh, so these are its opening values.
  // What the date picker showed when the sheet OPENED: Start compares against
  // this, not a recomputed "today": an untouched picker means "now" (server
  // stamp), and comparing against a fresh today would silently turn a sheet
  // left open across midnight into an explicit yesterday-evening pick.
  const dateDefault = toDateInputValue(new Date());
  const dateMax = toDateInputValue(new Date(Date.now() + MAX_AHEAD_DAYS * 86_400_000));
  let date = $state(dateDefault);
  // Always the default book, never the device's last-loaded one: a themed
  // night shouldn't quietly become next Tuesday's songbook too.
  let editionId = $state("current");
  let visibility: "shared" | "unlisted" = $state("shared");
  // Both selects ship a "current" option, so the default path never depends
  // on /api/editions answering.
  const editions = $derived(
    catalogue.editions.length
      ? catalogue.editions.map((e) => ({ id: e.id, label: editionLabel(e) }))
      : [{ id: "current", label: "Current" }],
  );
  // The soonest upcoming session from the last history load, or null. One
  // planned night at a time: while this is set, starting another SHARED
  // session is blocked, and Unlisted remains the escape hatch. Advisory only
  // (it can be stale, or empty after a failed load); start() re-checks
  // against Firestore, and a night it finds overrides this until the next
  // load.
  let planned: SessionEntry | null = $derived(
    partitionSessions(history.entries).upcoming[0] ?? null,
  );
  let busy = $state(false);
  let error = $state("");

  const blocked = $derived(Boolean(planned) && visibility === "shared");
  // Read-only preview of the smart default request window: nothing is stored
  // yet (see sync.ts's createSession), so this is purely informational. Same
  // "untouched picker means now" rule as start(), so the preview never
  // disagrees with what Start is about to send.
  const windowNote = $derived(
    defaultWindowLabel(
      (date && date !== dateDefault ? fromDateInputValue(date) : null) ?? new Date(),
    ),
  );

  async function start() {
    if (blocked || busy) return;
    // An untouched (or cleared) picker means "now": no createdAt is sent and
    // the server stamps the moment of creation. Only a genuinely different
    // day becomes an explicit date, stamped at that day's evening.
    const createdAt = date && date !== dateDefault ? fromDateInputValue(date) : null;
    const listed = visibility === "shared";
    error = "";
    busy = true;
    try {
      // One planned night at a time. The gate above is only advisory, so a
      // shared create re-asks Firestore here. Fail closed: an unanswered
      // question is not a "no"; Unlisted stays available either way.
      if (listed) {
        let found: SessionEntry | undefined;
        try {
          found = partitionSessions(await listSessions()).upcoming[0];
        } catch {
          throw new Error(
            "couldn’t check for planned sessions. Try again, or set Visibility to Unlisted",
          );
        }
        if (found) {
          planned = found;
          throw new Error(`a session is already planned for ${sessionDateLabel(found.createdAt)}`);
        }
      }
      await onStart({ createdAt, listed, editionId: editionId || "current" });
    } catch (err) {
      // Keep the sheet open with the picked date intact so Start is one tap
      // away once they're back on wifi. There is no local-only mode to fall
      // back to. A "planned session found" refusal leaves Start disabled, with
      // the notice explaining why.
      error = `Couldn’t start a session: ${(err as Error).message}`;
      busy = false;
    }
  }

  // Desktop nicety; native mobile date pickers never surface an Enter key.
  // Enter would sail past a disabled Start, so it honours the same gate.
  function onDateKeydown(event: KeyboardEvent) {
    if (event.key === "Enter") {
      event.preventDefault();
      start();
    }
  }
</script>

<!-- No autofocus: opening a date picker nobody needs to touch would put the
     extra tap back. Today is usually the answer: tap Start and go. -->
<Sheet id="new-session-sheet" labelledby="new-session-title" {onclose}>
  <h2 id="new-session-title">New session</h2>
  <!-- Sessions have no names: the date IS the identity, rendered live in
       each viewer's locale. Left on today, the server stamps the moment of
       creation (the happy path); any other day (backfilling a missed night
       or prepping a future one) stamps that day's evening instead. -->
  <label class="field">
    <span>Date</span>
    <input
      type="date"
      id="new-session-date"
      max={dateMax}
      bind:value={date}
      onkeydown={onDateKeydown}
    />
  </label>
  <!-- Editable overrides live in the share panel, once the session exists. -->
  <p class="note" id="new-session-window-note">{windowNote}</p>
  <!-- The night's songbook: one book per session is how the club plays. -->
  <label class="field">
    <span>Songbook</span>
    <select id="new-session-edition" bind:value={editionId}>
      {#each editions as edition (edition.id)}
        <option value={edition.id}>{edition.label}</option>
      {/each}
    </select>
  </label>
  <label class="field">
    <span>Visibility</span>
    <select id="new-session-visibility" bind:value={visibility}>
      <option value="shared">Shared</option>
      <option value="unlisted">Unlisted</option>
    </select>
  </label>
  <p class="note">Anyone with the link can open it either way.</p>
  <!-- One planned night at a time: while a session is coming up, Start is
       disabled for Shared and this note says why. -->
  <div id="new-session-notice" class="note planned-notice" hidden={!blocked}>
    {planned ? plannedSessionMessage(planned) : ""}
  </div>
  <div id="new-session-error" class="error" hidden={!error}>{error}</div>
  <div class="actions">
    <!-- Creating loads the Firestore chunk lazily, so the first tap can take
         a beat: hence the spinner. -->
    <button id="new-session-start" disabled={blocked || busy} onclick={start}>
      {#if busy}<Icon name="loader" extraClass="spin" />{:else}Start{/if}
    </button>
    <button id="new-session-cancel" class="secondary" onclick={onclose}>Cancel</button>
  </div>
  <p class="sheet-hint">Tap outside to close</p>
</Sheet>
