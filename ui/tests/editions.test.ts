import { describe, expect, it } from "vitest";
import { parseEditions } from "../editions.js";

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
