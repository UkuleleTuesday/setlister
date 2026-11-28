import { describe, expect, it } from "vitest";

import {
  type CachedCatalogue,
  type CatalogueStore,
  CATALOGUE_CACHE_LIMIT,
  CATALOGUE_MAX_AGE_MS,
  catalogueNeedsRefresh,
  getCachedCatalogue,
  putCachedCatalogue,
} from "../catalogue-cache.js";
import { song } from "./fixtures.js";

const NOW = 1_770_000_000_000;

function entry(id: string, n = 1): CachedCatalogue {
  return {
    edition: { id, title: id, description: "" },
    catalogue: Array.from({ length: n }, (_, i) => song({ title: `Song ${i}` })),
    generatedAt: "2026-08-01T00:00:00Z",
  };
}

describe("getCachedCatalogue", () => {
  it("returns the entry for a cached edition", () => {
    const store = putCachedCatalogue({}, "current", entry("current"), NOW);
    expect(getCachedCatalogue(store, "current")!.edition.id).toBe("current");
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
    let store: CatalogueStore = {};
    for (let i = 0; i < CATALOGUE_CACHE_LIMIT + 1; i++) {
      store = putCachedCatalogue(store, `book-${i}`, entry(`book-${i}`), NOW + i);
    }
    expect(Object.keys(store)).toHaveLength(CATALOGUE_CACHE_LIMIT);
    expect(store["book-0"]).toBeUndefined();
    expect(store[`book-${CATALOGUE_CACHE_LIMIT}`]).toBeDefined();
  });

  it("keeps an edition alive by refreshing it, evicting a staler one instead", () => {
    let store: CatalogueStore = {};
    for (let i = 0; i < CATALOGUE_CACHE_LIMIT; i++) {
      store = putCachedCatalogue(store, `book-${i}`, entry(`book-${i}`), NOW + i);
    }
    store = putCachedCatalogue(store, "book-0", entry("book-0"), NOW + 100);
    store = putCachedCatalogue(store, "book-new", entry("book-new"), NOW + 101);
    expect(store["book-0"]).toBeDefined();
    expect(store["book-1"]).toBeUndefined();
  });
});

describe("catalogueNeedsRefresh", () => {
  it("refreshes when never tried", () => {
    expect(catalogueNeedsRefresh(0, NOW)).toBe(true);
  });
  it("trusts a recent fetch", () => {
    expect(catalogueNeedsRefresh(NOW - CATALOGUE_MAX_AGE_MS + 1, NOW)).toBe(false);
  });
  it("re-checks once the fetch is old enough", () => {
    expect(catalogueNeedsRefresh(NOW - CATALOGUE_MAX_AGE_MS, NOW)).toBe(true);
    expect(catalogueNeedsRefresh(NOW - 7 * 24 * 60 * 60 * 1000, NOW)).toBe(true);
  });
});
