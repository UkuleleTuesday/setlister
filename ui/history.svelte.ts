import { type SessionEntry, listSessions } from "./session-index.js";

class History {
  entries = $state.raw<SessionEntry[]>([]);
  status = $state<"loading" | "ready" | "error">("loading");
}

export const history = new History();

/**
 * A failure clears the list: a stale "Next session" card over a load error
 * would lie. The new-session gate then opens, but Start re-checks and fails closed.
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
