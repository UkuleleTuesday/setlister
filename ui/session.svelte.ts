// The shared session as this phone last heard it from sync.ts: its id,
// metadata (visibility, the request link's mode and window), when it started,
// and who's here. main.ts calls readSync() whenever sync reports a change;
// everything else only reads.
//
// Kept apart from the night's lists on purpose: session metadata travels by
// sync's own metadata writes, never the debounced row push (see sync.ts).

// The Dates here are values, replaced whole and never mutated, so the
// reactive SvelteDate the rule asks for would be the wrong tool.
/* eslint-disable svelte/prefer-svelte-reactivity */

import type { RosterEntry } from "./presence.js";
import { type LinkState, linkState } from "./request-window.js";
import { sessionDateLabel } from "./session-index.js";
import * as sync from "./sync.js";
import type { SessionMeta } from "./types.js";

class Session {
  id = $state<string | null>(null);
  meta = $state.raw<SessionMeta>(sync.getMeta());
  createdAt = $state.raw<Date | null>(null);
  roster = $state.raw<RosterEntry[]>([]);
  /**
   * The clock the request window is read against, ticked each minute while
   * a session is open: the window can open or close with no snapshot at all.
   */
  now = $state.raw(new Date());
  /**
   * What the night is called: its date, rendered live. Falls back to the id
   * only for a session with no createdAt yet, which beats an empty title.
   */
  label = $derived(sessionDateLabel(this.createdAt, this.now) || this.id || "");
  /** The request link as of `now`. */
  link: LinkState = $derived(linkState(this.meta, this.createdAt, this.now));
}

export const session = new Session();

/** Re-read sync's view of the session (a connect, a leave, a snapshot). */
export function readSync() {
  session.id = sync.getSessionId();
  session.meta = sync.getMeta();
  session.createdAt = sync.getCreatedAt();
  session.now = new Date();
}

/** The request link right now, for a tap deciding whether it can land. */
export function linkNow(): LinkState {
  return linkState(session.meta, session.createdAt, new Date());
}
