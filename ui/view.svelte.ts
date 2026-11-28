import { organiserStatus } from "./organiser-status.svelte.js";

class View {
  page = $state<"home" | "session">("home");
  /** A scan's review sheet is up. */
  reviewing = $state(false);
  /** An organiser opened a past night's full tools. Never sticks across sessions. */
  editingPast = $state(false);
  room = $derived(!organiserStatus.isOrganiser && this.page === "session");
}

export const view = new View();
