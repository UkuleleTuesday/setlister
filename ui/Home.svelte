<script lang="ts">
  import Icon from "./Icon.svelte";
  import { features } from "./features.js";
  import { history, loadHistory } from "./history.svelte.js";
  import { notices } from "./notices.svelte.js";
  import { organiserStatus } from "./organiser-status.svelte.js";
  import { homeStatusText, linkState } from "./request-window.js";
  import {
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
    startOfNight,
  } from "./session-index.js";
  import { followTonight, tonightCard } from "./tonight-card.svelte.js";
  import { tonightCounts } from "./tonight.js";

  type Entry = LabelledEntry<SessionEntry>;

  let {
    onPick,
    onNewSession,
  }: {
    onPick: (id: string, options?: { songbook?: boolean }) => void;
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

  // disambiguate() only suffixes a night shared by two sessions: then the time tells them apart.
  function meta(entry: Entry): string {
    const twin = entry.createdAt && entry.label !== sessionDateLabel(entry.createdAt, now);
    return twin ? sessionTimeLabel(entry.createdAt) : "";
  }

  $effect(() => {
    const id = next?.id;
    if (id) return followTonight(id);
  });

  // Only once the doc has loaded: a guessed "closed" would flash before "open".
  const card = $derived.by(() => {
    const doc = next && tonightCard.id === next.id ? tonightCard.meta : null;
    const link = doc && next ? linkState(doc, next.createdAt, tonightCard.now) : null;
    const summary = doc ? tonightCard.summary : null;
    // The night's counts ride the status line: under a tune they'd read as its stats.
    return {
      link,
      status: link
        ? [homeStatusText(link.status, tonightCard.now), ...(summary ? tonightCounts(summary) : [])]
        : [],
    };
  });
  // Outside the parts' nowrap spans, so the status breaks here and nowhere else.
  const SEP = " · ";

  // Organisers add from inside the night: for them the card only opens it.
  const canRequest = $derived(!organiserStatus.isOrganiser && Boolean(card.link?.open));
  const isTonight = $derived(
    Boolean(next?.createdAt) &&
      startOfNight(next!.createdAt!).getTime() === startOfNight(now).getTime(),
  );
  const openLabel = $derived(isTonight ? "See tonight’s setlist" : "See the setlist");
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
        {#if meta(entry)}<span class="session-item-meta">{meta(entry)}</span>{/if}
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

<p class="home-intro">Ask for tunes and follow the night’s setlist.</p>

<!-- The night is the hero: it's what most phones come to home for. -->
<div id="next-session" hidden={!next}>
  {#if next}
    <section class="next-session-card" data-id={next.id} aria-labelledby="next-session-name">
      <div class="next-session-head">
        {@render tile(next, true)}
        <div class="session-item-text">
          <h2 id="next-session-name" class="next-session-name">{next.label || "Date pending"}</h2>
          {#if card.status.length}
            <!-- Breaks only between parts, so "at 7:30 PM" never splits. -->
            <p id="next-session-status" class="next-session-status" class:open={card.link?.open}>
              {#each card.status as part, i (i)}{#if i}{SEP}{/if}<span>{part}</span>{/each}
            </p>
          {/if}
        </div>
      </div>
      {#if next.blurb}
        <div class="next-session-block">
          <p class="eyebrow">From the organisers</p>
          <p class="next-session-note">{next.blurb}</p>
        </div>
      {/if}
      {#if canRequest}
        <div class="next-session-actions">
          <button
            id="next-session-add"
            class="btn btn-lg btn-on-accent"
            type="button"
            onclick={() => onPick(next.id, { songbook: true })}
          >
            <Icon name="add" /><span class="btn-label">Request a tune</span>
          </button>
        </div>
      {/if}
      <!-- Its ::after covers the card, so a tap anywhere opens the night. -->
      <button
        id="next-session-open"
        class="next-session-open"
        type="button"
        onclick={() => onPick(next.id)}
      >
        {openLabel}<Icon name="forward" />
      </button>
    </section>
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

<!-- Start is blocked while a shared night is planned, so don't offer it. -->
{#if organiserStatus.isOrganiser && (!next || features.unlistedSessions)}
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
