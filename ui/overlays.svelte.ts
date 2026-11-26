// Which sheet or popover is up. App.svelte mounts each one only while it's
// set here, so every opening starts fresh; the actions open and close them
// by setting them: a pick closes the songbook and opens the confirm sheet,
// starting a night closes its sheet, leaving a session closes the share
// panel.

import type { CatalogueEntry } from "./types.js";
import type { WhatsNewEntry } from "./whats-new.js";

class Overlays {
  /** The share panel: open at its top, or at the request link (the window
   * chip's shortcut); false while closed. */
  share = $state<false | "top" | "requests">(false);
  settings = $state(false);
  newSession = $state(false);
  songbook = $state(false);
  /** The confirm sheet, on a picked tune or (entry null) a rename; null while closed. */
  request = $state<{ entry: CatalogueEntry | null } | null>(null);
  nameReset = $state(false);
  /** The release notes on show, or null while closed. */
  whatsNew = $state.raw<WhatsNewEntry[] | null>(null);
  /** The scanned photo on show full-screen, or null. */
  photo = $state<string | null>(null);
}

export const overlays = new Overlays();
