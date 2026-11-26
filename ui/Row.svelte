<!--
  One song on the night's lists: Up next, Requests, the played and bin
  groups, and their read-only room-view versions. The card carries its
  provenance line, the "I want this one" button, and the controls its list
  allows; on Up next and Requests it also swipes.

  Every change goes up through `actions` (main.ts owns the lists); this only
  draws the row and runs its gestures. Drag-to-reorder is the list's job
  (UpNextSection.svelte): the handle only starts it.

  The ids and classes are load-bearing: style.css and the e2e suite select on
  them. No scoped <style> here; the global stylesheet stays global.
-->
<script module lang="ts">
  import type { RowVote } from "./lists.svelte.js";
  import type { CatalogueEntry } from "./types.js";

  export type RowContext =
    "upnext" | "requests" | "played" | "bin" | "room" | "room-upnext" | "room-played";

  /** What a row can ask main.ts to do, by row uid. */
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
  import Icon from "./Icon.svelte";
  import { stateTime } from "./gig-state.js";
  import { sessionTimeLabel } from "./session-index.js";
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
    onDragStart,
  }: {
    row: Row;
    context: RowContext;
    actions: RowActions;
    /** The want button, or null where this list has none. */
    vote?: RowVote | null;
    /** The first card of Up next: the tune to shout. */
    isNext?: boolean;
    dragging?: boolean;
    showSuggestions: boolean;
    /** Up next only: a pointer went down on the drag handle. */
    onDragStart?: (event: PointerEvent, li: HTMLLIElement) => void;
  } = $props();

  // A swipe has to travel this far before it's a swipe, not a tap.
  const ACTIVATE = 8;
  // ...and this share of the card's width to commit.
  const COMMIT = 0.35;

  // Swipe is the fast one-thumb path on a phone. In Requests, right promotes
  // to Up next and left bins; in Up next, left demotes back to Requests and
  // right marks played. The hint layer sits behind the body and shows as the
  // body slides, so its icons follow suit. Only these two lists swipe: the
  // class also gates the clipping styles.
  const swipeable = $derived(context === "upnext" || context === "requests");

  let li: HTMLLIElement | undefined = $state();
  let handle: HTMLButtonElement | undefined = $state();
  let swipeDx: number | null = $state(null);
  let tracking = $state(false);

  const progress = $derived(
    swipeDx === null || !li ? null : Math.min(1, Math.abs(swipeDx) / (COMMIT * li.clientWidth)),
  );

  // The working lists get one quiet line: provenance, plus only the facts
  // that still need saying. Repeating the matched title and page as
  // `wrote: …` under every row said nothing on the happy path; the board text
  // earns its place only when it differs from the match. The page leads the
  // line: beside the title it took the width the thumbs pill and the row
  // tools need.
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
      // No stripe colour out here (see style.css): say it in words instead.
      parts.push("not in the songbook");
    }
    if (row.notes) parts.push(row.notes);
    if (row.crossed_out) parts.push("crossed out");
    // When it was ticked off or binned, in the viewer's own clock. Only in
    // the two groups: on the working lists the row isn't in that state. Rows
    // marked before times were recorded simply show none.
    const playedAt =
      context === "played" || context === "room-played" ? stateTime(row.playedAt) : null;
    if (playedAt) parts.push(`played ${sessionTimeLabel(playedAt)}`);
    const binnedAt = context === "bin" ? stateTime(row.binnedAt) : null;
    if (binnedAt) parts.push(`binned ${sessionTimeLabel(binnedAt)}`);
    const text = parts.join(" · ");
    return text.charAt(0).toUpperCase() + text.slice(1);
  });
  const showMeta = $derived(metaText !== "" || Boolean(row.match));

  // The want button says whose vote it is: "You" (filled) once this device
  // wants the tune, which includes every request it added, and "+1"
  // (outlined) while it doesn't, so it reads as a button to press rather than
  // a tally someone else ran up. The count follows only when it adds
  // something. The aria-label says it in words, since "+1 · 2" doesn't say
  // what it counts.
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

  // Keyboard sibling of drag: with the handle focused, the arrow keys nudge
  // the row one slot. Focus comes back to this row's handle after the
  // re-render, so a keyboard user can move a song several slots in a row.
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

  function onHandlePointerdown(event: PointerEvent) {
    if (li) onDragStart?.(event, li);
  }

  // Horizontal-swipe sibling of drag (pointer events, so touch works). The
  // body tracks the finger; committing past the threshold fires the list's
  // action. Vertical intent goes back to the page (touch-action: pan-y), so
  // the list still scrolls.
  function onPointerdown(event: PointerEvent) {
    if (!swipeable || !li) return;
    // Buttons and the drag handle own their own gestures.
    if ((event.target as Element).closest("button")) return;
    if (event.button != null && event.button !== 0) return; // right/middle click

    // Hold remote snapshots for the whole touch (a committed swipe, or even a
    // plain tap) so a peer's change can't re-render the row mid-gesture;
    // sync applies any held snapshot on release.
    actions.gesture(true);
    const card = li;
    const startX = event.clientX;
    const startY = event.clientY;
    let engaged = false;
    let decided = false; // a vertical scroll: we bow out

    const finish = () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      document.removeEventListener("pointercancel", onCancel);
      // Any local action has already been applied and pushed by settle().
      actions.gesture(false);
    };

    const reset = () => {
      swipeDx = null;
      tracking = false;
    };

    const settle = (dx: number) => {
      const commit = COMMIT * card.clientWidth;
      if (dx >= commit) {
        if (context === "requests") actions.promote(row.uid);
        else actions.togglePlayed(row.uid);
      } else if (dx <= -commit) {
        if (context === "upnext") actions.demote(row.uid);
        else actions.toggleBinned(row.uid);
      }
      // A committed action takes the row off this list; otherwise it
      // animates back to rest.
      reset();
    };

    const onMove = (e: PointerEvent) => {
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (!engaged) {
        if (decided) return;
        if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > ACTIVATE) {
          decided = true;
          finish();
          return;
        }
        if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > ACTIVATE) {
          engaged = true;
          tracking = true; // follow the finger 1:1 while dragging
          try {
            card.setPointerCapture(e.pointerId);
          } catch {
            /* capture unsupported: document listeners still work */
          }
        } else {
          return;
        }
      }
      e.preventDefault();
      swipeDx = dx;
    };

    const onUp = (e: PointerEvent) => {
      // Settle before finish(), so the local change is committed and pushed
      // before any held remote snapshot applies: the two then converge.
      if (engaged) settle(e.clientX - startX);
      finish();
    };
    const onCancel = () => {
      if (engaged) settle(0); // a cancelled gesture snaps back
      finish();
    };

    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
    document.addEventListener("pointercancel", onCancel);
  }
</script>

<li
  bind:this={li}
  class={`row-card ${row.status}`}
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
  onpointerdown={onPointerdown}
>
  {#if swipeable}
    <!-- The left half shows on a swipe right, the right half on a swipe left. -->
    <div class="swipe-hint" aria-hidden="true">
      <span class="swipe-hint-left">
        <Icon name={context === "requests" ? "promote" : "played"} />
      </span><span class="swipe-hint-right">
        <Icon name={context === "upnext" ? "demote" : "bin"} />
      </span>
    </div>
  {/if}
  <!-- The text lives in its own column so the action buttons sit beside it,
       vertically centred: a whole row of card given over to two icons was
       most of what made each card tall. -->
  <div
    class="row-body compact"
    class:has-handle={context === "upnext"}
    style:transform={swipeDx === null ? undefined : `translateX(${swipeDx}px)`}
    style:transition={tracking ? "none" : undefined}
  >
    {#if context === "upnext"}
      <!-- A full-height grab strip down the card's left edge, not a button in
           the tools row: a big thumb target for reordering. Drag is the
           primary gesture; the arrow keys are its keyboard equivalent. -->
      <button
        bind:this={handle}
        class="drag-handle"
        type="button"
        title="Drag or press ↑/↓ to reorder"
        aria-label="Reorder: drag, or press the up and down arrow keys"
        onpointerdown={onHandlePointerdown}
        onkeydown={onHandleKeydown}
      >
        <Icon name="drag" />
      </button>
    {/if}
    <div class="row-main">
      <!-- The set plays from the top, so the first card IS the next tune:
           marked, as real text so assistive tech reads it too. -->
      {#if isNext}<span class="next-tag">Next</span>{/if}
      <div class="row-top">
        <span class="match-title">{row.match ? row.match.display : `“${row.raw_title}”`}</span>
      </div>
      {#if showMeta}
        <div class="row-meta">
          {#if row.match}<span class="page-badge">p.{row.match.page}</span>{/if}{metaText}
        </div>
      {/if}
      {#if showSuggestions && row.alternatives?.length && !row.removed}
        <div class="chips">
          {#each row.alternatives as alt, i (i)}
            <button onclick={() => actions.setMatch(row.uid, alt.entry)}>
              {alt.entry.title} (p.{alt.entry.page})
            </button>
          {/each}
        </div>
      {/if}
    </div>
    <div class="row-tools">
      <!-- "I want this one" (#83), first in the row so the buttons after it
           stay where the thumb expects. Up next is deliberately NOT re-sorted
           by it like the pool is: the set plays from the top. -->
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
        <!-- Back to the Requests pool, without deleting it. -->
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
        <!-- The way back out of the bin: the row reappears in its home list,
             at its original spot. -->
        <button
          type="button"
          title="Un-bin"
          aria-label="Un-bin"
          onclick={() => actions.toggleBinned(row.uid)}
        >
          <Icon name="restore" />
        </button>
      {:else if context === "played"}
        <!-- The rescue for a stray swipe-right: back into the running order. -->
        <button
          type="button"
          title="Mark not played"
          aria-label="Mark not played"
          onclick={() => actions.togglePlayed(row.uid)}
        >
          <Icon name="restore" />
        </button>
      {/if}
      <!-- Each working list shows only the action matching its swipe, so the
           buttons and the gestures stay in lockstep: Up next ticks a tune off,
           Requests bins one. -->
      {#if context === "upnext"}
        <button
          type="button"
          class={row.played ? "check-button active" : "check-button"}
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
          class={row.binned ? "bin-button active" : "bin-button"}
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
