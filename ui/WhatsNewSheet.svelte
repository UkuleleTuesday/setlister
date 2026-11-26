<!--
  What's new: release notes from whats-new.json. App.svelte owns both doors
  (the home banner opens the latest entry alone, the footer link the full
  history) and the "seen" bookkeeping; this only shows the entries it's
  given.

  A sheet you read rather than fill in, and one that can run several screens
  long, so it carries a real Close button instead of the "tap outside" hint:
  the way out has to be a proper tap target under the thumb, not a strip of
  backdrop the archive is busy squeezing. Backdrop and Escape close it too
  (Sheet.svelte). Each opening mounts it afresh, so long archives open at the
  top.

  The ids and classes are load-bearing: style.css and the e2e suite select on
  them. No scoped <style> here; the global stylesheet stays global.
-->
<script lang="ts">
  import Sheet from "./Sheet.svelte";
  import { type WhatsNewEntry, whatsNewDateLabel } from "./whats-new.js";

  let {
    entries,
    onclose,
  }: {
    /** The entries on show, newest first as given. */
    entries: WhatsNewEntry[];
    onclose: () => void;
  } = $props();

  // Labels in the viewer's locale; the stored date is ISO (see whats-new.ts).
  const blocks = $derived(entries.map((entry) => ({ entry, label: whatsNewDateLabel(entry) })));
</script>

<Sheet id="whats-new-sheet" labelledby="whats-new-title" {onclose}>
  <h2 id="whats-new-title">What’s new</h2>
  <div id="whats-new-entries">
    <!-- One dated block per entry: the same markup for one entry or all of
         them, so the archive reads as a sequence, not a different screen.
         Keyed by position: dates aren't guaranteed unique, and the lists are
         only ever replaced whole. -->
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
    <button id="whats-new-close" class="secondary" type="button" onclick={onclose}>Close</button>
  </div>
</Sheet>
