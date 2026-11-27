<script lang="ts">
  import type { RosterEntry } from "./presence.js";

  let { roster }: { roster: RosterEntry[] } = $props();
</script>

<div id="share-presence" class="share-presence" hidden={roster.length === 0}>
  <p class="share-presence-head">
    Here now · <span id="share-presence-count">{roster.length}</span>
  </p>
  <ul id="share-presence-list">
    {#each roster as peer (peer.clientId)}
      <li class="share-presence-item">
        <span class="presence-dot" aria-hidden="true"></span><span class="presence-name">
          {peer.isSelf ? `${peer.name} (you)` : peer.name}
        </span>
      </li>
    {/each}
  </ul>
</div>
