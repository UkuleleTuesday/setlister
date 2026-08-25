// The one-time name amnesty: the decisions under test are that the reset runs
// exactly once per device and only in the full view; that a first-ever visitor
// is marked done silently instead of being told about a name they never had;
// and that the sheet's copy keeps both halves of the ask — set a real name,
// and the (affectionate) threat for anyone who doesn't.
import { describe, expect, it } from "vitest";

import {
  NAME_RESET_KEY,
  NAME_RESET_MESSAGE,
  NAME_RESET_ROUND,
  resolveNameReset,
} from "../name-reset.js";

describe("resolveNameReset", () => {
  it("clears the name and shows the sheet once on a used full-view device", () => {
    expect(resolveNameReset({ mode: "full", done: false, hasSavedState: true })).toEqual({
      clearName: true,
      showSheet: true,
      markDone: true,
    });
  });

  it("does nothing once the round is done", () => {
    expect(resolveNameReset({ mode: "full", done: true, hasSavedState: true })).toEqual({
      clearName: false,
      showSheet: false,
      markDone: false,
    });
  });

  it("leaves room devices alone, without marking them done", () => {
    // No markDone: a room phone later handed ?mode=full still gets its amnesty.
    expect(resolveNameReset({ mode: "room", done: false, hasSavedState: true })).toEqual({
      clearName: false,
      showSheet: false,
      markDone: false,
    });
  });

  it("marks a first-ever visitor done silently, with no sheet", () => {
    expect(resolveNameReset({ mode: "full", done: false, hasSavedState: false })).toEqual({
      clearName: false,
      showSheet: false,
      markDone: true,
    });
  });
});

describe("the amnesty copy", () => {
  it("asks for a real name and warns what a fake one costs", () => {
    expect(NAME_RESET_MESSAGE).toContain("has been reset");
    expect(NAME_RESET_MESSAGE).toContain("real name");
    expect(NAME_RESET_MESSAGE).toContain("a puppy dies");
  });

  it("uses no em dashes (AGENTS.md)", () => {
    expect(NAME_RESET_MESSAGE).not.toContain("—");
  });
});

describe("the flag", () => {
  it("lives under its own key, outside setlister.v1", () => {
    expect(NAME_RESET_KEY).toBe("setlister.nameReset.v1");
    expect(NAME_RESET_ROUND).toBe("1");
  });
});
