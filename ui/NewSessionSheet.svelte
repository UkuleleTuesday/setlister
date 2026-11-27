<!-- routing.ts creates the session behind `onStart`: this sheet never writes to Firestore. -->
<script lang="ts">
  import Icon from "./Icon.svelte";
  import Sheet from "./Sheet.svelte";
  import { catalogue } from "./catalogue.svelte.js";
  import { editionLabel } from "./editions.js";
  import { features } from "./features.js";
  import { history } from "./history.svelte.js";
  import { defaultWindowLabel } from "./request-window.js";
  import {
    BLURB_MAX,
    DEFAULT_BLURB,
    type SessionEntry,
    fromDateInputValue,
    listSessions,
    partitionSessions,
    plannedSessionMessage,
    sessionDateLabel,
    toDateInputValue,
  } from "./session-index.js";

  export interface NewSessionChoice {
    /** null means "now": the server stamps the moment of creation. */
    createdAt: Date | null;
    listed: boolean;
    editionId: string;
    blurb: string;
  }

  let {
    onStart,
    onclose,
  }: { onStart: (choice: NewSessionChoice) => Promise<void>; onclose: () => void } = $props();

  // firestore.rules caps createdAt at 60 days ahead; stop the picker a hair
  // earlier so a bad pick fails here, not as a rules error after Start.
  const MAX_AHEAD_DAYS = 59;

  // Start compares against the date the sheet opened on: a recomputed today
  // would turn a sheet left open past midnight into an explicit yesterday pick.
  const dateDefault = toDateInputValue(new Date());
  const dateMax = toDateInputValue(new Date(Date.now() + MAX_AHEAD_DAYS * 86_400_000));
  let date = $state(dateDefault);
  // Always the default book, never the device's last-loaded one: a themed
  // night shouldn't quietly become next Tuesday's songbook too.
  let editionId = $state("current");
  let visibility: "shared" | "unlisted" = $state("shared");
  let blurb = $state("");
  // Both selects ship a "current" option, so the default path never depends
  // on /api/editions answering.
  const editions = $derived(
    catalogue.editions.length
      ? catalogue.editions.map((e) => ({ id: e.id, label: editionLabel(e) }))
      : [{ id: "current", label: "Current" }],
  );
  // One planned shared night at a time. Advisory (can be stale or empty):
  // start() re-checks Firestore and overrides it.
  let planned: SessionEntry | null = $derived(
    partitionSessions(history.entries).upcoming[0] ?? null,
  );
  const changed = $derived(
    date !== dateDefault ||
      editionId !== "current" ||
      visibility !== "shared" ||
      blurb.trim() !== "",
  );
  let busy = $state(false);
  let error = $state("");

  const blocked = $derived(Boolean(planned) && visibility === "shared");
  // Same untouched-picker rule as start(), so the preview matches what it sends.
  const windowNote = $derived(
    defaultWindowLabel(
      (date && date !== dateDefault ? fromDateInputValue(date) : null) ?? new Date(),
    ),
  );

  async function start() {
    if (blocked || busy) return;
    const createdAt = date && date !== dateDefault ? fromDateInputValue(date) : null;
    const listed = visibility === "shared";
    error = "";
    busy = true;
    try {
      // Fail closed: an unanswered check is not a "no".
      if (listed) {
        let found: SessionEntry | undefined;
        try {
          found = partitionSessions(await listSessions()).upcoming[0];
        } catch {
          throw new Error(
            features.unlistedSessions
              ? "couldn’t check for planned sessions. Try again, or set Visibility to Unlisted"
              : "couldn’t check for planned sessions. Try again",
          );
        }
        if (found) {
          planned = found;
          throw new Error(`a session is already planned for ${sessionDateLabel(found.createdAt)}`);
        }
      }
      await onStart({ createdAt, listed, editionId: editionId || "current", blurb });
    } catch (err) {
      // Stay open with the date intact. A found planned night keeps Start disabled.
      error = `Couldn’t start a session: ${(err as Error).message}`;
      busy = false;
    }
  }

  // Desktop only. start() re-checks the gate a disabled button enforces.
  function onDateKeydown(event: KeyboardEvent) {
    if (event.key === "Enter") {
      event.preventDefault();
      start();
    }
  }
</script>

<!-- No autofocus: today is usually right, so the date picker stays shut. -->
<Sheet id="new-session-sheet" labelledby="new-session-title" {onclose} holdsInput={changed}>
  <h2 id="new-session-title">New session</h2>
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
  <!-- Read-only: the request link sheet edits the window once the session exists. -->
  <p class="note" id="new-session-window-note">{windowNote}</p>
  <label class="field">
    <span>Note for the room</span>
    <textarea
      id="new-session-blurb"
      rows="2"
      maxlength={BLURB_MAX}
      placeholder={DEFAULT_BLURB}
      bind:value={blurb}
      onkeydown={(event) => event.key === "Enter" && event.preventDefault()}></textarea>
  </label>
  <p class="note">Shows under the night on everyone’s home screen. Optional.</p>
  <label class="field">
    <span>Songbook</span>
    <select id="new-session-edition" bind:value={editionId}>
      {#each editions as edition (edition.id)}
        <option value={edition.id}>{edition.label}</option>
      {/each}
    </select>
  </label>
  {#if features.unlistedSessions}
    <label class="field">
      <span>Visibility</span>
      <select id="new-session-visibility" bind:value={visibility}>
        <option value="shared">Shared</option>
        <option value="unlisted">Unlisted</option>
      </select>
    </label>
    <p class="note">Anyone with the link can open it either way.</p>
  {/if}
  <div id="new-session-notice" class="note planned-notice" hidden={!blocked}>
    {planned ? plannedSessionMessage(planned) : ""}
  </div>
  <div id="new-session-error" class="error" hidden={!error}>{error}</div>
  <div class="actions">
    <!-- The first create lazy-loads Firestore, hence the spinner. -->
    <button
      id="new-session-start"
      class="btn btn-primary"
      disabled={blocked || busy}
      onclick={start}
    >
      {#if busy}<Icon name="loader" extraClass="spin" />{:else}Start{/if}
    </button>
    <button id="new-session-cancel" class="btn btn-soft" onclick={onclose}>Cancel</button>
  </div>
</Sheet>
