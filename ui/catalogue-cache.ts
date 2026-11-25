// Per-edition catalogue cache. Sessions each carry their own songbook now, so
// a device can bounce between a "current" Tuesday and a themed night without
// re-downloading (or worse, searching) the wrong book. The old cache was one
// slot — fine when the edition was a device setting, thrashing the moment two
// sessions disagree.
//
// These helpers are pure (store in, store out); app.js owns the localStorage
// I/O, same split as room-limits.ts and request-window.ts.

import type { CatalogueEntry, Edition } from "./types.js";

/** One edition's cached songbook. */
export interface CachedCatalogue {
  edition: Edition;
  catalogue: CatalogueEntry[];
  generatedAt: string;
  /** When this entry was saved (ms); the eviction order. */
  savedAt?: number;
}

/** The localStorage map, keyed by edition id. */
export type CatalogueStore = Record<string, CachedCatalogue>;

export const CATALOGUES_CACHE_KEY = "setlister.catalogues.v2";
export const LEGACY_CATALOGUE_CACHE_KEY = "setlister.catalogue.v1";

// Enough for the club's realistic rotation (current + a themed night or two)
// without hoarding: each entry is ~20KB and localStorage is a shared 5MB.
export const CATALOGUE_CACHE_LIMIT = 4;

// The cached {edition, catalogue, generatedAt} for an edition, or null.
// Anything malformed reads as a miss — the network load repopulates it. The
// store is whatever localStorage held, hence `unknown`.
export function getCachedCatalogue(store: unknown, editionId: string): CachedCatalogue | null {
  const entry = (store as Record<string, Partial<CachedCatalogue> | null> | null)?.[editionId];
  if (!entry || !Array.isArray(entry.catalogue) || !entry.catalogue.length) return null;
  return entry as CachedCatalogue;
}

// A new store with this edition's entry replaced and the least recently saved
// entries evicted beyond the cap. Refreshing an edition re-stamps it, so the
// books actually in rotation stay cached.
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

// Fold the pre-split single-slot cache (setlister.catalogue.v1) into the map,
// once, so the first launch after the update still searches instantly. An
// edition already in the map wins — it can only be fresher.
export function migrateLegacyCatalogue(
  store: CatalogueStore,
  legacyData: unknown,
  now: number,
): CatalogueStore {
  const legacy = legacyData as Partial<CachedCatalogue> | null | undefined;
  const id = legacy?.edition?.id;
  if (!id || !Array.isArray(legacy.catalogue) || !legacy.catalogue.length) return store;
  if (getCachedCatalogue(store, id)) return store;
  return putCachedCatalogue(
    store,
    id,
    {
      edition: legacy.edition!,
      catalogue: legacy.catalogue,
      generatedAt: legacy.generatedAt || "",
    },
    now,
  );
}

// How long a fetched catalogue is trusted before it's re-checked. A phone keeps
// the app's tab alive for days, and the book is regenerated weekly with songs
// rotated in and out, so every page after a change shifts. Without a re-check
// a tab opened before the regen keeps adding tonight's songs with last week's
// pages. Matches the API's own 15-minute catalogue cache.
export const CATALOGUE_MAX_AGE_MS = 15 * 60 * 1000;

// Whether the catalogue should be re-fetched: never tried, or last tried long
// enough ago that the published book may have moved on.
export function catalogueNeedsRefresh(
  lastAttemptAt: number | null | undefined,
  now: number,
): boolean {
  return !lastAttemptAt || now - lastAttemptAt >= CATALOGUE_MAX_AGE_MS;
}
