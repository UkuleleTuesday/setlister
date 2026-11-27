// Edited in place. Sync and storage only ever get plain copies (nightSnapshot).

import type { Edition, ListState, Row, Votes } from "./types.js";

export const night = $state({
  // Adds land in `requests`; the organiser promotes rows into `upNext`.
  upNext: [] as Row[],
  requests: [] as Row[],
  votes: {} as Votes,
  edition: null as Edition | null,
  // The typed name or "". To show a person use presence.displayName(), which
  // falls back to this device's anonymous name.
  name: "",
});

/** The synced part of the night, as plain objects. */
export function nightSnapshot(): ListState {
  const { upNext, requests, edition, votes } = night;
  return $state.snapshot({ upNext, requests, edition, votes });
}
