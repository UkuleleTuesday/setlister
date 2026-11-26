import { describe, expect, it } from "vitest";
import { parseEdition, parseEditions } from "../editions.js";

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
