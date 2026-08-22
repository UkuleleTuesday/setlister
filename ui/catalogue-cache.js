// Per-edition catalogue cache. Sessions each carry their own songbook now, so
// a device can bounce between a "current" Tuesday and a themed night without
// re-downloading (or worse, searching) the wrong book. The old cache was one
// slot — fine when the edition was a device setting, thrashing the moment two
// sessions disagree.
//
// These helpers are pure (store in, store out); app.js owns the localStorage
// I/O, same split as room-limits.js and request-window.js.

export const CATALOGUES_CACHE_KEY = "setlister.catalogues.v2";
export const LEGACY_CATALOGUE_CACHE_KEY = "setlister.catalogue.v1";

// Enough for the club's realistic rotation (current + a themed night or two)
// without hoarding: each entry is ~20KB and localStorage is a shared 5MB.
export const CATALOGUE_CACHE_LIMIT = 4;

// The cached {edition, catalogue, generatedAt} for an edition, or null.
// Anything malformed reads as a miss — the network load repopulates it.
export function getCachedCatalogue(store, editionId) {
  const entry = store?.[editionId];
  if (!entry || !Array.isArray(entry.catalogue) || !entry.catalogue.length) return null;
  return entry;
}

// A new store with this edition's entry replaced and the least recently saved
// entries evicted beyond the cap. Refreshing an edition re-stamps it, so the
// books actually in rotation stay cached.
export function putCachedCatalogue(store, editionId, entry, now) {
  const next = { ...store, [editionId]: { ...entry, savedAt: now } };
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
export function migrateLegacyCatalogue(store, legacy, now) {
  const id = legacy?.edition?.id;
  if (!id || !Array.isArray(legacy.catalogue) || !legacy.catalogue.length) return store;
  if (getCachedCatalogue(store, id)) return store;
  return putCachedCatalogue(
    store,
    id,
    { edition: legacy.edition, catalogue: legacy.catalogue, generatedAt: legacy.generatedAt || "" },
    now
  );
}
