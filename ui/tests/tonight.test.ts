import { describe, expect, it } from "vitest";
import { tonightCounts, tonightSummary } from "../tonight.js";
import type { Row } from "../types.js";

const row = (uid: string, extra: Partial<Row> = {}): Row =>
  ({ uid, raw_title: uid, match: null, played: false, binned: false, ...extra }) as Row;

describe("tonightSummary", () => {
  it("counts requests left in the pool and tunes played", () => {
    const summary = tonightSummary({
      upNext: [row("a", { played: true }), row("b", { played: true }), row("c")],
      requests: [row("d"), row("e", { binned: true }), row("f")],
    });
    expect(summary).toEqual({ requests: 2, played: 2 });
  });
});

describe("tonightCounts", () => {
  it("gives each count its own part", () => {
    expect(tonightCounts({ requests: 3, played: 1 })).toEqual(["3 requests", "1 played"]);
  });

  it("says one request in the singular", () => {
    expect(tonightCounts({ requests: 1, played: 0 })).toEqual(["1 request"]);
  });

  it("leaves out a zero, and says nothing when both are", () => {
    expect(tonightCounts({ requests: 0, played: 4 })).toEqual(["4 played"]);
    expect(tonightCounts({ requests: 0, played: 0 })).toEqual([]);
  });
});
