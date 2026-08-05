// The date-labelling policy from session-index.js — no Firestore, no emulator.
//
// This is what users actually read in the history list, and every branch of it
// is relative to "now", so every test pins the clock explicitly. A test that
// reads the wall clock here is a test that fails at midnight.

import { describe, expect, it } from "vitest";
import {
  disambiguate,
  fromDateInputValue,
  indexEntryData,
  pageTitle,
  sessionDateLabel,
  sessionTimeLabel,
  toDateInputValue,
} from "../session-index.js";

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

  it("calls a session prepped for tomorrow Tomorrow", () => {
    expect(sessionDateLabel(at(2026, 7, 5, 20), NOW)).toBe("Tomorrow");
  });

  it("prefixes Next inside the coming week, where a bare weekday would read as last week", () => {
    expect(sessionDateLabel(at(2026, 7, 7), NOW)).toBe("Next Friday"); // Fri 7 Aug
    expect(sessionDateLabel(at(2026, 7, 10), NOW)).toBe("Next Monday"); // Mon 10 Aug
  });

  it("gives next club Tuesday the bare date — exactly 7 nights out, past the Next window", () => {
    // 11 Aug 2026 is the next Tuesday: a full week away, so the weekday alone
    // would be ambiguous and "Next Tuesday" never renders.
    expect(sessionDateLabel(at(2026, 7, 11), NOW)).toBe(
      new Intl.DateTimeFormat(undefined, { day: "numeric", month: "long" }).format(at(2026, 7, 11))
    );
  });

  it("keeps the weekday for a far-future night that isn't a Tuesday", () => {
    expect(sessionDateLabel(at(2026, 7, 13), NOW)).toMatch(/^Thursday /); // Thu 13 Aug
  });

  it("adds the year to a future date in a different year", () => {
    expect(sessionDateLabel(at(2027, 0, 5), NOW)).toMatch(/2027/);
  });

  it("relabels a prepped session Tonight once its night arrives", () => {
    const prepped = at(2026, 7, 5, 20); // "Tomorrow" as of NOW
    expect(sessionDateLabel(prepped, new Date(2026, 7, 5, 21, 0))).toBe("Tonight");
  });

  it("is empty when there's no date yet", () => {
    expect(sessionDateLabel(null, NOW)).toBe("");
  });
});

// The <input type="date"> bridge. Both directions are timezone footguns
// (toISOString / new Date("YYYY-MM-DD") are UTC), so pin the local-time
// behaviour explicitly.
describe("date input helpers", () => {
  it("renders the LOCAL calendar day, even just after midnight", () => {
    expect(toDateInputValue(new Date(2026, 7, 5, 0, 30))).toBe("2026-08-05");
    expect(toDateInputValue(new Date(2026, 0, 1, 9))).toBe("2026-01-01");
  });

  it("parses to that day's evening in local time", () => {
    const d = fromDateInputValue("2026-08-05");
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 7, 5]);
    expect(d.getHours()).toBe(20);
  });

  it("round-trips a picked day", () => {
    expect(toDateInputValue(fromDateInputValue("2026-08-11"))).toBe("2026-08-11");
  });

  it("treats a cleared or malformed picker as no date", () => {
    expect(fromDateInputValue("")).toBeNull();
    expect(fromDateInputValue(null)).toBeNull();
    expect(fromDateInputValue("2026-8-5")).toBeNull();
  });

  it("stamps an evening, so a picked day labels as Tonight on its night", () => {
    expect(sessionDateLabel(fromDateInputValue("2026-08-05"), NOW)).toBe("Tomorrow");
    expect(sessionDateLabel(fromDateInputValue("2026-08-04"), NOW)).toBe("Tonight");
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
    const [entry] = disambiguate([{ createdAt: at(2026, 7, 4, 20) }], NOW);
    expect(entry.label).toBe("Tonight");
  });

  it("suffixes two sessions that render the same, with their start times", () => {
    const labels = disambiguate(
      [
        { createdAt: at(2026, 7, 4, 20, 14) },
        { createdAt: at(2026, 7, 4, 22, 30) },
        { createdAt: at(2026, 7, 3, 20) },
      ],
      NOW
    ).map((e) => e.label);

    expect(labels[0]).toMatch(/^Tonight · /);
    expect(labels[1]).toMatch(/^Tonight · /);
    expect(labels[0]).not.toBe(labels[1]);
    expect(labels[2]).toBe("Yesterday"); // unique, stays clean
  });

  it("ignores a legacy stored name — the date is the label now", () => {
    const [entry] = disambiguate([{ name: "Open mic", createdAt: at(2026, 7, 4, 20) }], NOW);
    expect(entry.label).toBe("Tonight");
  });

  it("doesn't suffix when there's no time to suffix with", () => {
    const labels = disambiguate([{ createdAt: null }, { createdAt: null }], NOW).map(
      (e) => e.label
    );
    expect(labels).toEqual(["", ""]);
  });
});

// The one write-side shape, shared by create/re-list/backfill. A stub fx is
// enough: what matters is which branch (server stamp vs picked date) fires.
describe("indexEntryData", () => {
  const SERVER_STAMP = Symbol("serverTimestamp");
  const fx = {
    serverTimestamp: () => SERVER_STAMP,
    Timestamp: { fromDate: (d) => ({ wrapped: d }) },
  };

  it("leaves createdAt to the server when no date is given", () => {
    expect(indexEntryData({ createdBy: "Alex" }, fx)).toEqual({
      v: 1,
      createdBy: "Alex",
      createdAt: SERVER_STAMP,
    });
  });

  it("wraps a picked date instead of a server stamp", () => {
    const picked = at(2026, 7, 11);
    expect(indexEntryData({ createdBy: "Alex", createdAt: picked }, fx).createdAt).toEqual({
      wrapped: picked,
    });
  });

  it("clamps createdBy to the rules' 60-char cap", () => {
    const entry = indexEntryData({ createdBy: "x".repeat(80) }, fx);
    expect(entry.createdBy).toHaveLength(60);
  });
});

describe("pageTitle", () => {
  it("leads with the night's label in a session, so parked tabs are tellable apart", () => {
    expect(pageTitle("Tonight")).toBe("Tonight · Setlister");
    expect(pageTitle("Wexford weekender")).toBe("Wexford weekender · Setlister");
  });

  it("falls back to the brand on the home view", () => {
    expect(pageTitle("")).toBe("Setlister · Ukulele Tuesday");
    expect(pageTitle(null)).toBe("Setlister · Ukulele Tuesday");
  });
});
