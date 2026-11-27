import { describe, expect, it } from "vitest";
import {
  dateTile,
  disambiguate,
  fromDateInputValue,
  groupByMonth,
  indexEntryData,
  isPastNight,
  pageTitle,
  partitionSessions,
  pastSessionTitle,
  plannedSessionMessage,
  sessionLongDate,
  sessionDateLabel,
  sessionTimeLabel,
  timestampToDate,
  toDateInputValue,
} from "../session-index.js";

// A club Tuesday, mid-session.
const NOW = new Date(2026, 7, 4, 21, 0);
const at = (y: number, m: number, d: number, h = 20, min = 0) => new Date(y, m, d, h, min);

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
    const started = at(2026, 7, 4, 21, 0);
    const halfPastMidnight = at(2026, 7, 5, 0, 30);
    expect(sessionDateLabel(started, halfPastMidnight)).toBe("Tonight");
    expect(sessionDateLabel(at(2026, 7, 5, 0, 45), halfPastMidnight)).toBe("Tonight");
    expect(sessionDateLabel(started, at(2026, 7, 5, 10, 0))).toBe("Yesterday");
  });

  it("stamps a night beyond yesterday with its date, weekday kept off-Tuesday", () => {
    expect(sessionDateLabel(at(2026, 6, 30), NOW)).toMatch(/^Thursday /);
    expect(sessionDateLabel(at(2026, 6, 29), NOW)).toMatch(/^Wednesday /);
  });

  it("gives a past club Tuesday inside the week the bare date", () => {
    const sunday = new Date(2026, 7, 9, 21, 0);
    expect(sessionDateLabel(at(2026, 7, 4, 20, 14), sunday)).toBe(
      new Intl.DateTimeFormat(undefined, { day: "numeric", month: "long" }).format(at(2026, 7, 4)),
    );
  });

  it("drops to a date once a week has passed", () => {
    // 28 July 2026 is a Tuesday.
    expect(sessionDateLabel(at(2026, 6, 28), NOW)).toBe(
      new Intl.DateTimeFormat(undefined, { day: "numeric", month: "long" }).format(at(2026, 6, 28)),
    );
  });

  it("keeps the weekday for a night that isn't the club's Tuesday", () => {
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
    expect(sessionDateLabel(at(2026, 7, 7), NOW)).toMatch(/^Friday /);
    expect(sessionDateLabel(at(2026, 7, 10), NOW)).toMatch(/^Monday /);
  });

  it("gives next club Tuesday the bare date", () => {
    // 11 August 2026 is a Tuesday.
    expect(sessionDateLabel(at(2026, 7, 11), NOW)).toBe(
      new Intl.DateTimeFormat(undefined, { day: "numeric", month: "long" }).format(at(2026, 7, 11)),
    );
  });

  it("keeps the weekday for a far-future night that isn't a Tuesday", () => {
    expect(sessionDateLabel(at(2026, 7, 13), NOW)).toMatch(/^Thursday /);
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

describe("date input helpers", () => {
  it("renders the LOCAL calendar day, even just after midnight", () => {
    expect(toDateInputValue(new Date(2026, 7, 5, 0, 30))).toBe("2026-08-05");
    expect(toDateInputValue(new Date(2026, 0, 1, 9))).toBe("2026-01-01");
  });

  it("parses to that day's evening in local time", () => {
    const d = fromDateInputValue("2026-08-05")!;
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 7, 5]);
    expect(d.getHours()).toBe(20);
  });

  it("round-trips a picked day", () => {
    expect(toDateInputValue(fromDateInputValue("2026-08-11")!)).toBe("2026-08-11");
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

describe("sessionLongDate", () => {
  it("names the weekday and the full date, never a relative word", () => {
    const label = sessionLongDate(new Date());
    expect(label).not.toMatch(/Tonight|Today/);
    expect(label).toContain(String(new Date().getFullYear()));
  });

  it("is empty for a session whose createdAt hasn't resolved yet", () => {
    expect(sessionLongDate(null)).toBe("");
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
      NOW,
    ).map((e) => e.label);

    expect(labels[0]).toMatch(/^Tonight · /);
    expect(labels[1]).toMatch(/^Tonight · /);
    expect(labels[0]).not.toBe(labels[1]);
    expect(labels[2]).toBe("Yesterday");
  });

  it("ignores a legacy stored name: the date is the label", () => {
    const [entry] = disambiguate([{ name: "Open mic", createdAt: at(2026, 7, 4, 20) }], NOW);
    expect(entry.label).toBe("Tonight");
  });

  it("doesn't suffix when there's no time to suffix with", () => {
    const labels = disambiguate([{ createdAt: null }, { createdAt: null }], NOW).map(
      (e) => e.label,
    );
    expect(labels).toEqual(["", ""]);
  });
});

describe("isPastNight", () => {
  it("keeps tonight live, even after midnight", () => {
    expect(isPastNight(at(2026, 7, 4, 20, 0), NOW)).toBe(false);
    expect(isPastNight(at(2026, 7, 4, 20, 0), new Date(2026, 7, 5, 3, 59))).toBe(false);
  });

  it("calls the night over from 04:00 the next morning", () => {
    expect(isPastNight(at(2026, 7, 4, 20, 0), new Date(2026, 7, 5, 4, 0))).toBe(true);
    expect(isPastNight(at(2026, 6, 28), NOW)).toBe(true);
  });

  it("never calls a planned night or a just-created session past", () => {
    expect(isPastNight(at(2026, 7, 11), NOW)).toBe(false);
    expect(isPastNight(null, NOW)).toBe(false);
  });
});

describe("partitionSessions", () => {
  it("files tonight under upcoming and yesterday under past", () => {
    const tonight = { createdAt: at(2026, 7, 4, 20) };
    const yesterday = { createdAt: at(2026, 7, 3) };
    const { upcoming, past } = partitionSessions([tonight, yesterday], NOW);
    expect(upcoming).toEqual([tonight]);
    expect(past).toEqual([yesterday]);
  });

  it("counts a daytime session today as upcoming", () => {
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
    const { upcoming, past } = partitionSessions([nextTuesday, tomorrow, tonight, yesterday], NOW);
    expect(upcoming).toEqual([tonight, tomorrow, nextTuesday]);
    expect(past).toEqual([yesterday]);
  });

  it("files a session with no resolved date under past", () => {
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

describe("plannedSessionMessage", () => {
  it("names tonight's session", () => {
    const msg = plannedSessionMessage({ createdAt: at(2026, 7, 4, 20) }, NOW);
    expect(msg).toContain("already planned for Tonight");
  });

  it("names a prepped future club Tuesday by its bare date", () => {
    const msg = plannedSessionMessage({ createdAt: at(2026, 7, 11) }, NOW);
    expect(msg).toContain(
      new Intl.DateTimeFormat(undefined, { day: "numeric", month: "long" }).format(at(2026, 7, 11)),
    );
  });

  it("keeps the weekday for a future night off the club's Tuesday", () => {
    expect(plannedSessionMessage({ createdAt: at(2026, 7, 13) }, NOW)).toMatch(/Thursday/);
  });

  it("falls back to a generic night when the date is unresolved", () => {
    expect(plannedSessionMessage({ createdAt: null }, NOW)).toContain(
      "already planned for an upcoming night",
    );
  });

  it("offers the Unlisted escape hatch only while the feature is on", () => {
    for (const createdAt of [at(2026, 7, 4, 20), at(2026, 7, 11), null]) {
      expect(plannedSessionMessage({ createdAt }, NOW, true)).toMatch(
        /set Visibility to Unlisted to start a private session\.$/,
      );
      expect(plannedSessionMessage({ createdAt }, NOW, false)).toMatch(
        /Open it from the home screen\.$/,
      );
    }
  });
});

describe("indexEntryData", () => {
  const SERVER_STAMP = Symbol("serverTimestamp");
  const fx = {
    serverTimestamp: () => SERVER_STAMP,
    Timestamp: { fromDate: (d: Date) => ({ wrapped: d }) },
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

describe("timestampToDate", () => {
  it("reads anything with toDate() as a Date", () => {
    const d = at(2026, 7, 4);
    expect(timestampToDate({ toDate: () => d })).toBe(d);
  });

  it("reads a pending serverTimestamp (null) or a non-Timestamp as null", () => {
    expect(timestampToDate(null)).toBeNull();
    expect(timestampToDate(undefined)).toBeNull();
    expect(timestampToDate("2026-08-04")).toBeNull();
    expect(timestampToDate({ toDate: "nope" })).toBeNull();
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

describe("pastSessionTitle", () => {
  it("counts days for the first week, from the night not the clock", () => {
    expect(pastSessionTitle(at(2026, 7, 3), NOW)).toBe("Yesterday");
    expect(pastSessionTitle(at(2026, 7, 1), NOW)).toBe("3 days ago");
    // 23:59 the day before is still last night at 04:30.
    expect(pastSessionTitle(at(2026, 7, 3, 23, 59), new Date(2026, 7, 4, 4, 30))).toBe("Yesterday");
  });

  it("counts weeks up to eight", () => {
    expect(pastSessionTitle(at(2026, 6, 28), NOW)).toBe("Last week");
    expect(pastSessionTitle(at(2026, 6, 21), NOW)).toBe("2 weeks ago");
    expect(pastSessionTitle(at(2026, 5, 16), NOW)).toBe("7 weeks ago");
  });

  it("then gives the date", () => {
    expect(pastSessionTitle(at(2026, 5, 9), NOW)).toBe(sessionDateLabel(at(2026, 5, 9), NOW));
    expect(pastSessionTitle(at(2025, 7, 4), NOW)).toBe(sessionDateLabel(at(2025, 7, 4), NOW));
  });
});

describe("dateTile", () => {
  it("gives the short weekday and the day of the month", () => {
    expect(dateTile(at(2026, 7, 4))).toEqual({
      weekday: new Intl.DateTimeFormat(undefined, { weekday: "short" }).format(at(2026, 7, 4)),
      day: "4",
    });
  });
});

describe("groupByMonth", () => {
  const month = (d: Date) => new Intl.DateTimeFormat(undefined, { month: "long" }).format(d);

  it("runs same-month sessions together, newest first as given", () => {
    const groups = groupByMonth(
      [
        { createdAt: at(2026, 7, 4) },
        { createdAt: at(2026, 6, 28) },
        { createdAt: at(2026, 6, 21) },
      ],
      NOW,
    );
    expect(groups.map((g) => [g.label, g.entries.length])).toEqual([
      [month(at(2026, 7, 4)), 1],
      [month(at(2026, 6, 28)), 2],
    ]);
  });

  it("files a session past midnight under its night's month", () => {
    const groups = groupByMonth([{ createdAt: new Date(2026, 7, 1, 0, 30) }], NOW);
    expect(groups[0].label).toBe(month(at(2026, 6, 31)));
  });

  it("names the year only when it isn't this one", () => {
    const [group] = groupByMonth([{ createdAt: at(2025, 11, 30) }], NOW);
    expect(group.label).toContain("2025");
  });

  it("gives a pending timestamp an unlabelled group", () => {
    expect(groupByMonth([{ createdAt: null }], NOW)).toEqual([
      { label: "", entries: [{ createdAt: null }] },
    ]);
  });
});
