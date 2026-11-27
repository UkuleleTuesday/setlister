import { describe, expect, it } from "vitest";
import {
  deserialize,
  diff,
  isPermissionDenied,
  readMeta,
  roomRequestUpdates,
  roomVoteUpdates,
  serialize,
  setSessionBlurb,
} from "../sync.js";
import type { Row, SyncFields, Votes } from "../types.js";
import { row as baseRow } from "./fixtures.js";

const row = (uid: string, title: string) => baseRow({ uid, raw_title: title });

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

  it("skips rows that aren't objects filed under their own uid", () => {
    const back = deserialize({
      rows: {
        a: row("a", "Wagon Wheel"),
        gone: null,
        text: "Hey Ya",
        list: [row("list", "Creep")],
        noUid: { raw_title: "Hallelujah" },
        moved: row("elsewhere", "Jolene"),
      },
      upNextOrder: ["gone", "a", "text"],
      requestsOrder: ["list", "noUid", "moved"],
    });
    expect(back.upNext.map((r) => r.uid)).toEqual(["a"]);
    expect(back.requests).toEqual([]);
  });

  it("reads an edition without a string id as no edition", () => {
    expect(deserialize({ edition: { id: 7 } }).edition).toBeNull();
    expect(deserialize({ edition: "current" }).edition).toBeNull();
    expect(deserialize({ edition: { id: "current" } }).edition).toEqual({ id: "current" });
  });

  it("deletes skipped rows and a bad edition on the next push", () => {
    const doc = {
      rows: { a: row("a", "Wagon Wheel"), gone: null as unknown as Row },
      upNextOrder: ["a"],
      requestsOrder: [],
      edition: { id: 7 } as unknown as SyncFields["edition"],
      votes: {},
    };
    const updates = diff(doc, serialize(deserialize(doc)), fx);
    expect(updates).toEqual({ "rows.gone": DELETED, edition: null });
  });
});

describe("readMeta", () => {
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
      blurb: "",
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
      blurb: "",
      requestsOpen: null,
      requestsOpensAt: null,
      requestsClosesAt: null,
      legacy: false,
    });
  });

  it("reads a blurb, and anything but a string as none", () => {
    expect(readMeta({ blurb: "Hats on" }).blurb).toBe("Hats on");
    expect(readMeta({ blurb: 42 }).blurb).toBe("");
  });

  it("treats a missing requestsOpen as auto, not forced either way", () => {
    expect(readMeta({ createdBy: "" }).requestsOpen).toBeNull();
    expect(readMeta({ createdBy: "", listed: true }).requestsOpen).toBeNull();
  });

  it("reads an explicit true or false as a forced override", () => {
    expect(readMeta({ requestsOpen: false }).requestsOpen).toBe(false);
    expect(readMeta({ requestsOpen: true }).requestsOpen).toBe(true);
  });

  it("reads a wrong-typed requestsOpen as auto, not forced closed", () => {
    expect(readMeta({ requestsOpen: "no" }).requestsOpen).toBeNull();
  });

  it("reads the request window overrides, or null when absent/malformed", () => {
    const toDate = (d: Date) => ({ toDate: () => d });
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
  const base: SyncFields = {
    rows: { a: row("a", "Wagon Wheel") },
    upNextOrder: ["a"],
    requestsOrder: [],
    edition: null,
    votes: {},
  };

  it("returns null when nothing changed, so the doc isn't churned", () => {
    expect(diff(base, structuredClone(base), fx)).toBeNull();
  });

  it("writes only the row that changed, as a dotted path", () => {
    const next = structuredClone(base);
    next.rows.a.raw_title = "Wagon Wheel (Old Crow)";
    const updates = diff(base, next, fx);
    expect(Object.keys(updates!)).toEqual(["rows.a"]);
  });

  it("deletes a removed row rather than rewriting the whole map", () => {
    const next = { ...structuredClone(base), rows: {}, upNextOrder: [] };
    const updates = diff(base, next, fx);
    expect(updates!["rows.a"]).toBe(DELETED);
    expect(updates!.upNextOrder).toEqual([]);
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

  describe("votes", () => {
    const voted = (votes: Votes): SyncFields => ({ ...structuredClone(base), votes });

    it("writes one leaf per new vote, never the whole map", () => {
      const updates = diff(voted({}), voted({ a: { alex: true } }), fx);
      expect(updates).toEqual({ "votes.a.alex": true });
      expect(updates).not.toHaveProperty("votes");
    });

    it("deletes just the leaf when someone takes their vote back", () => {
      const updates = diff(
        voted({ a: { alex: true, sam: true } }),
        voted({ a: { sam: true } }),
        fx,
      );
      expect(updates).toEqual({ "votes.a.alex": DELETED });
    });

    it("leaves a peer's vote alone while adding your own", () => {
      const updates = diff(
        voted({ a: { sam: true } }),
        voted({ a: { sam: true, alex: true } }),
        fx,
      );
      expect(updates).toEqual({ "votes.a.alex": true });
    });

    it("clears the last leaf when a row's key is dropped entirely", () => {
      expect(diff(voted({ a: { alex: true } }), voted({}), fx)).toEqual({
        "votes.a.alex": DELETED,
      });
    });

    it("stays quiet when the votes are unchanged", () => {
      const votes: Votes = { a: { alex: true } };
      expect(diff(voted(votes), voted(structuredClone(votes)), fx)).toBeNull();
    });

    it("carries a voted row between the lists without disturbing its votes", () => {
      const pooled: SyncFields = {
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

// Must match firestore.rules' isRoomWrite; tests/rules.test.ts replays them.
describe("room writes", () => {
  const roomFx = {
    arrayUnion: (...values: unknown[]) => ({ union: values }),
    serverTimestamp: () => "NOW",
    deleteField: () => DELETED,
  } as unknown as Parameters<typeof roomRequestUpdates>[2] & Parameters<typeof roomVoteUpdates>[3];

  it("adds one row, appends its uid and seeds the asker's vote", () => {
    const row = { ...baseRow({ uid: "n1" }), source: "room" as const };
    expect(roomRequestUpdates(row, "c1", roomFx)).toEqual({
      "rows.n1": row,
      requestsOrder: { union: ["n1"] },
      "votes.n1.c1": true,
      updatedAt: "NOW",
    });
  });

  it("sets or deletes one vote leaf", () => {
    expect(roomVoteUpdates("r1", "c1", true, roomFx)).toEqual({
      "votes.r1.c1": true,
      updatedAt: "NOW",
    });
    expect(roomVoteUpdates("r1", "c1", false, roomFx)).toEqual({
      "votes.r1.c1": DELETED,
      updatedAt: "NOW",
    });
  });

  it("knows a rules refusal", () => {
    expect(isPermissionDenied({ code: "permission-denied" })).toBe(true);
    expect(isPermissionDenied({ code: "unavailable" })).toBe(false);
    expect(isPermissionDenied(null)).toBe(false);
  });
});

describe("setSessionBlurb", () => {
  it("refuses before a session is joined, rather than reading as saved", async () => {
    await expect(setSessionBlurb("Upstairs tonight")).rejects.toThrow(/connecting/);
  });
});
