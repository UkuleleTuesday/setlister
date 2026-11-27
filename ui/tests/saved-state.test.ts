import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { STORAGE_KEY, readSavedState } from "../saved-state.js";
import { row } from "./fixtures.js";

function save(payload: unknown) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

beforeEach(() => {
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("readSavedState", () => {
  it("drops list entries that aren't rows", () => {
    save({ upNext: [row({ uid: "a" }), null, "Creep"], requests: [{ raw_title: "Jolene" }] });
    const saved = readSavedState();
    expect(saved.upNext?.map((r) => r.uid)).toEqual(["a"]);
    expect(saved.requests).toEqual([]);
  });

  it("drops an edition without a string id", () => {
    save({ edition: { id: 7 } });
    expect(readSavedState()).not.toHaveProperty("edition");
    save({ edition: { id: "current" } });
    expect(readSavedState().edition).toEqual({ id: "current" });
  });

  it("drops votes and a name of the wrong kind", () => {
    save({ votes: "lots", name: 7 });
    const saved = readSavedState();
    expect(saved).not.toHaveProperty("votes");
    expect(saved).not.toHaveProperty("name");
  });

  it("reads a corrupt payload as nothing", () => {
    localStorage.setItem(STORAGE_KEY, "{not json");
    expect(readSavedState()).toEqual({});
  });

  it("still reads the pre-split setlist as Up next", () => {
    save({ setlist: [row({ uid: "a" }), null] });
    expect(readSavedState().upNext?.map((r) => r.uid)).toEqual(["a"]);
  });
});
