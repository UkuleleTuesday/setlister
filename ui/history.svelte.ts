// The club's session history, as last loaded: Home lays it out, and the
// new-session sheet reads the next planned night from it for its gate.

import { type SessionEntry, listSessions } from "./session-index.js";

class History {
  entries = $state.raw<SessionEntry[]>([]);
  status = $state<"loading" | "ready" | "error">("loading");
}

export const history = new History();

/**
 * Load the history, leaving what's on screen in place meanwhile. A failed
 * query clears the list: a stale "Next session" card over a "Couldn't load"
 * error would be a lie. The new-session sheet's gate then opens, but its
 * Start re-checks against Firestore and fails closed.
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
