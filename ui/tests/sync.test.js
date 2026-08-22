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
    const empty = { upNext: [], requests: [], edition: null, votes: {} };
    expect(deserialize(null)).toEqual(empty);
    expect(deserialize({ rows: "nope", upNextOrder: 3, votes: "nope" })).toEqual(empty);
  });
});

describe("readMeta", () => {
  // A session with no `listed` field predates visibility and should be adopted
  // into the club's history. A session with `listed: false` was deliberately
  // unlisted and must be left alone. Collapsing the two meant opening an
  // unlisted session's own share link re-advertised it to everyone.
  it("treats a missing listed field as legacy, not as unlisted-on-purpose", () => {
    const meta = readMeta({ createdBy: "" });
    expect(meta.legacy).toBe(true);
    expect(meta.listed).toBe(false);
  });

  it("treats an explicit false as a deliberate choice, not legacy", () => {
    const meta = readMeta({ createdBy: "", listed: false });
    expect(meta.legacy).toBe(false);
    expect(meta.listed).toBe(false);
  });

  it("reads an explicit true", () => {
    const meta = readMeta({ createdBy: "", listed: true });
    expect(meta.legacy).toBe(false);
    expect(meta.listed).toBe(true);
  });

  it("survives a missing document", () => {
    expect(readMeta(null)).toEqual({
      createdBy: "",
      listed: false,
      requestsOpen: null,
      requestsOpensAt: null,
      requestsClosesAt: null,
      legacy: true,
    });
  });

  it("ignores wrong-typed fields rather than trusting them", () => {
    const meta = readMeta({ createdBy: null, listed: "yes" });
    expect(meta).toEqual({
      createdBy: "",
      listed: false,
      requestsOpen: null,
      requestsOpensAt: null,
      requestsClosesAt: null,
      legacy: false,
    });
  });

  // requestsOpen is tri-state: true/false are a deliberate override, absent is
  // AUTO — follow the request window (see request-window.js), not "always
  // open". Every session that predates this field reads as auto now rather
  // than permanently open; the window's own default covers a whole ordinary
  // night, so that's invisible for anything actually happening tonight.
  it("treats a missing requestsOpen as auto, not forced either way", () => {
    expect(readMeta({ createdBy: "" }).requestsOpen).toBeNull();
    expect(readMeta({ createdBy: "", listed: true }).requestsOpen).toBeNull();
  });

  it("reads an explicit true or false as a forced override", () => {
    expect(readMeta({ requestsOpen: false }).requestsOpen).toBe(false);
    expect(readMeta({ requestsOpen: true }).requestsOpen).toBe(true);
    // A wrong-typed value is not a forced close: falling back to auto beats a
    // session nobody can request from because a stray write put a string in
    // the field.
    expect(readMeta({ requestsOpen: "no" }).requestsOpen).toBeNull();
  });

  it("reads the request window overrides, or null when absent/malformed", () => {
    const toDate = (d) => ({ toDate: () => d });
    const opensAt = new Date(2026, 7, 4, 19, 30);
    const closesAt = new Date(2026, 7, 5, 4, 0);
    const meta = readMeta({ requestsOpensAt: toDate(opensAt), requestsClosesAt: toDate(closesAt) });
    expect(meta.requestsOpensAt).toEqual(opensAt);
    expect(meta.requestsClosesAt).toEqual(closesAt);
    expect(readMeta({}).requestsOpensAt).toBeNull();
    expect(readMeta({ requestsOpensAt: "nope" }).requestsOpensAt).toBeNull();
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

  // Votes (#83) must go out leaf by leaf. A wholesale `votes` write would be
  // last-writer-wins, which is precisely what the separate field exists to
  // avoid: the room votes for the same song at the same moment, and all of
  // those taps have to survive.
  describe("votes", () => {
    const voted = (votes) => ({ ...structuredClone(base), votes });

    it("writes one leaf per new vote, never the whole map", () => {
      const updates = diff(voted({}), voted({ a: { alex: true } }), fx);
      expect(updates).toEqual({ "votes.a.alex": true });
      expect(updates).not.toHaveProperty("votes");
    });

    it("deletes just the leaf when someone takes their vote back", () => {
      const updates = diff(voted({ a: { alex: true, sam: true } }), voted({ a: { sam: true } }), fx);
      expect(updates).toEqual({ "votes.a.alex": DELETED });
    });

    it("leaves a peer's vote alone while adding your own", () => {
      const updates = diff(voted({ a: { sam: true } }), voted({ a: { sam: true, alex: true } }), fx);
      expect(updates).toEqual({ "votes.a.alex": true });
    });

    it("clears the last leaf when a row's key is dropped entirely", () => {
      expect(diff(voted({ a: { alex: true } }), voted({}), fx)).toEqual({
        "votes.a.alex": DELETED,
      });
    });

    it("stays quiet when the votes are unchanged", () => {
      const votes = { a: { alex: true } };
      expect(diff(voted(votes), voted(structuredClone(votes)), fx)).toBeNull();
    });

    // Votes are keyed on the row uid, which promote()/demote() carry across —
    // that is why a vote cast in the pool still counts once the tune is queued.
    // A promote must push as two order arrays and nothing else.
    it("carries a voted row between the lists without disturbing its votes", () => {
      const pooled = {
        ...structuredClone(base),
        upNextOrder: [],
        requestsOrder: ["a"],
        votes: { a: { alex: true, sam: true } },
      };
      const promoted = { ...structuredClone(pooled), upNextOrder: ["a"], requestsOrder: [] };
      const updates = diff(pooled, promoted, fx);
      expect(updates).toEqual({ upNextOrder: ["a"], requestsOrder: [] });
    });
  });
});
