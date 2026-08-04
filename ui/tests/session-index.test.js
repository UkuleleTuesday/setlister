// Pure helpers from session-index.js — no Firestore, no emulator.
//
// These are the bits that decide what a night is *called*, which is the part
// users actually see in the history list.

import { describe, expect, it } from "vitest";
import { defaultSessionName, disambiguate, sessionTimeLabel } from "../session-index.js";

// Node's ICU default locale in CI is en-US; the app uses the device locale, so
// assert on the pieces that hold either way rather than one exact string.
describe("defaultSessionName", () => {
  it("names a session after its weekday and full date", () => {
    const name = defaultSessionName(new Date(2026, 7, 4, 20, 14));
    expect(name).toContain("Tuesday");
    expect(name).toContain("August");
    expect(name).toContain("4");
    expect(name).toContain("2026");
  });

  it("defaults to today", () => {
    expect(defaultSessionName()).toBe(defaultSessionName(new Date()));
  });
});

describe("sessionTimeLabel", () => {
  it("is empty for a session whose createdAt hasn't resolved yet", () => {
    expect(sessionTimeLabel(null)).toBe("");
  });

  it("renders hours and minutes", () => {
    expect(sessionTimeLabel(new Date(2026, 7, 4, 20, 14))).toMatch(/\d{1,2}[:.]\d{2}/);
  });
});

describe("disambiguate", () => {
  const at = (h) => new Date(2026, 7, 4, h, 0);

  it("leaves a unique name alone", () => {
    const [entry] = disambiguate([{ name: "Tuesday 4 August 2026", createdAt: at(20) }]);
    expect(entry.label).toBe("Tuesday 4 August 2026");
  });

  it("suffixes every member of a same-name run with its start time", () => {
    const labels = disambiguate([
      { name: "Tuesday 4 August 2026", createdAt: at(20) },
      { name: "Tuesday 4 August 2026", createdAt: at(22) },
      { name: "Tuesday 11 August 2026", createdAt: at(20) },
    ]).map((e) => e.label);

    expect(labels[0]).toMatch(/^Tuesday 4 August 2026 · /);
    expect(labels[1]).toMatch(/^Tuesday 4 August 2026 · /);
    expect(labels[0]).not.toBe(labels[1]);
    // The unique one stays clean.
    expect(labels[2]).toBe("Tuesday 11 August 2026");
  });

  it("doesn't suffix when there's no time to suffix with", () => {
    const labels = disambiguate([
      { name: "Same", createdAt: null },
      { name: "Same", createdAt: null },
    ]).map((e) => e.label);
    expect(labels).toEqual(["Same", "Same"]);
  });
});
