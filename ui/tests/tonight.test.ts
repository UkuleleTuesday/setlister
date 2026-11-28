import { describe, expect, it } from "vitest";
import { tonightCounts, tonightNextText, tonightSummary } from "../tonight.js";
import type { Row } from "../types.js";

const row = (uid: string, extra: Partial<Row> = {}): Row =>
  ({ uid, raw_title: uid, match: null, played: false, binned: false, ...extra }) as Row;
const song = (page: number, display: string) => ({ id: display, display, title: display, page });

describe("tonightSummary", () => {
  it("takes the first tune in Up next that's neither played nor binned", () => {
    const upNext = [row("played", { played: true }), row("binned", { binned: true }), row("next")];
    expect(tonightSummary({ upNext, requests: [] }).next?.uid).toBe("next");
  });

  it("has no next tune when Up next is spent", () => {
    expect(tonightSummary({ upNext: [row("a", { played: true })], requests: [] }).next).toBeNull();
  });

  it("counts requests left in the pool and tunes played", () => {
    const summary = tonightSummary({
      upNext: [row("a", { played: true }), row("b", { played: true }), row("c")],
      requests: [row("d"), row("e", { binned: true }), row("f")],
    });
    expect(summary).toMatchObject({ requests: 2, played: 2 });
  });
});

describe("tonightCounts", () => {
  it("joins both counts", () => {
    expect(tonightCounts({ next: null, requests: 3, played: 1 })).toBe("3 requests · 1 played");
  });

  it("says one request in the singular", () => {
    expect(tonightCounts({ next: null, requests: 1, played: 0 })).toBe("1 request");
  });

  it("leaves out a zero, and says nothing when both are", () => {
    expect(tonightCounts({ next: null, requests: 0, played: 4 })).toBe("4 played");
    expect(tonightCounts({ next: null, requests: 0, played: 0 })).toBe("");
  });
});

describe("tonightNextText", () => {
  it("leads with the page", () => {
    expect(tonightNextText(row("a", { match: song(9, "Let It Be - The Beatles") }))).toBe(
      "p.9 Let It Be - The Beatles",
    );
  });

  it("quotes the written title of a tune off the book", () => {
    expect(tonightNextText(row("a", { raw_title: "Wonderwall" }))).toBe("“Wonderwall”");
  });
});
