<!-- A Close button rather than the "Tap outside" hint: the archive can run
     several screens, leaving little backdrop to tap. -->
<script lang="ts">
  import Sheet from "./Sheet.svelte";
  import { type WhatsNewEntry, whatsNewDateLabel } from "./whats-new.js";

  let {
    entries,
    onclose,
  }: {
    entries: WhatsNewEntry[];
    onclose: () => void;
  } = $props();

  const blocks = $derived(entries.map((entry) => ({ entry, label: whatsNewDateLabel(entry) })));
</script>

<Sheet id="whats-new-sheet" labelledby="whats-new-title" {onclose}>
  <h2 id="whats-new-title">What’s new</h2>
  <div id="whats-new-entries">
    <!-- Keyed by position: dates aren't guaranteed unique, and the list is only
         ever replaced whole. -->
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
