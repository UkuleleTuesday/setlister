<script lang="ts">
  import Icon from "./Icon.svelte";
  import { history, loadHistory } from "./history.svelte.js";
  import { notices } from "./notices.svelte.js";
  import { organiserStatus } from "./organiser-status.svelte.js";
  import {
    DEFAULT_BLURB,
    type LabelledEntry,
    type MonthGroup,
    type SessionEntry,
    dateTile,
    disambiguate,
    groupByMonth,
    partitionSessions,
    pastSessionTitle,
    sessionDateLabel,
    sessionTimeLabel,
  } from "./session-index.js";

  type Entry = LabelledEntry<SessionEntry>;

  let {
    onPick,
    onNewSession,
  }: {
    onPick: (id: string) => void;
    onNewSession: () => void;
  } = $props();

  // Label the WHOLE list before splitting, so two sessions the same night get
  // their disambiguating time suffixes even when one of them is the hero.
  const listing = $derived.by(() => {
    const now = new Date();
    const layout = partitionSessions(disambiguate(history.entries, now), now);
    return { now, layout, months: groupByMonth(layout.past, now) };
  });
  const now = $derived(listing.now);
  const layout = $derived(listing.layout);
  const months = $derived(listing.months);
  const next = $derived(layout.upcoming[0]);

  const statusText = $derived(
    history.status === "loading"
      ? "Loading sessions…"
      : history.status === "error"
        ? "Couldn’t load sessions."
        : "",
  );
  // Everyone sees the same words, so organisers see what the room reads.
  const pitch = $derived(next?.blurb || DEFAULT_BLURB);

  function meta(entry: Entry) {
    const who = entry.createdBy ? `Started by ${entry.createdBy}` : "Started by someone";
    // disambiguate() only suffixes a night shared by two sessions.
    const twin = entry.createdAt && entry.label !== sessionDateLabel(entry.createdAt, now);
    return twin ? `${sessionTimeLabel(entry.createdAt)} · ${who}` : who;
  }
</script>

<!-- A just-created doc awaiting its server timestamp has no date yet. -->
{#snippet tile(entry: Entry, large = false)}
  <span class={["date-tile", { "date-tile-lg": large }]}>
    {#if entry.createdAt}
      {@const parts = dateTile(entry.createdAt)}
      <span class="date-tile-weekday">{parts.weekday}</span><span class="date-tile-day">
        {parts.day}
      </span>
    {:else}
      <span class="date-tile-day">?</span>
    {/if}
  </span>
{/snippet}

{#snippet item(entry: Entry, title: string, extraClass = "")}
  <li>
    <button
      type="button"
      class={["session-item", extraClass]}
      data-id={entry.id}
      onclick={() => onPick(entry.id)}
    >
      {@render tile(entry)}
      <span class="session-item-text">
        <span class="session-item-name">{title}</span>
        <span class="session-item-meta">{meta(entry)}</span>
      </span>
      <Icon name="forward" extraClass="session-item-chevron" />
    </button>
  </li>
{/snippet}

{#snippet monthGroups(groups: MonthGroup<Entry>[])}
  {#each groups as group, i (i)}
    <section class="month-group">
      {#if group.label}<h3 class="month-label eyebrow">{group.label}</h3>{/if}
      <ul class="inset-list">
        {#each group.entries as entry (entry.id)}
          {@render item(
            entry,
            entry.createdAt ? pastSessionTitle(entry.createdAt, now) : "Date pending",
          )}
        {/each}
      </ul>
    </section>
  {/each}
{/snippet}

<div id="home-error" class="error" hidden={!notices.home.text}>{notices.home.text}</div>

<!-- The night is the hero: it's what most phones come to home for. -->
<div id="next-session" hidden={!next}>
  {#if next}
    <button
      type="button"
      class="next-session-card"
      data-id={next.id}
      onclick={() => onPick(next.id)}
    >
      {@render tile(next, true)}
      <span class="session-item-text">
        <span class="next-session-name">{next.label || "Date pending"}</span>
        <span class="next-session-meta">{meta(next)}</span>
      </span>
      <span class="next-session-pitch">{pitch}</span>
      <span class="next-session-open">
        Open the setlist<Icon name="forward" />
      </span>
    </button>
  {/if}
</div>
<div id="no-night" class="no-night callout" hidden={history.status !== "ready" || !!next}>
  <p class="no-night-title">No night planned yet</p>
  <p>
    {organiserStatus.isOrganiser
      ? "Start one and the room can send requests."
      : "When the organisers start the next one, it shows up here."}
  </p>
</div>

{#if organiserStatus.isOrganiser}
  <button
    id="new-session"
    class={["btn", next ? "btn-soft" : "btn-primary btn-lg"]}
    type="button"
    onclick={onNewSession}
  >
    <Icon name="add" /><span class="btn-label">New session</span>
  </button>
{/if}

<h2 id="upcoming-heading" hidden={layout.upcoming.length < 2}>Coming up</h2>
<ul id="upcoming-list" class="inset-list" hidden={layout.upcoming.length < 2}>
  {#each layout.upcoming.slice(1) as entry (entry.id)}
    {@render item(entry, entry.label || "Date pending", "upcoming")}
  {/each}
</ul>

<h2 id="past-heading" hidden={layout.past.length === 0}>Past sessions</h2>
<div id="session-list">
  {@render monthGroups(months)}
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
