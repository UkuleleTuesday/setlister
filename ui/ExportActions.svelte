<script lang="ts">
  import Icon from "./Icon.svelte";
  import { features } from "./features.js";
  import { lists } from "./lists.svelte.js";

  let { onCopy, onDownload }: { onCopy: () => Promise<void>; onDownload: () => void } = $props();

  let copied = $state(false);
  let copyTimer: ReturnType<typeof setTimeout> | undefined;

  // A tick, not a word: a word would grow the button and shove the heading.
  async function copy() {
    await onCopy();
    copied = true;
    clearTimeout(copyTimer);
    copyTimer = setTimeout(() => (copied = false), 1500);
  }
</script>

{#if features.exportButtons}
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
{/if}
