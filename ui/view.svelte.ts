// What this phone is showing: home or a session (the URL decides, see
// routing.ts), and which view of a session (#86).

import { organiserStatus } from "./organiser-status.svelte.js";
import type { ViewMode } from "./view-mode.js";

class View {
  page = $state<"home" | "session">("home");
  mode: ViewMode = $derived(organiserStatus.isOrganiser ? "full" : "room");
  /** A scan's review sheet is up: songs are coming. */
  reviewing = $state(false);
  /** The room's request view is showing (room mode only applies in a session). */
  room = $derived(this.mode === "room" && this.page === "session");
}

export const view = new View();
