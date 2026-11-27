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
  /** Replaced whole, never edited: no need for deep state. */
  entries = $state.raw<CatalogueEntry[]>([]);
  generatedAt = $state("");
  /** Separate from `entries` so an empty list never masquerades as "no matches". */
  status = $state<CatalogueStatus>("loading");
  editionId = $state("current");
  editions = $state.raw<Edition[]>([]);
}

export const catalogue = new Catalogue();

// The edition of the entries in memory. night.edition names the session's book
// as soon as its doc arrives, before those entries load.
let loadedEditionId: string | null = null;

function restoreCached(editionId: string): boolean {
  const entry = getCachedCatalogue(readCatalogueStore(), editionId);
  if (!entry) return false;
  catalogue.entries = entry.catalogue;
  // Keep a same-id edition from the session doc: its title can be fresher.
  if (!night.edition || night.edition.id !== editionId) night.edition = entry.edition;
  catalogue.generatedAt = entry.generatedAt || "";
  loadedEditionId = editionId;
  catalogue.status = "ready";
  return true;
}

export function hydrateCatalogue(editionId: string) {
  catalogue.editionId = editionId;
  restoreCached(editionId);
}

// On a cache miss, say "Loading" rather than serve matches from the wrong book.
export function scopeCatalogueToEdition(editionId: string) {
  catalogue.editionId = editionId;
  if (editionId !== loadedEditionId) {
    if (!restoreCached(editionId)) {
      catalogue.entries = [];
      catalogue.status = "loading";
    }
    loadCatalogue(editionId);
  } else {
    // A tab open since before the weekly regen would put stale pages in the
    // shared list.
    refreshCatalogueIfStale();
  }
}

export async function loadEditions() {
  try {
    const res = await fetch(`${API_BASE}/api/editions`);
    const editions = parseEditions(await res.json());
    if (!editions.length) return;
    catalogue.editions = editions;
    // Only now can the select name the session's book.
    catalogue.editionId = night.edition?.id || "current";
  } catch {
    /* keep the hardcoded "current" options */
  }
}

// Requests are sequenced: hopping between sessions with different books can
// leave two fetches in flight, and the slower (stale) one must not win.
let loadSeq = 0;
// What a staleness re-check re-fetches. Not loadedEditionId: that lags a
// switch in flight, and re-fetching it would supersede the switch.
let loadEditionId: string | null = null;
let loadAttemptAt = 0;

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
    // The edition is session state: push now so a book switch reaches peers
    // without waiting for the next list edit. No-op when nothing changed.
    persist();
  } catch {
    if (seq === loadSeq) failed();
  }
}

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

// The weekly regen shifts every page after a rotated song, and a phone tab
// can live for days.
export function refreshCatalogueIfStale() {
  if (!loadEditionId) return;
  if (catalogueNeedsRefresh(loadAttemptAt, Date.now())) loadCatalogue(loadEditionId);
}
