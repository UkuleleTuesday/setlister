// The songbook the pickers search, the editions on offer, and how they load:
// cache first for instant search, the network behind it. The songbook sheet
// and the review sheet's pickers read it.

import { API_BASE, type CatalogueResponse } from "./api.js";
import {
  catalogueNeedsRefresh,
  getCachedCatalogue,
  readCatalogueStore,
  saveCachedCatalogue,
} from "./catalogue-cache.js";
import { parseEditions } from "./editions.js";
import { night } from "./night.svelte.js";
import { persist } from "./save.js";
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

// Which edition the LOADED entries belong to. Distinct from night.edition,
// which names the session's book the instant its doc arrives, while the
// entries in memory are whatever this device last searched. This is how a
// re-scope notices the gap.
let loadedEditionId: string | null = null;

// Hydrate from the cached copy of ONE edition. Returns whether it hit, so
// callers know if search is live or still waiting on the network.
function restoreCached(editionId: string): boolean {
  const entry = getCachedCatalogue(readCatalogueStore(), editionId);
  if (!entry) return false;
  catalogue.entries = entry.catalogue;
  // Adopt the cached edition info when switching books (or starting blank),
  // but don't clobber a same-id edition that arrived with the session doc:
  // its title can be fresher than the cache's.
  if (!night.edition || night.edition.id !== editionId) night.edition = entry.edition;
  catalogue.generatedAt = entry.generatedAt || "";
  loadedEditionId = editionId;
  catalogue.status = "ready";
  return true;
}

/** Search from the cache at once, before any network work (boot). */
export function hydrateCatalogue(editionId: string) {
  catalogue.editionId = editionId;
  restoreCached(editionId);
}

// Point the pickers at ONE edition: cache first for instant search, network
// refresh behind it. On a cache miss the picker says "Loading the
// songbook…": better honest than quietly serving matches from the WRONG book
// while the fetch runs.
export function scopeCatalogueToEdition(editionId: string) {
  catalogue.editionId = editionId;
  if (editionId !== loadedEditionId) {
    if (!restoreCached(editionId)) {
      catalogue.entries = [];
      catalogue.status = "loading";
    }
    loadCatalogue(editionId);
  } else {
    // Same book, but this tab may have been open since before the weekly
    // regen: joining or starting tonight's session is exactly when stale
    // pages would start landing in the shared list.
    refreshCatalogueIfStale();
  }
}

export async function loadEditions() {
  try {
    const res = await fetch(`${API_BASE}/api/editions`);
    const editions = parseEditions(await res.json());
    if (!editions.length) return;
    catalogue.editions = editions;
    // Point the select at the session's book, which the listing can name.
    catalogue.editionId = night.edition?.id || "current";
  } catch {
    /* keep the hardcoded "current" options */
  }
}

// Requests are sequenced: hopping between sessions with different books can
// leave two fetches in flight, and the slower (stale) one must not win.
let loadSeq = 0;
// The edition the latest fetch asked for, and when: what a staleness re-check
// re-fetches. Not loadedEditionId: it lags a switch in flight, and
// re-fetching it would supersede the switch.
let loadEditionId: string | null = null;
let loadAttemptAt = 0;

// Load an edition independently of any photo, so adding by name works before
// (or without) a scan. Never touches the lists.
export async function loadCatalogue(edition: string) {
  const seq = ++loadSeq;
  loadEditionId = edition;
  loadAttemptAt = Date.now();
  const failed = () => {
    loadAttemptAt = 0; // retry on the next foreground, not in 15 min
    if (!catalogue.entries.length) catalogue.status = "error";
  };
  try {
    const res = await fetch(`${API_BASE}/api/catalogue?edition=${encodeURIComponent(edition)}`);
    if (seq !== loadSeq) return;
    if (!res.ok) return failed();
    const data: CatalogueResponse = await res.json();
    if (seq !== loadSeq) return;
    adoptCatalogue(data);
    loadedEditionId = data.edition?.id || edition;
    // The edition is session state: pushing here is what makes a mid-session
    // book switch reach every peer at once, instead of riding along on the
    // next unrelated list edit. A no-op write when nothing changed.
    persist();
  } catch {
    // Leave any previously loaded catalogue in place.
    if (seq === loadSeq) failed();
  }
}

/** A catalogue fresh from the API (the catalogue endpoint, or a scan). */
export function adoptCatalogue(data: CatalogueResponse) {
  night.edition = data.edition;
  catalogue.entries = data.catalogue;
  catalogue.generatedAt = data.catalogue_generated_at || "";
  catalogue.status = "ready";
  if (data.edition?.id) {
    saveCachedCatalogue(data.edition.id, {
      edition: data.edition,
      catalogue: data.catalogue,
      generatedAt: catalogue.generatedAt,
    });
  }
}

// Re-fetch the book in play if the last try is old. The weekly regen shifts
// every page after a rotated song, and a phone tab can live for days.
export function refreshCatalogueIfStale() {
  if (!loadEditionId) return;
  if (catalogueNeedsRefresh(loadAttemptAt, Date.now())) loadCatalogue(loadEditionId);
}
