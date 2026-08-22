// The per-edition catalogue cache: the decisions under test — a malformed or
// empty entry reads as a miss (never a crash), the cap evicts the least
// recently SAVED edition (not an arbitrary one), and the one-time legacy fold
// never overwrites a fresher entry for the same edition.
import { describe, expect, it } from "vitest";

import {
  CATALOGUE_CACHE_LIMIT,
  getCachedCatalogue,
  migrateLegacyCatalogue,
  putCachedCatalogue,
} from "../catalogue-cache.js";

const NOW = 1_770_000_000_000; // pinned: relative order is what matters

function entry(id, n = 1) {
  return {
    edition: { id, title: id, description: "" },
    catalogue: Array.from({ length: n }, (_, i) => ({ title: `Song ${i}` })),
    generatedAt: "2026-08-01T00:00:00Z",
  };
}

describe("getCachedCatalogue", () => {
  it("returns the entry for a cached edition", () => {
    const store = putCachedCatalogue({}, "current", entry("current"), NOW);
    expect(getCachedCatalogue(store, "current").edition.id).toBe("current");
  });

  it("misses on an unknown edition, an empty store, or no store at all", () => {
    expect(getCachedCatalogue({}, "current")).toBeNull();
    expect(getCachedCatalogue(null, "current")).toBeNull();
    expect(getCachedCatalogue(undefined, "current")).toBeNull();
  });

  it("treats a malformed or empty entry as a miss", () => {
    expect(getCachedCatalogue({ current: { catalogue: [] } }, "current")).toBeNull();
    expect(getCachedCatalogue({ current: { catalogue: "nope" } }, "current")).toBeNull();
    expect(getCachedCatalogue({ current: null }, "current")).toBeNull();
  });
});

describe("putCachedCatalogue", () => {
  it("does not mutate the store it was given", () => {
    const store = {};
    putCachedCatalogue(store, "current", entry("current"), NOW);
    expect(store).toEqual({});
  });

  it("replaces an existing edition and re-stamps it", () => {
    let store = putCachedCatalogue({}, "current", entry("current", 1), NOW);
    store = putCachedCatalogue(store, "current", entry("current", 2), NOW + 1);
    expect(Object.keys(store)).toEqual(["current"]);
    expect(store.current.catalogue).toHaveLength(2);
    expect(store.current.savedAt).toBe(NOW + 1);
  });

  it("evicts the least recently saved edition beyond the cap", () => {
    let store = {};
    for (let i = 0; i < CATALOGUE_CACHE_LIMIT + 1; i++) {
      store = putCachedCatalogue(store, `book-${i}`, entry(`book-${i}`), NOW + i);
    }
    expect(Object.keys(store)).toHaveLength(CATALOGUE_CACHE_LIMIT);
    expect(store["book-0"]).toBeUndefined();
    expect(store[`book-${CATALOGUE_CACHE_LIMIT}`]).toBeDefined();
  });

  it("keeps an edition alive by refreshing it, evicting a staler one instead", () => {
    let store = {};
    for (let i = 0; i < CATALOGUE_CACHE_LIMIT; i++) {
      store = putCachedCatalogue(store, `book-${i}`, entry(`book-${i}`), NOW + i);
    }
    // book-0 is oldest; refresh it, then overflow — book-1 should go instead.
    store = putCachedCatalogue(store, "book-0", entry("book-0"), NOW + 100);
    store = putCachedCatalogue(store, "book-new", entry("book-new"), NOW + 101);
    expect(store["book-0"]).toBeDefined();
    expect(store["book-1"]).toBeUndefined();
  });
});

describe("migrateLegacyCatalogue", () => {
  it("folds a valid single-slot cache into the map", () => {
    const store = migrateLegacyCatalogue({}, entry("wexford-2026"), NOW);
    expect(getCachedCatalogue(store, "wexford-2026")).not.toBeNull();
  });

  it("never overwrites an edition already in the map", () => {
    const fresh = putCachedCatalogue({}, "current", entry("current", 5), NOW);
    const store = migrateLegacyCatalogue(fresh, entry("current", 1), NOW + 1);
    expect(store.current.catalogue).toHaveLength(5);
  });

  it("ignores a legacy slot with no edition id or no songs", () => {
    expect(migrateLegacyCatalogue({}, null, NOW)).toEqual({});
    expect(migrateLegacyCatalogue({}, { catalogue: [{}] }, NOW)).toEqual({});
    expect(
      migrateLegacyCatalogue({}, { edition: { id: "current" }, catalogue: [] }, NOW)
    ).toEqual({});
  });
});
