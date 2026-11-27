// App.svelte mounts each overlay only while it's set here.

import type { CatalogueEntry } from "./types.js";
import type { WhatsNewEntry } from "./whats-new.js";

class Overlays {
  /** "requests" opens the share panel scrolled to the request link. */
  share = $state<false | "top" | "requests">(false);
  settings = $state(false);
  newSession = $state(false);
  songbook = $state(false);
  /** The confirm sheet; entry null means a rename. */
  request = $state<{ entry: CatalogueEntry | null } | null>(null);
  whatsNew = $state.raw<WhatsNewEntry[] | null>(null);
  photo = $state<string | null>(null);
}

export const overlays = new Overlays();
