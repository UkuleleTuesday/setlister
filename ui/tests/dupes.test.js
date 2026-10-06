// Duplicate-request detection (#52): the pure logic behind "is this song
// already on the night's lists?". The decisions under test: identity is the
// catalogue id (falling back to normalized text), played copies block a
// re-add, binned copies don't.
import { describe, expect, it } from "vitest";

import {
  duplicateLabel,
  findDuplicate,
  indexTonight,
  matchKey,
  normalizeText,
  rowKey,
} from "../dupes.js";

const entry = (over = {}) => ({
  id: "sweet-caroline-neil-diamond",
  display: "Sweet Caroline - Neil Diamond",
  title: "Sweet Caroline",
  artist: "Neil Diamond",
  page: 112,
  ...over,
});

const row = (over = {}) => ({
  uid: "u1",
  raw_title: "Sweet Caroline",
  match: entry(),
  played: false,
  binned: false,
  ...over,
});

describe("normalizeText", () => {
  it("is accent-insensitive and lowercase, like the backend matcher", () => {
    expect(normalizeText("Sarà")).toBe("sara");
    expect(normalizeText("HÉROES")).toBe("heroes");
  });
});

describe("matchKey / rowKey", () => {
  it("uses the catalogue id when present", () => {
    expect(matchKey(entry())).toBe("sweet-caroline-neil-diamond");
  });

  it("falls back to the normalized display for legacy entries without an id", () => {
    expect(matchKey(entry({ id: undefined, display: "Sarà - Vasco" }))).toBe("sara - vasco");
  });

  it("keys an unmatched row off what was written on the board", () => {
    expect(rowKey(row({ match: null, raw_title: "Frée Bird" }))).toBe("free bird");
  });

  it("gives matched rows and their catalogue entry the same key", () => {
    expect(rowKey(row())).toBe(matchKey(entry()));
  });
});

describe("findDuplicate", () => {
  it("finds an active copy and says which list it is in", () => {
    expect(findDuplicate([row()], [], rowKey(row()))).toMatchObject({ where: "upnext" });
    expect(findDuplicate([], [row()], rowKey(row()))).toMatchObject({ where: "requests" });
  });

  it("reports a played copy as played, whichever list holds it", () => {
    expect(findDuplicate([row({ played: true })], [], rowKey(row()))).toMatchObject({
      where: "played",
    });
    // Older clients can sync a played row into Requests — still "played".
    expect(findDuplicate([], [row({ played: true })], rowKey(row()))).toMatchObject({
      where: "played",
    });
  });

  it("ignores binned copies — a binned song can be requested again", () => {
    expect(findDuplicate([row({ binned: true })], [row({ binned: true })], rowKey(row()))).toBeNull();
  });

  it("matches an id-less legacy row against a fresh catalogue pick by text", () => {
    const legacy = row({ match: entry({ id: undefined }) });
    expect(findDuplicate([], [legacy], matchKey(entry({ id: undefined })))).not.toBeNull();
  });

  it("returns null for a new song or an empty key", () => {
    expect(findDuplicate([row()], [], "some-other-song")).toBeNull();
    expect(findDuplicate([row()], [], "")).toBeNull();
  });
});

describe("indexTonight", () => {
  const jolene = entry({ id: "jolene-dolly-parton", display: "Jolene - Dolly Parton" });
  const africa = entry({ id: "africa-toto", display: "Africa - Toto" });
  const upNext = [
    row({ uid: "a", played: true }),
    row({ uid: "b", match: jolene }),
  ];
  const requests = [
    row({ uid: "c", match: africa, binned: true }),
    row({ uid: "d", match: jolene }),
    row({ uid: "e", match: null, raw_title: "Free Bird" }),
  ];

  it("agrees with findDuplicate for every key on the night", () => {
    const index = indexTonight(upNext, requests);
    for (const key of [matchKey(entry()), matchKey(jolene), matchKey(africa), "free bird"]) {
      expect(index.get(key) ?? null).toEqual(findDuplicate(upNext, requests, key));
    }
  });

  it("tags played, Up next and Requests copies, and skips binned ones", () => {
    const index = indexTonight(upNext, requests);
    expect(index.get(matchKey(entry())).where).toBe("played");
    expect(index.get(matchKey(jolene))).toMatchObject({ where: "upnext", row: { uid: "b" } });
    expect(index.has(matchKey(africa))).toBe(false);
    expect(index.get("free bird").where).toBe("requests");
  });
});

describe("duplicateLabel", () => {
  it("names each kind of existing copy", () => {
    expect(duplicateLabel("played")).toBe("Already played tonight");
    expect(duplicateLabel("upnext")).toBe("Already in Up next");
    expect(duplicateLabel("requests")).toBe("Already in Requests");
  });
});
