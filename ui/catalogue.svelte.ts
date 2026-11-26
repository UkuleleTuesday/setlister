// The songbook the pickers search, and the editions on offer. main.ts loads
// it (cache first, network behind); the songbook sheet and the review sheet's
// pickers read it.

import type { CatalogueStatus } from "./songbook.js";
import type { CatalogueEntry, Edition } from "./types.js";

class Catalogue {
  /** Replaced whole on every load, never edited, so not deep state. */
  entries = $state.raw<CatalogueEntry[]>([]);
  generatedAt = $state("");
  /**
   * "loading" until a catalogue is available (cache or network), "error"
   * when the fetch failed with nothing to search: an empty list never
   * masquerades as "no matches".
   */
  status = $state<CatalogueStatus>("loading");
  /** The edition the pickers point at: the session's book, or the default. */
  editionId = $state("current");
  /** `/api/editions`; empty until (and unless) it answers. */
  editions = $state.raw<Edition[]>([]);
}

export const catalogue = new Catalogue();
