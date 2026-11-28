import type { CatalogueEntry, Edition } from "./types.js";

export interface CachedCatalogue {
  edition: Edition;
  catalogue: CatalogueEntry[];
  generatedAt: string;
  /** Epoch ms; the eviction order. */
  savedAt?: number;
}

export type CatalogueStore = Record<string, CachedCatalogue>;

const CATALOGUES_CACHE_KEY = "setlister.catalogues.v2";

// Current plus a themed night or two: each entry is ~20KB of a shared 5MB.
export const CATALOGUE_CACHE_LIMIT = 4;

export function getCachedCatalogue(store: unknown, editionId: string): CachedCatalogue | null {
  const entry = (store as Record<string, Partial<CachedCatalogue> | null> | null)?.[editionId];
  if (!entry || !Array.isArray(entry.catalogue) || !entry.catalogue.length) return null;
  return entry as CachedCatalogue;
}

export function putCachedCatalogue(
  store: CatalogueStore,
  editionId: string,
  entry: CachedCatalogue,
  now: number,
): CatalogueStore {
  const next: CatalogueStore = { ...store, [editionId]: { ...entry, savedAt: now } };
  const ids = Object.keys(next);
  if (ids.length > CATALOGUE_CACHE_LIMIT) {
    ids.sort((a, b) => (next[a].savedAt || 0) - (next[b].savedAt || 0));
    for (const id of ids.slice(0, ids.length - CATALOGUE_CACHE_LIMIT)) delete next[id];
  }
  return next;
}

// A tab lives for days and the weekly regen shifts pages: without a re-check,
// tonight's adds get last week's pages. Matches the API's own catalogue cache.
export const CATALOGUE_MAX_AGE_MS = 15 * 60 * 1000;

export function catalogueNeedsRefresh(
  lastAttemptAt: number | null | undefined,
  now: number,
): boolean {
  return !lastAttemptAt || now - lastAttemptAt >= CATALOGUE_MAX_AGE_MS;
}

export function readCatalogueStore(): CatalogueStore {
  try {
    return JSON.parse(localStorage.getItem(CATALOGUES_CACHE_KEY) || "null") || {};
  } catch {
    return {}; /* corrupt cache: the network load will repopulate it */
  }
}

export function saveCachedCatalogue(editionId: string, entry: CachedCatalogue): void {
  try {
    const store = putCachedCatalogue(readCatalogueStore(), editionId, entry, Date.now());
    localStorage.setItem(CATALOGUES_CACHE_KEY, JSON.stringify(store));
  } catch {
    /* storage full or blocked: the cache is best-effort */
  }
}
