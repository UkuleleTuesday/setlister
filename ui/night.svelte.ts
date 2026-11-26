// The night: both lists, the votes on them, the session's songbook, and this
// player's name. Deeply reactive: the actions edit it in place (a row played, a
// splice, a push) and everything that shows it follows. Sync and storage only
// ever get plain copies (nightSnapshot), never the live state.

import type { Edition, ListState, Row, Votes } from "./types.js";

export const night = $state({
  // Adds (by name or snap) land in `requests`, the incoming pool; the
  // organiser promotes rows into `upNext`, the running order.
  upNext: [] as Row[],
  requests: [] as Row[],
  // Upvotes (#83), keyed by row rather than stored on it: see votes.ts.
  votes: {} as Votes,
  edition: null as Edition | null,
  // The name the player typed, or "": the raw setting, not the identity.
  // Surfaces that show a person resolve it through presence.displayName(),
  // which falls back to this device's anonymous name.
  name: "",
});

/** The synced part of the night, as plain objects. */
export function nightSnapshot(): ListState {
  const { upNext, requests, edition, votes } = night;
  return $state.snapshot({ upNext, requests, edition, votes });
}
