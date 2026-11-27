import { organiserStatus } from "./organiser-status.svelte.js";
import type { ViewMode } from "./view-mode.js";

class View {
  page = $state<"home" | "session">("home");
  mode: ViewMode = $derived(organiserStatus.isOrganiser ? "full" : "room");
  /** A scan's review sheet is up. */
  reviewing = $state(false);
  room = $derived(this.mode === "room" && this.page === "session");
}

export const view = new View();
