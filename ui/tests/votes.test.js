// Upvotes on requests (#83).
//
// Two things here are load bearing beyond "the arithmetic adds up": toggleVote
// must not mutate its input (sync.js's diff compares against the last server
// state, and editing it underneath would make changes invisible to the push),
// and the display sort must be stable (that is the whole of "ties keep arrival
// order", and an unstable sort reshuffles the pool under the MC's thumb every
// time an unrelated row is voted).

import { describe, expect, it } from "vitest";
import { ASKER, hasVoted, seedAsker, sortForDisplay, toggleVote, voteCount } from "../votes.js";

const A = "client-a";
const B = "client-b";

describe("voteCount / hasVoted", () => {
  const votes = { song1: { [A]: true, [B]: true }, song2: { [A]: true } };

  it("counts the voters on a row", () => {
    expect(voteCount(votes, "song1")).toBe(2);
    expect(voteCount(votes, "song2")).toBe(1);
  });

  it("reads an unvoted row as zero rather than blowing up", () => {
    expect(voteCount(votes, "never-voted")).toBe(0);
    expect(voteCount(undefined, "song1")).toBe(0);
    expect(voteCount({ song1: "nonsense" }, "song1")).toBe(0);
  });

  it("knows whose vote it is", () => {
    expect(hasVoted(votes, "song1", A)).toBe(true);
    expect(hasVoted(votes, "song2", B)).toBe(false);
    expect(hasVoted(votes, "never-voted", A)).toBe(false);
  });
});

describe("toggleVote", () => {
  it("adds a vote, then takes it back", () => {
    const once = toggleVote({}, "song1", A);
    expect(once).toEqual({ song1: { [A]: true } });
    expect(toggleVote(once, "song1", A)).toEqual({});
  });

  it("leaves other people's votes alone", () => {
    const votes = { song1: { [A]: true, [B]: true } };
    expect(toggleVote(votes, "song1", A)).toEqual({ song1: { [B]: true } });
  });

  // Otherwise a session accumulates an empty object for every song anyone ever
  // voted for and changed their mind about.
  it("drops the row's key when its last vote goes", () => {
    expect(toggleVote({ song1: { [A]: true } }, "song1", A)).toEqual({});
  });

  it("does not mutate what it was given", () => {
    const votes = { song1: { [A]: true } };
    const before = structuredClone(votes);
    toggleVote(votes, "song1", B);
    toggleVote(votes, "song1", A);
    expect(votes).toEqual(before);
  });

  it("copes with a missing or wrong-typed map", () => {
    expect(toggleVote(undefined, "song1", A)).toEqual({ song1: { [A]: true } });
    expect(toggleVote({ song1: "nonsense" }, "song1", A)).toEqual({
      song1: { [A]: true },
    });
  });
});

// The point of seeding isn't warmth, it's parity: someone using the app can add
// a song and then thumb it up, where whoever wrote on the whiteboard isn't in
// the app to do either. Both channels have to enter the pool at the same score,
// or the sort quietly ranks app requests above board ones.
describe("seedAsker", () => {
  it("puts an app request in at one, as the requester's own vote", () => {
    const votes = seedAsker({}, "song1", A);
    expect(voteCount(votes, "song1")).toBe(1);
    expect(hasVoted(votes, "song1", A)).toBe(true);
  });

  it("puts a scanned row in at one too, but attributed to nobody", () => {
    const votes = seedAsker({}, "song1", ASKER);
    expect(voteCount(votes, "song1")).toBe(1);
    expect(hasVoted(votes, "song1", A)).toBe(false);
    expect(hasVoted(votes, "song1", B)).toBe(false);
  });

  it("leaves the two on equal footing", () => {
    const fromApp = seedAsker({}, "song1", A);
    const fromBoard = seedAsker({}, "song2", ASKER);
    expect(voteCount(fromApp, "song1")).toBe(voteCount(fromBoard, "song2"));
  });

  // Otherwise the requester's own tap would be a free second vote, which is the
  // exact advantage the seeding exists to remove.
  it("gives the requester nothing more to add", () => {
    const votes = seedAsker({}, "song1", A);
    expect(toggleVote(votes, "song1", A)).toEqual({});
  });

  it("never double-seeds an existing vote", () => {
    const once = seedAsker({}, "song1", A);
    expect(seedAsker(once, "song1", A)).toBe(once);
    expect(voteCount(seedAsker(once, "song1", A), "song1")).toBe(1);
  });

  it("does not mutate what it was given", () => {
    const votes = { song1: { [B]: true } };
    const before = structuredClone(votes);
    seedAsker(votes, "song1", A);
    expect(votes).toEqual(before);
  });
});

describe("sortForDisplay", () => {
  const rows = [
    { uid: "first" },
    { uid: "second" },
    { uid: "third" },
    { uid: "fourth" },
  ];

  it("puts the most wanted at the top", () => {
    const votes = {
      third: { a: true, b: true, c: true },
      first: { a: true },
      fourth: { a: true, b: true },
    };
    expect(sortForDisplay(rows, votes).map((r) => r.uid)).toEqual([
      "third",
      "fourth",
      "first",
      "second",
    ]);
  });

  it("keeps arrival order within a tie", () => {
    const votes = {
      first: { a: true },
      second: { a: true },
      third: { a: true },
      fourth: { a: true },
    };
    expect(sortForDisplay(rows, votes).map((r) => r.uid)).toEqual([
      "first",
      "second",
      "third",
      "fourth",
    ]);
  });

  it("leaves an unvoted pool exactly as it arrived", () => {
    expect(sortForDisplay(rows, {}).map((r) => r.uid)).toEqual([
      "first",
      "second",
      "third",
      "fourth",
    ]);
  });

  it("does not mutate the list it was given", () => {
    const votes = { fourth: { a: true } };
    const before = rows.map((r) => r.uid);
    sortForDisplay(rows, votes);
    expect(rows.map((r) => r.uid)).toEqual(before);
  });
});
