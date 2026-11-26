<!--
  "Up next": the curated running order, the tunes you'll actually play,
  promoted (in order) from the Requests pool below. Played songs collapse into
  a one-line group above the list, so it always starts at the next tune.

  It renders the night (night.svelte.ts) and hands every change back through
  `actions`; drag-to-reorder is run here, since it spans the whole list.

  The ids and classes are load-bearing: style.css and the e2e suite select on
  them. No scoped <style> here; the global stylesheet stays global.
-->
<script lang="ts">
  import { flushSync } from "svelte";
  import { on } from "svelte/events";
  import Icon from "./Icon.svelte";
  import RowCard, { type RowActions } from "./Row.svelte";
  import RowGroup from "./RowGroup.svelte";
  import { lists, rowVote } from "./lists.svelte.js";
  import { night } from "./night.svelte.js";
  import { settings } from "./settings.svelte.js";

  let {
    actions,
    onReorder,
    onCopy,
    onDownload,
  }: {
    actions: RowActions;
    /** A drag ended: the visible rows' uids, in their new order. */
    onReorder: (uids: string[]) => void;
    onCopy: () => Promise<void>;
    onDownload: () => void;
  } = $props();

  // Played and binned rows are lifted out (played into the group above,
  // binned into the bin at the foot), so the list shows what's left to play.
  const visible = $derived(night.upNext.filter((e) => !e.binned && !e.played));
  const played = $derived(night.upNext.filter((e) => e.played));
  // While a drag is in flight the list shows its order, not the stored one.
  let dragOrder: string[] | null = $state(null);
  let dragUid: string | null = $state(null);
  const shown = $derived.by(() => {
    if (!dragOrder) return visible;
    const byUid = new Map(visible.map((row) => [row.uid, row]));
    return dragOrder.map((uid) => byUid.get(uid)).filter((row) => row !== undefined);
  });
  // The set plays from the top, so the first card is the next tune. Marked
  // from the stored order: a drag in flight doesn't move the tag.
  const nextUid = $derived(visible[0]?.uid);

  let list: HTMLUListElement | undefined = $state();
  let copied = $state(false);
  let copyTimer: ReturnType<typeof setTimeout> | undefined;

  // The card under the finger's y, among the others: the drag lands before
  // the first card whose midpoint is below it.
  function dragAfterUid(y: number): string | null {
    if (!list) return null;
    let closest = { offset: Number.NEGATIVE_INFINITY, uid: null as string | null };
    for (const child of list.querySelectorAll<HTMLElement>(".row-card:not(.dragging)")) {
      const box = child.getBoundingClientRect();
      const offset = y - box.top - box.height / 2;
      if (offset < 0 && offset > closest.offset) {
        closest = { offset, uid: child.dataset.uid ?? null };
      }
    }
    return closest.uid;
  }

  // Pointer-events drag so touch works on the mobile browsers this app
  // targets (HTML5 drag-and-drop is desktop-only on touch). A press on a
  // row's handle starts it; the list reorders live as the row crosses its
  // neighbours' midpoints, and the final order goes out through onReorder on
  // release. An attachment, so leaving mid-drag drops the document listeners
  // and releases held snapshots.
  function reorder(ul: HTMLUListElement) {
    // Ends the drag in flight, if any, committing `order` when given.
    let finish: ((order?: string[]) => void) | null = null;

    const offDown = on(ul, "pointerdown", (event) => {
      const handle = (event.target as Element).closest<HTMLElement>(".drag-handle");
      const li = handle?.closest<HTMLLIElement>(".row-card");
      const uid = li?.dataset.uid;
      if (!handle || !li || !uid) return;
      // A drag whose release never arrived (it ended outside the window).
      finish?.();
      event.preventDefault();
      // Hold remote snapshots while dragging, so a peer's change can't yank
      // the row out from under the finger; sync applies it on release.
      actions.gesture(true);
      dragUid = uid;
      dragOrder = visible.map((row) => row.uid);
      // Where within the row the finger landed, kept pinned under the pointer
      // as it moves (no jump on the first move).
      const grabY = event.clientY - li.getBoundingClientRect().top;
      // Capture keeps touch from scrolling the page; move/up listen on the
      // document, so events keep flowing as the row moves in the list.
      try {
        handle.setPointerCapture(event.pointerId);
      } catch {
        /* capture unsupported: document listeners still work */
      }

      const onMove = (e: PointerEvent) => {
        if (!dragOrder) return;
        const after = dragAfterUid(e.clientY);
        const next = dragOrder.filter((id) => id !== uid);
        const at = after === null ? next.length : next.indexOf(after);
        next.splice(at, 0, uid);
        if (next.join() !== dragOrder.join()) {
          dragOrder = next;
          flushSync(); // move the card now, so it can be measured in place
        }
        // Lift the row to follow the finger 1:1: clear the transform to read
        // its true in-flow position, then translate it back under the grab
        // point. The gap it leaves marks where it will land.
        li.style.transform = "none";
        const top = li.getBoundingClientRect().top;
        li.style.transform = `translateY(${e.clientY - grabY - top}px)`;
      };
      const onUp = () => finish?.(dragOrder ?? []);

      const offs = [
        on(document, "pointermove", onMove),
        on(document, "pointerup", onUp),
        on(document, "pointercancel", onUp),
      ];
      finish = (order) => {
        for (const off of offs) off();
        finish = null;
        li.style.transform = "";
        dragOrder = null;
        dragUid = null;
        if (order) onReorder(order);
        // Order committed and pushed; now let any held snapshot apply.
        actions.gesture(false);
      };
    });

    return () => {
      offDown();
      finish?.();
    };
  }

  // A transient tick in place of the icon: the button is icon-only, so a
  // word would grow it mid-tap and shove the heading sideways.
  async function copy() {
    await onCopy();
    copied = true;
    clearTimeout(copyTimer);
    copyTimer = setTimeout(() => (copied = false), 1500);
  }
</script>

<!-- Nothing queued and nothing played: the room CSS shrinks the section to
     a one-line bar, so an empty box doesn't take the top of a page whose job
     is adding a tune. -->
<section
  id="upnext"
  class:empty={visible.length === 0 && !night.upNext.some((e) => e.played && !e.binned)}
>
  <div class="setlist-head">
    <h2>
      Up next <span id="upnext-count" class="count" hidden={visible.length === 0}>
        · {visible.length}
      </span>
    </h2>
    <!-- Export is what the night produces, so it's on the page rather than
         behind the gear. It covers BOTH lists, but sits beside the running
         order: that's the artifact people mean by "the setlist". Icon-only
         like the rest of the chrome; the accessible name carries the
         meaning. With nothing to export, both go inert. -->
    <div class="setlist-actions">
      <button
        id="copy"
        type="button"
        title="Copy list"
        aria-label="Copy the setlist to the clipboard"
        disabled={lists.exportEmpty}
        onclick={copy}
      >
        <Icon name={copied ? "check" : "copy"} />
      </button>
      <button
        id="download"
        type="button"
        title="Download JSON"
        aria-label="Download the setlist as JSON"
        disabled={lists.exportEmpty}
        onclick={onDownload}
      >
        <Icon name="download" />
      </button>
    </div>
  </div>
  <!-- What the list is, said once it has something in it. -->
  <p id="upnext-hint" class="list-hint" hidden={visible.length === 0}>Coming up, in order.</p>
  <!-- Played songs collapse into a one-line count here (the list consumes
       itself from the top); expanding shows the night's history, dated, and
       the un-play control. The room gets the same disclosure, read-only. -->
  <RowGroup
    id="played-group"
    iconName="played"
    noun="played"
    rows={played}
    context={lists.room ? "room-played" : "played"}
    {actions}
    showSuggestions={settings.showSuggestions}
  />
  <!-- Room mode watches the set and can want a tune, nothing else: no
       handle, no buttons, no swipe. -->
  <ul id="upnext-rows" bind:this={list} {@attach reorder}>
    {#each shown as row (row.uid)}
      <RowCard
        {row}
        context={lists.room ? "room-upnext" : "upnext"}
        {actions}
        vote={rowVote(row)}
        isNext={row.uid === nextUid}
        dragging={row.uid === dragUid}
        showSuggestions={settings.showSuggestions}
      />
    {/each}
  </ul>
  <!-- The full app's note points at promote, a control the room doesn't
       have. -->
  <p id="upnext-empty" class="note" hidden={visible.length > 0}>
    {lists.room ? "Nothing queued yet" : "Nothing queued yet. Promote a request from below."}
  </p>
</section>
