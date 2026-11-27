<script lang="ts">
  import Icon from "./Icon.svelte";
  import { history, loadHistory } from "./history.svelte.js";
  import { notices } from "./notices.svelte.js";
  import { organiserStatus } from "./organiser-status.svelte.js";
  import { type SessionEntry, disambiguate, partitionSessions } from "./session-index.js";

  let {
    onPick,
    onNewSession,
  }: {
    onPick: (id: string) => void;
    onNewSession: () => void;
  } = $props();

  // About a month of Tuesdays.
  const PAST_VISIBLE = 5;

  // Survives a history reload, so a background refresh doesn't slam it shut.
  let pastOlderOpen = $state(false);

  // Label the WHOLE list before splitting, so two sessions the same night get
  // their disambiguating time suffixes even when one of them is the hero.
  const layout = $derived.by(() => {
    const now = new Date();
    return partitionSessions(disambiguate(history.entries, now), now);
  });
  const next = $derived(layout.upcoming[0]);
  // Never hide a single row behind a one-row disclosure.
  const collapse = $derived(layout.past.length > PAST_VISIBLE + 1);
  const pastVisible = $derived(collapse ? layout.past.slice(0, PAST_VISIBLE) : layout.past);
  const pastOlder = $derived(collapse ? layout.past.slice(PAST_VISIBLE) : []);

  const statusText = $derived(
    history.status === "loading"
      ? "Loading sessions…"
      : history.status === "error"
        ? "Couldn’t load sessions."
        : history.entries.length
          ? ""
          : organiserStatus.isOrganiser
            ? "No sessions yet. Start one above."
            : "No sessions yet.",
  );

  function startedBy(entry: SessionEntry) {
    return entry.createdBy ? `Started by ${entry.createdBy}` : "Started by someone";
  }
</script>

<!-- A just-created doc awaiting its server timestamp labels as "". -->
{#snippet item(entry: SessionEntry & { label: string }, extraClass = "")}
  <li>
    <button
      type="button"
      class={["session-item", extraClass]}
      data-id={entry.id}
      onclick={() => onPick(entry.id)}
    >
      <span class="session-item-name">{entry.label || "Date pending"}</span><span
        class="session-item-meta"
      >
        {startedBy(entry)}
      </span>
    </button>
  </li>
{/snippet}

{#if organiserStatus.isOrganiser}
  <button
    id="new-session"
    class="primary-action"
    class:secondary-new={Boolean(next)}
    type="button"
    onclick={onNewSession}
  >
    <Icon name="add" /><span class="btn-label">New session</span>
  </button>
{/if}
<div id="home-error" class="error" hidden={!notices.home.text}>{notices.home.text}</div>

<h2 id="upcoming-heading" hidden={layout.upcoming.length === 0}>Coming up</h2>
<div id="next-session" hidden={!next}>
  {#if next}
    <!-- No CTA verb: home opens the full view, so any verb would miscast someone. -->
    <button
      type="button"
      class="next-session-card"
      data-id={next.id}
      onclick={() => onPick(next.id)}
    >
      <span class="next-session-kicker">Next session</span><span class="next-session-name">
        {next.label || "Date pending"}
      </span><span class="next-session-meta">{startedBy(next)}</span>
    </button>
  {/if}
</div>
<ul id="upcoming-list" class="session-list">
  {#each layout.upcoming.slice(1) as entry (entry.id)}
    {@render item(entry, "upcoming")}
  {/each}
</ul>

<h2 id="past-heading" hidden={layout.past.length === 0}>Past sessions</h2>
<ul id="session-list" class="session-list">
  {#each pastVisible as entry (entry.id)}
    {@render item(entry)}
  {/each}
</ul>
<div id="past-older" class="row-group" hidden={pastOlder.length === 0}>
  {#if pastOlder.length}
    <button
      type="button"
      class="group-toggle"
      aria-expanded={pastOlderOpen}
      aria-controls="past-older-rows"
      onclick={() => (pastOlderOpen = !pastOlderOpen)}
    >
      <span class="group-label">
        {pastOlder.length} older {pastOlder.length === 1 ? "session" : "sessions"}
      </span><Icon name="chevron" extraClass="group-chevron" />
    </button>
    {#if pastOlderOpen}
      <ul id="past-older-rows" class="session-list group-rows">
        {#each pastOlder as entry (entry.id)}
          {@render item(entry)}
        {/each}
      </ul>
    {/if}
  {/if}
</div>
<p id="session-list-status" class="note" aria-live="polite" hidden={statusText === ""}>
  {statusText}
</p>
<button
  id="session-list-retry"
  class="link-button"
  type="button"
  hidden={history.status !== "error"}
  onclick={loadHistory}
>
  Try again
</button>
