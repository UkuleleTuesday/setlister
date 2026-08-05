// The two pure halves of the sync engine.
//
// `deserialize` is the safety net that stops a concurrent move+edit merge
// losing songs, and `diff` decides what actually gets written — a bug in either
// costs a club its setlist, quietly. Neither needs Firestore.

import { describe, expect, it } from "vitest";
import { deserialize, diff, readMeta, serialize } from "../sync.js";

const row = (uid, title) => ({ uid, raw_title: title });

// diff() only calls fx.deleteField(); a sentinel is enough to assert on.
const DELETED = Symbol("deleteField");
const fx = { deleteField: () => DELETED };

describe("serialize / deserialize", () => {
  it("round-trips both lists in order", () => {
    const state = {
      upNext: [row("a", "Wagon Wheel"), row("b", "Hey Ya")],
      requests: [row("c", "Hallelujah")],
      edition: { id: "current" },
    };
    const back = deserialize(serialize(state));
    expect(back.upNext.map((r) => r.uid)).toEqual(["a", "b"]);
    expect(back.requests.map((r) => r.uid)).toEqual(["c"]);
    expect(back.edition).toEqual({ id: "current" });
  });

  it("drops order entries whose row is gone", () => {
    const back = deserialize({
      rows: { a: row("a", "Wagon Wheel") },
      upNextOrder: ["a", "ghost"],
      requestsOrder: [],
    });
    expect(back.upNext.map((r) => r.uid)).toEqual(["a"]);
  });

  it("dedupes a uid listed in both orders", () => {
    const back = deserialize({
      rows: { a: row("a", "Wagon Wheel") },
      upNextOrder: ["a"],
      requestsOrder: ["a"],
    });
    expect(back.upNext.map((r) => r.uid)).toEqual(["a"]);
    expect(back.requests).toEqual([]);
  });

  it("rescues an orphan row into requests rather than losing it", () => {
    const back = deserialize({
      rows: { a: row("a", "Wagon Wheel"), orphan: row("orphan", "Creep") },
      upNextOrder: ["a"],
      requestsOrder: [],
    });
    expect(back.requests.map((r) => r.uid)).toEqual(["orphan"]);
  });

  it("survives a malformed or empty remote doc", () => {
    expect(deserialize(null)).toEqual({ upNext: [], requests: [], edition: null });
    expect(deserialize({ rows: "nope", upNextOrder: 3 })).toEqual({
      upNext: [],
      requests: [],
      edition: null,
    });
  });
});

describe("readMeta", () => {
  // A session with no `listed` field predates visibility and should be adopted
  // into the club's history. A session with `listed: false` was deliberately
  // unlisted and must be left alone. Collapsing the two meant opening an
  // unlisted session's own share link re-advertised it to everyone.
  it("treats a missing listed field as legacy, not as unlisted-on-purpose", () => {
    const meta = readMeta({ name: "", createdBy: "" });
    expect(meta.legacy).toBe(true);
    expect(meta.listed).toBe(false);
  });

  it("treats an explicit false as a deliberate choice, not legacy", () => {
    const meta = readMeta({ name: "", createdBy: "", listed: false });
    expect(meta.legacy).toBe(false);
    expect(meta.listed).toBe(false);
  });

  it("reads an explicit true", () => {
    const meta = readMeta({ name: "", createdBy: "", listed: true });
    expect(meta.legacy).toBe(false);
    expect(meta.listed).toBe(true);
  });

  it("survives a missing document", () => {
    expect(readMeta(null)).toEqual({ name: "", createdBy: "", listed: false, legacy: true });
  });

  it("ignores wrong-typed fields rather than trusting them", () => {
    const meta = readMeta({ name: 42, createdBy: null, listed: "yes" });
    expect(meta).toEqual({ name: "", createdBy: "", listed: false, legacy: false });
  });
});

describe("diff", () => {
  const base = { rows: { a: row("a", "Wagon Wheel") }, upNextOrder: ["a"], requestsOrder: [], edition: null };

  it("returns null when nothing changed, so the doc isn't churned", () => {
    expect(diff(base, structuredClone(base), fx)).toBeNull();
  });

  it("writes only the row that changed, as a dotted path", () => {
    const next = structuredClone(base);
    next.rows.a.raw_title = "Wagon Wheel (Old Crow)";
    const updates = diff(base, next, fx);
    expect(Object.keys(updates)).toEqual(["rows.a"]);
  });

  it("deletes a removed row rather than rewriting the whole map", () => {
    const next = { ...structuredClone(base), rows: {}, upNextOrder: [] };
    const updates = diff(base, next, fx);
    expect(updates["rows.a"]).toBe(DELETED);
    expect(updates.upNextOrder).toEqual([]);
  });

  it("writes an order array only when it actually changed", () => {
    const next = structuredClone(base);
    next.rows.b = row("b", "Hey Ya");
    next.requestsOrder = ["b"];
    const updates = diff(base, next, fx);
    expect(updates).toHaveProperty("rows.b");
    expect(updates).toHaveProperty("requestsOrder");
    expect(updates).not.toHaveProperty("upNextOrder");
  });

  it("treats a first push (no previous state) as all-new", () => {
    const updates = diff(null, base, fx);
    expect(updates).toHaveProperty("rows.a");
    expect(updates).toHaveProperty("upNextOrder");
  });
});
