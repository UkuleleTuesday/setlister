<script lang="ts">
  import { night } from "./night.svelte.js";
  import type { RosterEntry } from "./presence.js";

  let {
    roster,
    onAddName,
  }: {
    roster: RosterEntry[];
    /** Offered on your own row while you're anonymous. */
    onAddName: (event: MouseEvent) => void;
  } = $props();

  const named = $derived(Boolean(night.name.trim()));
</script>

<div id="share-presence" class="share-presence" hidden={roster.length === 0}>
  <p class="share-presence-head eyebrow">
    Here now · <span id="share-presence-count">{roster.length}</span>
  </p>
  <ul id="share-presence-list">
    {#each roster as peer (peer.clientId)}
      <li class="share-presence-item">
        <span class="presence-dot" aria-hidden="true"></span><span class="presence-name">
          {peer.isSelf ? `${peer.name} (you)` : peer.name}
        </span>
        {#if peer.isSelf && !named}
          <button
            type="button"
            id="share-add-name"
            class="share-add-name link-button"
            onclick={onAddName}
          >
            Add your name
          </button>
        {/if}
      </li>
    {/each}
  </ul>
</div>
