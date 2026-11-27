<!-- UpNextSection.svelte runs drag-to-reorder, catching presses on the handle. -->
<script module lang="ts">
  import type { RowVote } from "./lists.svelte.js";
  import type { CatalogueEntry } from "./types.js";

  export type RowContext =
    "upnext" | "requests" | "played" | "bin" | "room" | "room-upnext" | "room-played";

  export interface RowActions {
    togglePlayed: (uid: string) => void;
    toggleBinned: (uid: string) => void;
    promote: (uid: string) => void;
    demote: (uid: string) => void;
    vote: (uid: string) => void;
    setMatch: (uid: string, entry: CatalogueEntry) => void;
    /** Keyboard reorder: one visible slot up (-1) or down (1). */
    moveBy: (uid: string, delta: -1 | 1) => void;
    /** Hold remote snapshots while a finger is on a row (sync.ts). */
    gesture: (active: boolean) => void;
  }
</script>

<script lang="ts">
  import { tick } from "svelte";
  import { on } from "svelte/events";
  import Icon from "./Icon.svelte";
  import { stateTime } from "./gig-state.js";
  import { sessionTimeLabel } from "./session-index.js";
  import { alternativesOf } from "./row-shape.js";
  import type { Row } from "./types.js";
  import { sourceLabel } from "./view-mode.js";

  let {
    row,
    context,
    actions,
    vote = null,
    isNext = false,
    dragging = false,
    showSuggestions,
  }: {
    row: Row;
    context: RowContext;
    actions: RowActions;
    vote?: RowVote | null;
    isNext?: boolean;
    dragging?: boolean;
    showSuggestions: boolean;
  } = $props();

  // A swipe has to travel this far before it's a swipe, not a tap.
  const ACTIVATE = 8;
  // ...and this share of the card's width to commit.
  const COMMIT = 0.35;

  const swipeable = $derived(context === "upnext" || context === "requests");

  let li: HTMLLIElement | undefined = $state();
  let handle: HTMLButtonElement | undefined = $state();
  let swipeDx: number | null = $state(null);
  let tracking = $state(false);

  const progress = $derived(
    swipeDx === null || !li ? null : Math.min(1, Math.abs(swipeDx) / (COMMIT * li.clientWidth)),
  );

  // The page badge leads this line: beside the title it would squeeze the tools.
  const metaText = $derived.by(() => {
    const parts: string[] = [];
    if (row.addedBy) parts.push(`Added by ${row.addedBy}`);
    if (row.source !== "manual") parts.push(sourceLabel(row.source));
    else if (!row.addedBy) parts.push("added manually");
    if (row.match) {
      if (row.raw_title && row.raw_title !== row.match.display) {
        parts.push(`wrote “${row.raw_title}”`);
      }
      if (row.raw_page && row.raw_page !== row.match.page) {
        parts.push(`board says p.${row.raw_page}`);
      }
    } else {
      // The working lists have no status stripe, so say it in words.
      parts.push("not in the songbook");
    }
    if (row.notes) parts.push(row.notes);
    if (row.crossed_out) parts.push("crossed out");
    // Rows marked before times were recorded show none.
    const playedAt =
      context === "played" || context === "room-played" ? stateTime(row.playedAt) : null;
    if (playedAt) parts.push(`played ${sessionTimeLabel(playedAt)}`);
    const binnedAt = context === "bin" ? stateTime(row.binnedAt) : null;
    if (binnedAt) parts.push(`binned ${sessionTimeLabel(binnedAt)}`);
    const text = parts.join(" · ");
    return text.charAt(0).toUpperCase() + text.slice(1);
  });
  const showMeta = $derived(metaText !== "" || Boolean(row.match));
  const alternatives = $derived(alternativesOf(row));

  // "+1 · 2" doesn't say what it counts, so the aria-label does.
  const voteLabel = $derived.by(() => {
    if (!vote) return "";
    const others = vote.mine ? vote.count - 1 : vote.count;
    if (vote.mine) {
      return others === 0
        ? "You want this one"
        : `You and ${others} ${others === 1 ? "other want" : "others want"} this one`;
    }
    return others === 0
      ? "I want this one, nobody has yet"
      : `I want this one too, ${others} ${others === 1 ? "person wants" : "people want"} it`;
  });

  // Refocus after the re-render, so a song can move several slots in a row.
  async function onHandleKeydown(event: KeyboardEvent) {
    let delta: -1 | 1;
    if (event.key === "ArrowUp") delta = -1;
    else if (event.key === "ArrowDown") delta = 1;
    else return;
    event.preventDefault();
    actions.moveBy(row.uid, delta);
    await tick();
    handle?.focus();
  }

  // An attachment, so a row unmounting mid-gesture still drops its listeners
  // and held snapshots.
  function swipe(card: HTMLLIElement) {
    // Ends the gesture in flight.
    let finish: (() => void) | null = null;

    const offDown = on(card, "pointerdown", (event) => {
      if (!swipeable) return;
      // A gesture whose release never arrived (it ended outside the window).
      finish?.();
      // Buttons and the drag handle own their own gestures.
      if ((event.target as Element).closest("button")) return;
      if (event.button != null && event.button !== 0) return;

      // Hold remote snapshots for the whole touch, taps included, so a peer's
      // change can't re-render the row mid-gesture.
      actions.gesture(true);
      const startX = event.clientX;
      const startY = event.clientY;
      let engaged = false;

      const settle = (dx: number) => {
        const commit = COMMIT * card.clientWidth;
        if (dx >= commit) {
          if (context === "requests") actions.promote(row.uid);
          else actions.togglePlayed(row.uid);
        } else if (dx <= -commit) {
          if (context === "upnext") actions.demote(row.uid);
          else actions.toggleBinned(row.uid);
        }
        // A committed row leaves this list; otherwise it animates back.
        swipeDx = null;
        tracking = false;
      };

      const onMove = (e: PointerEvent) => {
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        if (!engaged) {
          // Vertical: leave it to the page scroll.
          if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > ACTIVATE) return finish?.();
          if (Math.abs(dx) <= Math.abs(dy) || Math.abs(dx) <= ACTIVATE) return;
          engaged = true;
          tracking = true;
          try {
            card.setPointerCapture(e.pointerId);
          } catch {
            /* capture unsupported: document listeners still work */
          }
        }
        e.preventDefault();
        swipeDx = dx;
      };

      const offs = [
        on(document, "pointermove", onMove),
        // Settle before finish(), so the local change is committed and pushed
        // before any held remote snapshot applies: the two then converge.
        on(document, "pointerup", (e) => {
          if (engaged) settle(e.clientX - startX);
          finish?.();
        }),
        on(document, "pointercancel", () => {
          if (engaged) settle(0); // a cancelled gesture snaps back
          finish?.();
        }),
      ];
      finish = () => {
        for (const off of offs) off();
        finish = null;
        actions.gesture(false);
      };
    });

    return () => {
      offDown();
      finish?.();
    };
  }
</script>

<li
  bind:this={li}
  class={["row-card", row.status]}
  class:crossed={row.crossed_out}
  class:removed={row.removed}
  class:played={row.played}
  class:binned={row.binned}
  class:swipeable
  class:swiping={tracking}
  class:swipe-right={swipeDx !== null && swipeDx > 0}
  class:swipe-left={swipeDx !== null && swipeDx < 0}
  class:next-up={isNext}
  class:dragging
  data-uid={row.uid}
  style:--swipe-progress={progress === null ? undefined : progress.toFixed(3)}
  {@attach swipe}
>
  {#if swipeable}
    <div class="swipe-hint" aria-hidden="true">
      <span class="swipe-hint-left">
        <Icon name={context === "requests" ? "promote" : "played"} />
      </span><span class="swipe-hint-right">
        <Icon name={context === "upnext" ? "demote" : "bin"} />
      </span>
    </div>
  {/if}
  <div
    class="row-body compact"
    class:has-handle={context === "upnext"}
    style:transform={swipeDx === null ? undefined : `translateX(${swipeDx}px)`}
    style:transition={tracking ? "none" : undefined}
  >
    {#if context === "upnext"}
      <button
        bind:this={handle}
        class="drag-handle"
        type="button"
        title="Drag or press ↑/↓ to reorder"
        aria-label="Reorder: drag, or press the up and down arrow keys"
        onkeydown={onHandleKeydown}
      >
        <Icon name="drag" />
      </button>
    {/if}
    <div class="row-main">
      <!-- Real text, so assistive tech reads it too. -->
      {#if isNext}<span class="next-tag">Next</span>{/if}
      <div class="row-top">
        <span class="match-title">{row.match ? row.match.display : `“${row.raw_title}”`}</span>
      </div>
      {#if showMeta}
        <div class="row-meta">
          {#if row.match}<span class="page-badge">p.{row.match.page}</span>{/if}{metaText}
        </div>
      {/if}
      {#if showSuggestions && alternatives.length && !row.removed}
        <div class="chips">
          {#each alternatives as alt, i (i)}
            <button onclick={() => actions.setMatch(row.uid, alt.entry)}>
              {alt.entry.title} (p.{alt.entry.page})
            </button>
          {/each}
        </div>
      {/if}
    </div>
    <div class="row-tools">
      <!-- Up next is deliberately not re-sorted by votes: the set plays from
           the top. -->
      {#if vote}
        <button
          type="button"
          class="vote-button"
          class:voted={vote.mine}
          aria-pressed={vote.mine ? "true" : "false"}
          title={vote.mine ? "You want this one" : "I want this one"}
          aria-label={voteLabel}
          onclick={() => actions.vote(row.uid)}
        >
          <Icon name="want" /><span>
            {vote.mine ? "You" : "+1"}
          </span>{#if vote.mine ? vote.count > 1 : vote.count > 0}<span class="vote-count">
              · {vote.count}
            </span>{/if}
        </button>
      {/if}
      {#if context === "upnext"}
        <button
          title="Move to Requests"
          aria-label="Move to Requests"
          onclick={() => actions.demote(row.uid)}
        >
          <Icon name="demote" />
        </button>
      {:else if context === "requests"}
        <button
          title="Move to Up next"
          aria-label="Move to Up next"
          onclick={() => actions.promote(row.uid)}
        >
          <Icon name="promote" />
        </button>
      {:else if context === "bin"}
        <button
          type="button"
          title="Un-bin"
          aria-label="Un-bin"
          onclick={() => actions.toggleBinned(row.uid)}
        >
          <Icon name="restore" />
        </button>
      {:else if context === "played"}
        <button
          type="button"
          title="Mark not played"
          aria-label="Mark not played"
          onclick={() => actions.togglePlayed(row.uid)}
        >
          <Icon name="restore" />
        </button>
      {/if}
      {#if context === "upnext"}
        <button
          type="button"
          class={["check-button", { active: row.played }]}
          title={row.played ? "Mark not played" : "Mark played"}
          aria-label={row.played ? "Mark not played" : "Mark played"}
          aria-pressed={row.played ? "true" : "false"}
          onclick={() => actions.togglePlayed(row.uid)}
        >
          <Icon name="played" />
        </button>
      {:else if context === "requests"}
        <button
          type="button"
          class={["bin-button", { active: row.binned }]}
          title={row.binned ? "Un-bin" : "Bin"}
          aria-label={row.binned ? "Un-bin" : "Bin"}
          aria-pressed={row.binned ? "true" : "false"}
          onclick={() => actions.toggleBinned(row.uid)}
        >
          <Icon name="bin" />
        </button>
      {/if}
    </div>
  </div>
</li>
