<!--
  What's new: release notes from whats-new.json, in the same centred sheet
  idiom as starting a night. Two ways in, two amounts of news: the home banner
  opens it on the latest entry alone (an announcement), the footer link on the
  full history (an archive). App.svelte owns both doors and the "seen"
  bookkeeping; this component only shows the entries it's given.

  This is the one sheet you read rather than fill in, and the only one that
  can run several screens long, so it carries a real Close button instead of
  the "tap outside" hint: the way out has to be a proper tap target under the
  thumb, not a strip of backdrop the archive is busy squeezing. Backdrop and
  Escape still close it; they're just not the only way.

  The ids and classes are load-bearing: style.css and the e2e suite select on
  them. No scoped <style> here; the global stylesheet stays global.
-->
<script lang="ts">
  import { untrack } from "svelte";
  import { type WhatsNewEntry, whatsNewDateLabel } from "./whats-new.js";

  let {
    entries = $bindable(null),
  }: {
    /** The entries on show, newest first as given; null closes the sheet. */
    entries?: WhatsNewEntry[] | null;
  } = $props();

  let list: HTMLDivElement | undefined = $state();

  // Labels are computed when the entries change, in the viewer's locale; the
  // stored date stays ISO (see whats-new.ts).
  const blocks = $derived(
    (entries ?? []).map((entry) => ({ entry, label: whatsNewDateLabel(entry) })),
  );

  // Long archives open at the top, not wherever the last visit left the
  // scroll. After the render, so the new list is the one being reset.
  $effect(() => {
    if (!entries) return;
    untrack(() => {
      if (list) list.scrollTop = 0;
    });
  });

  function close() {
    entries = null;
  }

  // Forgiving dismissal: a tap on the backdrop itself closes, a tap inside
  // the card doesn't.
  function onBackdrop(event: MouseEvent) {
    if (event.target === event.currentTarget) close();
  }

  function onKeydown(event: KeyboardEvent) {
    if (event.key === "Escape" && entries) close();
  }
</script>

<svelte:document onkeydown={onKeydown} />

<!-- The backdrop's click is the tap-outside shortcut, not the accessible way
     out: Close is a real button, and Escape is handled on the document. -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<div
  id="whats-new-sheet"
  class="sheet-backdrop"
  hidden={!entries}
  role="dialog"
  aria-modal="true"
  aria-labelledby="whats-new-title"
  tabindex="-1"
  onclick={onBackdrop}
>
  <div class="sheet">
    <h2 id="whats-new-title">What’s new</h2>
    <div id="whats-new-entries" bind:this={list}>
      <!-- One dated block per entry: the same markup for one entry or all of
           them, so the archive reads as a sequence, not a different screen.
           Keyed by position: dates aren't guaranteed unique, and the lists
           are only ever replaced whole. -->
      {#each blocks as { entry, label }, i (i)}
        <section class="whats-new-entry">
          <p class="whats-new-date">{label}</p>
          <ul class="whats-new-items">
            {#each entry.items as item, j (j)}
              <li>{item}</li>
            {/each}
          </ul>
        </section>
      {/each}
    </div>
    <div class="actions">
      <button id="whats-new-close" class="secondary" type="button" onclick={close}>Close</button>
    </div>
  </div>
</div>
