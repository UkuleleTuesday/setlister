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
  it("keeps only the edition and name: the night comes from its doc", () => {
    save({
      upNext: [row({ uid: "a" })],
      requests: [],
      votes: {},
      edition: { id: "current" },
      name: "Sam",
    });
    expect(readSavedState()).toEqual({ edition: { id: "current" }, name: "Sam" });
  });

  it("drops an edition without a string id", () => {
    save({ edition: { id: 7 } });
    expect(readSavedState()).not.toHaveProperty("edition");
    save({ edition: { id: "current" } });
    expect(readSavedState().edition).toEqual({ id: "current" });
  });

  it("drops a name of the wrong kind", () => {
    save({ name: 7 });
    expect(readSavedState()).not.toHaveProperty("name");
  });

  it("reads a corrupt payload as nothing", () => {
    localStorage.setItem(STORAGE_KEY, "{not json");
    expect(readSavedState()).toEqual({});
  });
});
