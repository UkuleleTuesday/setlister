import { describe, expect, it } from "vitest";
import { alternativesOf, isRow } from "../row-shape.js";
import type { Row } from "../types.js";
import { row, song } from "./fixtures.js";

describe("isRow", () => {
  it("wants an object with a string uid", () => {
    expect(isRow(row({ uid: "a" }))).toBe(true);
    expect(isRow({ uid: 7 })).toBe(false);
    expect(isRow([{ uid: "a" }])).toBe(false);
    expect(isRow("a")).toBe(false);
    expect(isRow(null)).toBe(false);
  });
});

describe("alternativesOf", () => {
  const withAlternatives = (alternatives: unknown) =>
    row({ alternatives: alternatives as Row["alternatives"] });

  it("keeps the runner-ups that have an entry to show", () => {
    const good = { entry: song({ title: "Creep", page: 3 }), title_score: 0.8 };
    const bad = [null, "Creep", { title_score: 0.5 }, { entry: "Creep" }];
    expect(alternativesOf(withAlternatives([good, ...bad]))).toEqual([good]);
  });

  it("reads anything but an array as none", () => {
    expect(alternativesOf(withAlternatives("Creep"))).toEqual([]);
    expect(alternativesOf(withAlternatives(undefined))).toEqual([]);
  });
});
