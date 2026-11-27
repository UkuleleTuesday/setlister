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

  // The latest entry is the news; the rest are there for anyone who asks.
  let showEarlier = $state(false);
  const blocks = $derived(
    (showEarlier ? entries : entries.slice(0, 1)).map((entry) => ({
      entry,
      label: whatsNewDateLabel(entry),
    })),
  );
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
    {#if !showEarlier && entries.length > 1}
      <button
        id="whats-new-earlier"
        class="link-button whats-new-earlier"
        type="button"
        onclick={() => (showEarlier = true)}
      >
        Earlier updates
      </button>
    {/if}
  </div>
  <div class="actions">
    <button id="whats-new-close" class="btn btn-soft" type="button" onclick={onclose}>Close</button>
  </div>
</Sheet>
