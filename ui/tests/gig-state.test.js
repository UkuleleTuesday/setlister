// Played / binned transitions and the times they record.
//
// Two things are load bearing beyond "the flag flips": un-marking must REMOVE
// the key (an `undefined` value makes Firestore's updateDoc throw, since
// serialize() hands the live row to it), and a re-mark must record the new
// moment, not keep the old one.

import { describe, expect, it } from "vitest";
import { setBinned, setPlayed, stateTime } from "../gig-state.js";

const T1 = Date.UTC(2026, 9, 21, 20, 42, 11);
const T2 = Date.UTC(2026, 9, 21, 21, 5, 0);

const fresh = () => ({ uid: "a", played: false, binned: false });

describe("setPlayed", () => {
  it("records the moment as an ISO string", () => {
    const row = fresh();
    setPlayed(row, true, T1);
    expect(row.played).toBe(true);
    expect(row.playedAt).toBe("2026-10-21T20:42:11.000Z");
  });

  it("un-playing removes the key rather than leaving undefined behind", () => {
    const row = fresh();
    setPlayed(row, true, T1);
    setPlayed(row, false, T2);
    expect(row.played).toBe(false);
    expect("playedAt" in row).toBe(false);
  });

  it("a re-mark records the new moment", () => {
    const row = fresh();
    setPlayed(row, true, T1);
    setPlayed(row, false);
    setPlayed(row, true, T2);
    expect(row.playedAt).toBe(new Date(T2).toISOString());
  });

  it("lifts a bin, time included", () => {
    const row = fresh();
    setBinned(row, true, T1);
    setPlayed(row, true, T2);
    expect(row.binned).toBe(false);
    expect("binnedAt" in row).toBe(false);
    expect(row.playedAt).toBe(new Date(T2).toISOString());
  });

  it("defaults to now", () => {
    const before = Date.now();
    const row = fresh();
    setPlayed(row, true);
    expect(stateTime(row.playedAt).getTime()).toBeGreaterThanOrEqual(before);
  });
});

describe("setBinned", () => {
  it("records the moment and un-plays", () => {
    const row = fresh();
    setPlayed(row, true, T1);
    setBinned(row, true, T2);
    expect(row.binned).toBe(true);
    expect(row.binnedAt).toBe(new Date(T2).toISOString());
    expect(row.played).toBe(false);
    expect("playedAt" in row).toBe(false);
  });

  it("restoring removes the key", () => {
    const row = fresh();
    setBinned(row, true, T1);
    setBinned(row, false);
    expect("binnedAt" in row).toBe(false);
  });
});

describe("stateTime", () => {
  it("parses a stored ISO string", () => {
    expect(stateTime("2026-10-21T20:42:11.000Z").getTime()).toBe(T1);
  });

  it("is null for absent or garbage values", () => {
    expect(stateTime(undefined)).toBeNull();
    expect(stateTime(null)).toBeNull();
    expect(stateTime("soon")).toBeNull();
    expect(stateTime(T1)).toBeNull();
  });
});
