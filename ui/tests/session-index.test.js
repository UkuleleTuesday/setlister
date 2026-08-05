// The naming policy from session-index.js — no Firestore, no emulator.
//
// This is what users actually read in the history list, and every branch of it
// is relative to "now", so every test pins the clock explicitly. A test that
// reads the wall clock here is a test that fails at midnight.

import { describe, expect, it } from "vitest";
import { disambiguate, sessionDateLabel, sessionLabel, sessionTimeLabel } from "../session-index.js";

// Tuesday 4 August 2026, 21:00 — a club night, mid-session.
const NOW = new Date(2026, 7, 4, 21, 0);
const at = (y, m, d, h = 20, min = 0) => new Date(y, m, d, h, min);

describe("sessionDateLabel", () => {
  it("calls an evening session tonight", () => {
    expect(sessionDateLabel(at(2026, 7, 4, 20, 14), NOW)).toBe("Tonight");
  });

  it("calls a same-day daytime session today", () => {
    expect(sessionDateLabel(at(2026, 7, 4, 11, 0), NOW)).toBe("Today");
  });

  it("switches from Today to Tonight at 17:00", () => {
    expect(sessionDateLabel(at(2026, 7, 4, 16, 59), NOW)).toBe("Today");
    expect(sessionDateLabel(at(2026, 7, 4, 17, 0), NOW)).toBe("Tonight");
  });

  it("names yesterday", () => {
    expect(sessionDateLabel(at(2026, 7, 3), NOW)).toBe("Yesterday");
  });

  it("keeps a session that runs past midnight on the night it started", () => {
    // Started 21:00 Tuesday, still going at 00:30 Wednesday — an ordinary pub
    // night. It must not relabel itself "Yesterday" while people are still
    // adding songs to it.
    const started = at(2026, 7, 4, 21, 0);
    const halfPastMidnight = at(2026, 7, 5, 0, 30);
    expect(sessionDateLabel(started, halfPastMidnight)).toBe("Tonight");
    // A song added at 00:45 belongs to the same night, too.
    expect(sessionDateLabel(at(2026, 7, 5, 0, 45), halfPastMidnight)).toBe("Tonight");
    // But by Wednesday morning it really is yesterday.
    expect(sessionDateLabel(started, at(2026, 7, 5, 10, 0))).toBe("Yesterday");
  });

  it("uses a bare weekday inside the last week", () => {
    // Only one Tuesday can fall in a 7-day window, so no "Last " prefix is
    // needed — and none of the ambiguity one would bring.
    expect(sessionDateLabel(at(2026, 6, 30), NOW)).toBe("Thursday");
    expect(sessionDateLabel(at(2026, 6, 29), NOW)).toBe("Wednesday");
  });

  it("drops to a date once a week has passed", () => {
    // 28 July 2026 is a Tuesday: the club's normal night, so no weekday.
    expect(sessionDateLabel(at(2026, 6, 28), NOW)).toBe(
      new Intl.DateTimeFormat(undefined, { day: "numeric", month: "long" }).format(at(2026, 6, 28))
    );
  });

  it("keeps the weekday for a night that isn't the club's Tuesday", () => {
    // 23 July 2026 is a Thursday — the interesting thing about it.
    expect(sessionDateLabel(at(2026, 6, 23), NOW)).toMatch(/^Thursday /);
  });

  it("adds the year only once it's a different one", () => {
    const thisYear = sessionDateLabel(at(2026, 0, 6), NOW); // Tue 6 Jan 2026
    const lastYear = sessionDateLabel(at(2025, 11, 16), NOW); // Tue 16 Dec 2025
    expect(thisYear).not.toMatch(/2026/);
    expect(lastYear).toMatch(/2025/);
  });

  it("is empty when there's no date yet", () => {
    expect(sessionDateLabel(null, NOW)).toBe("");
  });
});

describe("sessionLabel", () => {
  it("prefers a typed title over the date", () => {
    expect(sessionLabel({ name: "Open mic night", createdAt: at(2026, 7, 4) }, NOW)).toBe(
      "Open mic night"
    );
  });

  it("falls back to the date when there is no title", () => {
    expect(sessionLabel({ name: "", createdAt: at(2026, 7, 4, 20) }, NOW)).toBe("Tonight");
  });

  it("treats a whitespace-only title as no title", () => {
    expect(sessionLabel({ name: "   ", createdAt: at(2026, 7, 4, 20) }, NOW)).toBe("Tonight");
  });

  it("still renders a session created before naming moved to render time", () => {
    // Those carry a stored full-date string; non-empty always wins, so they
    // just look manually named.
    expect(sessionLabel({ name: "Tuesday, August 4, 2026", createdAt: at(2026, 7, 4) }, NOW)).toBe(
      "Tuesday, August 4, 2026"
    );
  });
});

describe("sessionTimeLabel", () => {
  it("is empty for a session whose createdAt hasn't resolved yet", () => {
    expect(sessionTimeLabel(null)).toBe("");
  });

  it("renders hours and minutes", () => {
    expect(sessionTimeLabel(at(2026, 7, 4, 20, 14))).toMatch(/\d{1,2}[:.]\d{2}/);
  });
});

describe("disambiguate", () => {
  it("leaves a unique label alone", () => {
    const [entry] = disambiguate([{ name: "", createdAt: at(2026, 7, 4, 20) }], NOW);
    expect(entry.label).toBe("Tonight");
  });

  it("suffixes two sessions that render the same, with their start times", () => {
    // Both say "Tonight" — the whole reason this runs on the label rather than
    // the stored name, which is empty for both.
    const labels = disambiguate(
      [
        { name: "", createdAt: at(2026, 7, 4, 20, 14) },
        { name: "", createdAt: at(2026, 7, 4, 22, 30) },
        { name: "", createdAt: at(2026, 7, 3, 20) },
      ],
      NOW
    ).map((e) => e.label);

    expect(labels[0]).toMatch(/^Tonight · /);
    expect(labels[1]).toMatch(/^Tonight · /);
    expect(labels[0]).not.toBe(labels[1]);
    expect(labels[2]).toBe("Yesterday"); // unique, stays clean
  });

  it("disambiguates two identical typed titles too", () => {
    const labels = disambiguate(
      [
        { name: "Open mic", createdAt: at(2026, 7, 4, 20, 14) },
        { name: "Open mic", createdAt: at(2026, 7, 4, 22, 30) },
      ],
      NOW
    ).map((e) => e.label);
    expect(labels[0]).toMatch(/^Open mic · /);
    expect(labels[0]).not.toBe(labels[1]);
  });

  it("doesn't suffix when there's no time to suffix with", () => {
    const labels = disambiguate(
      [
        { name: "Same", createdAt: null },
        { name: "Same", createdAt: null },
      ],
      NOW
    ).map((e) => e.label);
    expect(labels).toEqual(["Same", "Same"]);
  });
});
