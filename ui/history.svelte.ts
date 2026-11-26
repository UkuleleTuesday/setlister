// The club's session history, as last loaded: Home lays it out, and the
// new-session sheet reads the next planned night from it for its gate.

import { type SessionEntry, listSessions } from "./session-index.js";

class History {
  entries = $state.raw<SessionEntry[]>([]);
  status = $state<"loading" | "ready" | "error">("loading");
}

export const history = new History();

/**
 * Load the history. What's on screen stays put while loading. A failed query
 * clears the whole list: a stale "Next session" card over a "Couldn't load"
 * error would be a lie, and the new-session sheet's gate then fails closed
 * (its Start re-checks against Firestore).
 */
export async function loadHistory() {
  history.status = "loading";
  try {
    history.entries = await listSessions();
    history.status = "ready";
  } catch {
    history.entries = [];
    history.status = "error";
  }
}
