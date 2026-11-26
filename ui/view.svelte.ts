// What this phone is showing: home or a session, and which view of a session
// (the full app or the room's request view, #86). The URL decides both (see
// applyRoute in main.ts); this only holds the answer for the page to read.

import type { ViewMode } from "./view-mode.js";

class View {
  page = $state<"home" | "session">("home");
  /** Resolved from the URL and the sticky room flag on every route change. */
  mode = $state<ViewMode>("full");
  /** A scan's review sheet is up: songs are coming. */
  reviewing = $state(false);
  /** The room's request view is showing (room mode only applies in a session). */
  room = $derived(this.mode === "room" && this.page === "session");
}

export const view = new View();
