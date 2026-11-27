// Kept apart from `night`: session metadata travels by sync's own metadata
// writes, never the debounced row push.

// These Dates are replaced whole, never mutated, so SvelteDate isn't needed.
/* eslint-disable svelte/prefer-svelte-reactivity */

import type { RosterEntry } from "./presence.js";
import { type LinkState, linkState } from "./request-window.js";
import { isPastNight, sessionDateLabel } from "./session-index.js";
import * as sync from "./sync.js";
import type { SessionMeta } from "./types.js";

class Session {
  id = $state<string | null>(null);
  meta = $state.raw<SessionMeta>(sync.getMeta());
  createdAt = $state.raw<Date | null>(null);
  roster = $state.raw<RosterEntry[]>([]);
  /** Ticked each minute: the request window can open or close with no snapshot. */
  now = $state.raw(new Date());
  label = $derived(sessionDateLabel(this.createdAt, this.now) || this.id || "");
  link: LinkState = $derived(linkState(this.meta, this.createdAt, this.now));
  /** The night is over: the session opens as a recap. */
  past = $derived(isPastNight(this.createdAt, this.now));
}

export const session = new Session();

/** Call after a connect, a leave or a snapshot. */
export function readSync() {
  session.id = sync.getSessionId();
  session.meta = sync.getMeta();
  session.createdAt = sync.getCreatedAt();
  session.now = new Date();
}

/** Reads a fresh clock, not the minute tick: for a tap deciding whether it can land. */
export function linkNow(): LinkState {
  return linkState(session.meta, session.createdAt, new Date());
}
