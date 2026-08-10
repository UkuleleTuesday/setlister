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
  partitionSessions,
  plannedSessionMessage,
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

  it("stamps a night beyond yesterday with its date, weekday kept off-Tuesday", () => {
    // A bare "Thursday" said when, a bare "Tuesday" said nothing to a club
    // that meets every Tuesday — so beyond the neighbouring nights it's the
    // date, with the weekday only where it's the interesting part.
    expect(sessionDateLabel(at(2026, 6, 30), NOW)).toMatch(/^Thursday /);
    expect(sessionDateLabel(at(2026, 6, 29), NOW)).toMatch(/^Wednesday /);
  });

  it("gives a past club Tuesday inside the week the bare date", () => {
    // Viewed on a Sunday evening, the previous Tuesday is 5 nights back:
    // "Tuesday" alone wouldn't say which one, the date does.
    const sunday = new Date(2026, 7, 9, 21, 0);
    expect(sessionDateLabel(at(2026, 7, 4, 20, 14), sunday)).toBe(
      new Intl.DateTimeFormat(undefined, { day: "numeric", month: "long" }).format(at(2026, 7, 4))
    );
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

  it("stamps a night beyond tomorrow with its date, never a Next prefix", () => {
    // "Next Friday" above a past "Tuesday" put two relative weekdays on one
    // screen; ahead of tomorrow the concrete date is the label, weekday kept
    // for any night that isn't the club's Tuesday.
    expect(sessionDateLabel(at(2026, 7, 7), NOW)).toMatch(/^Friday /); // Fri 7 Aug
    expect(sessionDateLabel(at(2026, 7, 10), NOW)).toMatch(/^Monday /); // Mon 10 Aug
  });

  it("gives next club Tuesday the bare date", () => {
    // 11 Aug 2026 is the next Tuesday — the club's normal night, so no weekday.
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

// The home screen's upcoming/past split. Same night semantics as the labels
// above: a night belongs to the evening it started, and "tonight" is upcoming
// until the 04:00 boundary.
describe("partitionSessions", () => {
  it("files tonight under upcoming and yesterday under past", () => {
    const tonight = { createdAt: at(2026, 7, 4, 20) };
    const yesterday = { createdAt: at(2026, 7, 3) };
    const { upcoming, past } = partitionSessions([tonight, yesterday], NOW);
    expect(upcoming).toEqual([tonight]);
    expect(past).toEqual([yesterday]);
  });

  it("counts a daytime session today as upcoming — its night hasn't happened yet", () => {
    const { upcoming } = partitionSessions([{ createdAt: at(2026, 7, 4, 11, 0) }], NOW);
    expect(upcoming).toHaveLength(1);
  });

  it("counts a prepped future night as upcoming", () => {
    const { upcoming, past } = partitionSessions([{ createdAt: at(2026, 7, 11) }], NOW);
    expect(upcoming).toHaveLength(1);
    expect(past).toHaveLength(0);
  });

  it("returns upcoming soonest-first from a newest-first input", () => {
    const nextTuesday = { createdAt: at(2026, 7, 11) };
    const tomorrow = { createdAt: at(2026, 7, 5) };
    const tonight = { createdAt: at(2026, 7, 4, 20) };
    const yesterday = { createdAt: at(2026, 7, 3) };
    const { upcoming, past } = partitionSessions(
      [nextTuesday, tomorrow, tonight, yesterday],
      NOW
    );
    expect(upcoming).toEqual([tonight, tomorrow, nextTuesday]);
    expect(past).toEqual([yesterday]);
  });

  it("files a session with no resolved date under past — it can't claim a future night", () => {
    const { upcoming, past } = partitionSessions([{ createdAt: null }], NOW);
    expect(upcoming).toHaveLength(0);
    expect(past).toHaveLength(1);
  });

  it("keeps a night that runs past midnight upcoming until the 04:00 boundary", () => {
    const running = { createdAt: at(2026, 7, 4, 21, 0) };
    expect(partitionSessions([running], new Date(2026, 7, 5, 0, 30)).upcoming).toEqual([running]);
    expect(partitionSessions([running], new Date(2026, 7, 5, 4, 0)).past).toEqual([running]);
  });

  it("handles an empty list", () => {
    expect(partitionSessions([], NOW)).toEqual({ upcoming: [], past: [] });
  });
});

// The refusal users read when Start is blocked because a night is already
// planned. The date label does the heavy lifting; these pin that the message
// names the right night and always offers the Unlisted way out.
describe("plannedSessionMessage", () => {
  it("names tonight's session", () => {
    const msg = plannedSessionMessage({ createdAt: at(2026, 7, 4, 20) }, NOW);
    expect(msg).toContain("already planned for Tonight");
  });

  it("names a prepped future club Tuesday by its bare date", () => {
    const msg = plannedSessionMessage({ createdAt: at(2026, 7, 11) }, NOW);
    expect(msg).toContain(
      new Intl.DateTimeFormat(undefined, { day: "numeric", month: "long" }).format(at(2026, 7, 11))
    );
  });

  it("keeps the weekday for a future night off the club's Tuesday", () => {
    // 13 August 2026 is a Thursday.
    expect(plannedSessionMessage({ createdAt: at(2026, 7, 13) }, NOW)).toMatch(/Thursday/);
  });

  it("falls back to a generic night when the date is unresolved", () => {
    // Defensive: a null createdAt files under past and can't normally reach
    // here, but a blank in the message would read as a bug.
    expect(plannedSessionMessage({ createdAt: null }, NOW)).toContain(
      "already planned for an upcoming night"
    );
  });

  it("always offers the Unlisted escape hatch", () => {
    for (const createdAt of [at(2026, 7, 4, 20), at(2026, 7, 11), null]) {
      expect(plannedSessionMessage({ createdAt }, NOW)).toMatch(
        /set Visibility to Unlisted to start a private session\.$/
      );
    }
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
