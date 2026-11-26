<!--
  The home view's session history: "New session", the next night as a big
  card, any further prepped nights, and the club's history below. Mounted
  inside <section id="home"> between the What's new banner and footer, which
  App.svelte keeps (they're the release notes' doors, not the history).

  Driven by session-index.ts: listing, labelling, disambiguation and the
  upcoming/past split all stay pure there. main.ts reaches in through refresh()
  and showError(), and hears back through the props.

  The ids and classes are load-bearing: style.css and the e2e suite select on
  them. No scoped <style> here; the global stylesheet stays global.
-->
<script lang="ts">
  import Icon from "./Icon.svelte";
  import {
    type SessionEntry,
    disambiguate,
    listSessions,
    partitionSessions,
  } from "./session-index.js";

  let {
    onPick,
    onNewSession,
    onPlanned,
  }: {
    /** A session card was tapped. */
    onPick: (id: string) => void;
    /** "New session" was tapped. */
    onNewSession: () => void;
    /** The soonest upcoming night after each load, or null: the sheet's gate. */
    onPlanned: (entry: SessionEntry | null) => void;
  } = $props();

  // How many past nights show before the rest collapse. Enough to cover "the
  // last month or so" at one Tuesday a week without the history burying the
  // page.
  const PAST_VISIBLE = 5;

  let entries: SessionEntry[] = $state([]);
  let status: "loading" | "ready" | "error" = $state("loading");
  let error = $state("");
  // Survives refresh() so a background refresh doesn't slam the history shut
  // under someone's thumb.
  let pastOlderOpen = $state(false);

  // Label the WHOLE list before splitting, so two sessions the same night get
  // their disambiguating time suffixes even when one of them is the hero.
  const layout = $derived.by(() => {
    const now = new Date();
    return partitionSessions(disambiguate(entries, now), now);
  });
  const next = $derived(layout.upcoming[0]);
  // Never hide a single item behind a tap: at the threshold, one more row
  // costs less than a one-row disclosure.
  const collapse = $derived(layout.past.length > PAST_VISIBLE + 1);
  const pastVisible = $derived(collapse ? layout.past.slice(0, PAST_VISIBLE) : layout.past);
  const pastOlder = $derived(collapse ? layout.past.slice(PAST_VISIBLE) : []);

  const statusText = $derived(
    status === "loading"
      ? "Loading sessions…"
      : status === "error"
        ? "Couldn’t load sessions."
        : entries.length
          ? ""
          : "No sessions yet. Start one above.",
  );

  // Remembered by the new-session sheet for its gate. A failed load lands
  // here as an empty list, clearing it to null: the sheet then shows no
  // notice and its Start-time check fails closed instead of trusting stale
  // state.
  $effect(() => {
    onPlanned(next ?? null);
  });

  /**
   * Load the history. The list and "New session" are independent paths: a
   * failed query must never stop someone starting tonight's set. What's on
   * screen stays put while loading.
   */
  export async function refresh() {
    status = "loading";
    try {
      entries = await listSessions();
      status = "ready";
    } catch {
      // A failed query clears the whole layout, hero included: a stale "Next
      // session" card over a "Couldn't load" error would be a lie.
      entries = [];
      status = "error";
    }
  }

  /** Why the last route bounced back here (a bad link, a deleted session). */
  export function showError(message: string) {
    error = message;
  }

  export function clearError() {
    error = "";
  }

  function startedBy(entry: SessionEntry) {
    return entry.createdBy ? `Started by ${entry.createdBy}` : "Started by someone";
  }
</script>

<!-- `label` is the session's date in this viewer's locale (see
     disambiguate()/sessionDateLabel()). A just-created doc can still be
     waiting on its server timestamp, which labels as "": name the state
     rather than render a blank card. -->
{#snippet item(entry: SessionEntry & { label: string }, extraClass = "")}
  <li>
    <button
      type="button"
      class={extraClass ? `session-item ${extraClass}` : "session-item"}
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

<!-- While a night is coming up, starting ANOTHER session is a secondary act,
     so the button steps back to a quiet style; otherwise it's the hero. -->
<button
  id="new-session"
  class="primary-action"
  class:secondary-new={Boolean(next)}
  type="button"
  onclick={onNewSession}
>
  <Icon name="add" /><span class="btn-label">New session</span>
</button>
<div id="home-error" class="error" hidden={!error}>{error}</div>

<!-- The joinable nights, above the history. The next one leads as a big card
     (on a club night the screen's one job is getting you into tonight's
     session), any further prepped nights queue beneath it. Heading and card
     hidden when nothing is upcoming: then "New session" above is the hero
     instead. -->
<h2 id="upcoming-heading" hidden={layout.upcoming.length === 0}>Coming up</h2>
<div id="next-session" hidden={!next}>
  {#if next}
    <!-- No CTA line: the home screen opens the FULL view, where people run the
         whole night, so any verbs here would miscast someone. The card is a
         button in a list of buttons; the night's name is the message. -->
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

<!-- The club's history: a different job (looking back, not joining), so it
     sits below under its own quiet heading. Only the most recent few show;
     the rest collapse behind #past-older so a year of Tuesdays doesn't bury
     the page. -->
<h2 id="past-heading" hidden={layout.past.length === 0}>Past sessions</h2>
<ul id="session-list" class="session-list">
  {#each pastVisible as entry (entry.id)}
    {@render item(entry)}
  {/each}
</ul>
<!-- Same collapsed-disclosure idea as the session view's played/bin groups,
     over session items rather than song rows. -->
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
  hidden={status !== "error"}
  onclick={refresh}
>
  Try again
</button>
