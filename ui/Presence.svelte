<!--
  "Here now": the live roster of people connected to this session, inside the
  share panel. Fed by presence.ts's onRoster through SharePanel; "you" is
  marked, and unnamed peers show their generated default name.

  The ids and classes are load-bearing: style.css and the e2e suite select on
  them. No scoped <style> here; the global stylesheet stays global.
-->
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
