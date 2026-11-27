import { describe, expect, it } from "vitest";
import { editionLabel, parseEdition, parseEditions } from "../editions.js";

describe("editionLabel", () => {
  it("uses the title", () => {
    expect(editionLabel({ id: "wexford-2026", title: "Wexford Weekend" })).toBe("Wexford Weekend");
  });

  it("makes the id readable when the title is missing or just the id", () => {
    expect(editionLabel({ id: "wexford-2026" })).toBe("Wexford 2026");
    expect(editionLabel({ id: "current", title: "current" })).toBe("Current");
  });
});

describe("parseEditions", () => {
  it("keeps entries with an id and drops the rest", () => {
    const data = { editions: [{ id: "current", title: "Current" }, { title: "No id" }, null, "x"] };
    expect(parseEditions(data)).toEqual([{ id: "current", title: "Current" }]);
  });

  it("reads anything else as no editions", () => {
    expect(parseEditions(null)).toEqual([]);
    expect(parseEditions({ editions: "nope" })).toEqual([]);
    expect(parseEditions([])).toEqual([]);
  });
});

describe("parseEdition", () => {
  it("needs a string id", () => {
    expect(parseEdition({ id: "current", title: "Current" })).toEqual({
      id: "current",
      title: "Current",
    });
    expect(parseEdition({ id: 7 })).toBeNull();
    expect(parseEdition("current")).toBeNull();
    expect(parseEdition(null)).toBeNull();
  });
});
