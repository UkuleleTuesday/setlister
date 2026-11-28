<script lang="ts">
  import { flushSync } from "svelte";
  import { on } from "svelte/events";
  import ExportActions from "./ExportActions.svelte";
  import RowCard, { type RowActions } from "./Row.svelte";
  import RowGroup from "./RowGroup.svelte";
  import { lists, rowVote } from "./lists.svelte.js";
  import { night } from "./night.svelte.js";
  import { playedOrder } from "./recap.js";
  import { session } from "./session.svelte.js";

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

  const visible = $derived(night.upNext.filter((e) => !e.binned && !e.played));
  const played = $derived(playedOrder(night.upNext));
  let dragOrder: string[] | null = $state(null);
  let dragUid: string | null = $state(null);
  const shown = $derived.by(() => {
    if (!dragOrder) return visible;
    const byUid = new Map(visible.map((row) => [row.uid, row]));
    return dragOrder.map((uid) => byUid.get(uid)).filter((row) => row !== undefined);
  });
  // From the stored order, so a drag in flight doesn't move the Next tag. A
  // past night has nothing next.
  const nextUid = $derived(session.past ? undefined : visible[0]?.uid);

  let list: HTMLUListElement | undefined = $state();

  function dropBeforeUid(y: number): string | null {
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

  // Pointer events, since HTML5 drag-and-drop doesn't work on touch. An
  // attachment, so leaving mid-drag drops the listeners and held snapshots.
  function reorder(ul: HTMLUListElement) {
    // Ends the drag in flight, committing `order` when given.
    let finish: ((order?: string[]) => void) | null = null;

    const offDown = on(ul, "pointerdown", (event) => {
      const handle = (event.target as Element).closest<HTMLElement>(".drag-handle");
      const li = handle?.closest<HTMLLIElement>(".row-card");
      const uid = li?.dataset.uid;
      if (!handle || !li || !uid) return;
      // A drag whose release never arrived (it ended outside the window).
      finish?.();
      event.preventDefault();
      // Hold remote snapshots so a peer's change can't yank the row from under
      // the finger.
      actions.gesture(true);
      dragUid = uid;
      dragOrder = visible.map((row) => row.uid);
      const grabY = event.clientY - li.getBoundingClientRect().top;
      // Capture keeps touch from scrolling the page.
      try {
        handle.setPointerCapture(event.pointerId);
      } catch {
        /* capture unsupported: document listeners still work */
      }

      const onMove = (e: PointerEvent) => {
        if (!dragOrder) return;
        const before = dropBeforeUid(e.clientY);
        const next = dragOrder.filter((id) => id !== uid);
        const at = before === null ? next.length : next.indexOf(before);
        next.splice(at, 0, uid);
        if (next.join() !== dragOrder.join()) {
          dragOrder = next;
          flushSync(); // move the card now, so it can be measured in place
        }
        // Clear the transform to read the in-flow position, then translate
        // back under the grab point.
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
</script>

<section
  id="upnext"
  class:empty={visible.length === 0 && !night.upNext.some((e) => e.played && !e.binned)}
>
  <div class="setlist-head">
    <h2 class="eyebrow">
      Up next <span id="upnext-count" class="count" hidden={visible.length === 0}>
        · {visible.length}
      </span>
    </h2>
    <ExportActions {onCopy} {onDownload} />
  </div>
  <!-- Organisers know the drill; the room gets a line on what this is. -->
  <p id="upnext-hint" class="list-hint" hidden={visible.length === 0 || !lists.room}>
    Coming up, in order.
  </p>
  <ul id="upnext-rows" bind:this={list} {@attach reorder}>
    {#each shown as row (row.uid)}
      <RowCard
        {row}
        context={lists.room ? "room-upnext" : "upnext"}
        {actions}
        vote={rowVote(row)}
        isNext={row.uid === nextUid}
        dragging={row.uid === dragUid}
      />
    {/each}
  </ul>
  <!-- After the queue: what's done shouldn't push what's coming down. -->
  <RowGroup
    id="played-group"
    iconName="played"
    noun="played"
    rows={played}
    context={lists.room ? "room-played" : session.past ? "played-edit" : "played"}
    {actions}
    startOpen={session.past}
    numbered={session.past}
  />
  <p id="upnext-empty" class="note" hidden={visible.length > 0}>
    {lists.room ? "Nothing queued yet" : "Nothing queued yet. Promote a request from below."}
  </p>
</section>
