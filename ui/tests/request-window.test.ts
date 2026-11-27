import { describe, expect, it } from "vitest";
import {
  defaultClosesAt,
  defaultOpensAt,
  defaultWindowLabel,
  effectiveRequestsOpen,
  fromDateTimeInputValue,
  isWithinWindow,
  linkState,
  linkStateText,
  minutesUntilOpen,
  openingSoonLabel,
  openingSoonNote,
  requestsClosedNote,
  resolveWindow,
  roomNote,
  roomWindowText,
  scheduleLabel,
  switchHelp,
  toDateTimeInputValue,
  windowChipText,
  windowStatus,
} from "../request-window.js";

const at = (y: number, m: number, d: number, h = 20, min = 0) => new Date(y, m, d, h, min);

describe("defaultOpensAt", () => {
  it("is exactly 30 minutes before the session's start", () => {
    expect(defaultOpensAt(at(2026, 7, 4, 20, 0))).toEqual(at(2026, 7, 4, 19, 30));
  });
});

describe("defaultClosesAt", () => {
  it("closes at 22:30 the same evening an evening session starts", () => {
    expect(defaultClosesAt(at(2026, 7, 4, 20, 0))).toEqual(at(2026, 7, 4, 22, 30));
  });

  it("falls back to 04:00 next morning for a session starting after 22:30", () => {
    expect(defaultClosesAt(at(2026, 7, 4, 23, 47))).toEqual(at(2026, 7, 5, 4, 0));
  });

  it("falls back too when the 30-minute lead would open it at or after 22:30", () => {
    expect(defaultClosesAt(at(2026, 7, 4, 23, 0))).toEqual(at(2026, 7, 5, 4, 0));
  });

  it("attributes a session created just after midnight to the PREVIOUS night", () => {
    expect(defaultClosesAt(at(2026, 7, 5, 1, 15))).toEqual(at(2026, 7, 5, 4, 0));
  });
});

describe("resolveWindow", () => {
  const created = at(2026, 7, 4, 20, 0);

  it("uses both smart defaults when neither boundary is overridden", () => {
    const window = resolveWindow({ sessionCreatedAt: created });
    expect(window).toEqual({
      opensAt: defaultOpensAt(created),
      closesAt: defaultClosesAt(created),
    });
  });

  it("overrides only the open boundary, leaving close at its default", () => {
    const opensAtOverride = at(2026, 7, 4, 18, 0);
    const window = resolveWindow({ sessionCreatedAt: created, opensAtOverride })!;
    expect(window.opensAt).toEqual(opensAtOverride);
    expect(window.closesAt).toEqual(defaultClosesAt(created));
  });

  it("overrides only the close boundary, leaving open at its default", () => {
    const closesAtOverride = at(2026, 7, 5, 1, 0);
    const window = resolveWindow({ sessionCreatedAt: created, closesAtOverride })!;
    expect(window.opensAt).toEqual(defaultOpensAt(created));
    expect(window.closesAt).toEqual(closesAtOverride);
  });

  it("overrides both boundaries independently", () => {
    const opensAtOverride = at(2026, 7, 4, 18, 0);
    const closesAtOverride = at(2026, 7, 5, 1, 0);
    expect(resolveWindow({ sessionCreatedAt: created, opensAtOverride, closesAtOverride })).toEqual(
      {
        opensAt: opensAtOverride,
        closesAt: closesAtOverride,
      },
    );
  });

  it("fails OPEN (returns null) when close is at or before open", () => {
    expect(
      resolveWindow({
        sessionCreatedAt: created,
        opensAtOverride: at(2026, 7, 5, 2, 0),
        closesAtOverride: at(2026, 7, 5, 2, 0),
      }),
    ).toBeNull();
    expect(
      resolveWindow({
        sessionCreatedAt: created,
        opensAtOverride: at(2026, 7, 5, 2, 0),
        closesAtOverride: at(2026, 7, 5, 1, 0),
      }),
    ).toBeNull();
  });

  it("returns null when there's no createdAt to anchor a default to", () => {
    expect(resolveWindow({ sessionCreatedAt: null })).toBeNull();
  });
});

describe("isWithinWindow", () => {
  const window = { opensAt: at(2026, 7, 4, 19, 30), closesAt: at(2026, 7, 5, 4, 0) };

  it("is unrestricted when there's no window", () => {
    expect(isWithinWindow(null, at(2026, 0, 1))).toBe(true);
  });

  it("includes the open instant", () => {
    expect(isWithinWindow(window, window.opensAt)).toBe(true);
  });

  it("excludes the close instant", () => {
    expect(isWithinWindow(window, window.closesAt)).toBe(false);
  });

  it("is false just before open and true just after", () => {
    expect(isWithinWindow(window, new Date(window.opensAt.getTime() - 1))).toBe(false);
    expect(isWithinWindow(window, new Date(window.opensAt.getTime() + 1))).toBe(true);
  });
});

describe("effectiveRequestsOpen", () => {
  const window = { opensAt: at(2026, 7, 4, 19, 30), closesAt: at(2026, 7, 5, 4, 0) };
  const outsideWindow = at(2026, 7, 4, 10, 0);
  const insideWindow = at(2026, 7, 4, 21, 0);

  it("forced open ignores the window entirely", () => {
    expect(effectiveRequestsOpen({ mode: true, window, now: outsideWindow })).toBe(true);
  });

  it("forced closed ignores the window entirely", () => {
    expect(effectiveRequestsOpen({ mode: false, window, now: insideWindow })).toBe(false);
  });

  it("auto (null) matches isWithinWindow", () => {
    expect(effectiveRequestsOpen({ mode: null, window, now: insideWindow })).toBe(true);
    expect(effectiveRequestsOpen({ mode: null, window, now: outsideWindow })).toBe(false);
  });
});

describe("windowStatus", () => {
  const window = { opensAt: at(2026, 7, 4, 19, 30), closesAt: at(2026, 7, 5, 4, 0) };

  it("names the closing time while an auto window is open", () => {
    expect(windowStatus({ mode: null, window, now: at(2026, 7, 4, 21, 0) })).toEqual({
      state: "open",
      at: window.closesAt,
    });
  });

  it("names the opening time before an auto window opens", () => {
    expect(windowStatus({ mode: null, window, now: at(2026, 7, 4, 18, 0) })).toEqual({
      state: "later",
      at: window.opensAt,
    });
  });

  it("is closed once an auto window has passed", () => {
    expect(windowStatus({ mode: null, window, now: at(2026, 7, 5, 5, 0) })).toEqual({
      state: "closed",
      at: null,
    });
  });

  it("follows a forced switch with no time to name", () => {
    const now = at(2026, 7, 4, 18, 0);
    expect(windowStatus({ mode: true, window, now })).toEqual({ state: "open", at: null });
    expect(windowStatus({ mode: false, window, now })).toEqual({ state: "closed", at: null });
  });

  it("is open with no end when there is no window", () => {
    expect(windowStatus({ mode: null, window: null, now: at(2026, 7, 4) })).toEqual({
      state: "open",
      at: null,
    });
  });
});

describe("minutesUntilOpen", () => {
  const opensAt = at(2026, 7, 4, 20, 0);
  const window = { opensAt, closesAt: at(2026, 7, 5, 4, 0) };

  it("is null once the window is already open", () => {
    expect(minutesUntilOpen(window, opensAt)).toBeNull();
    expect(minutesUntilOpen(window, new Date(opensAt.getTime() + 1))).toBeNull();
  });

  it("is null more than 30 minutes before open", () => {
    expect(minutesUntilOpen(window, new Date(opensAt.getTime() - 31 * 60_000))).toBeNull();
  });

  it("is null when there's no window at all", () => {
    expect(minutesUntilOpen(null, at(2026, 0, 1))).toBeNull();
  });

  it("rounds up to whole minutes, right at the 30-minute edge", () => {
    expect(minutesUntilOpen(window, new Date(opensAt.getTime() - 30 * 60_000))).toBe(30);
    expect(minutesUntilOpen(window, new Date(opensAt.getTime() - 29 * 60_000 - 59_000))).toBe(30);
  });

  it("gives the exact count a minute out", () => {
    expect(minutesUntilOpen(window, new Date(opensAt.getTime() - 60_000))).toBe(1);
  });
});

describe("openingSoonLabel", () => {
  it("says 'a minute' rather than '1 minutes'", () => {
    expect(openingSoonLabel(1)).toBe("a minute");
  });

  it("otherwise counts", () => {
    expect(openingSoonLabel(2)).toBe("2 minutes");
    expect(openingSoonLabel(30)).toBe("30 minutes");
  });
});

describe("defaultWindowLabel", () => {
  it("names both boundaries", () => {
    const label = defaultWindowLabel(at(2026, 7, 4, 20, 0));
    expect(label).toMatch(/^Requests open .+ to .+$/);
  });
});

describe("datetime-local input helpers", () => {
  it("renders the local date and time", () => {
    expect(toDateTimeInputValue(at(2026, 7, 5, 0, 30))).toBe("2026-08-05T00:30");
    expect(toDateTimeInputValue(at(2026, 0, 1, 9, 5))).toBe("2026-01-01T09:05");
  });

  it("round-trips a picked value", () => {
    expect(toDateTimeInputValue(fromDateTimeInputValue("2026-08-11T19:30")!)).toBe(
      "2026-08-11T19:30",
    );
  });

  it("treats a cleared or malformed picker as no value", () => {
    expect(fromDateTimeInputValue("")).toBeNull();
    expect(fromDateTimeInputValue(null)).toBeNull();
    expect(fromDateTimeInputValue("2026-8-5T09:00")).toBeNull();
    expect(fromDateTimeInputValue("2026-08-05")).toBeNull();
  });
});

describe("requestsClosedNote", () => {
  const opens = at(2026, 11, 8, 19, 30);
  const later = { state: "later" as const, at: opens };
  const time = (d: Date) => d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

  it("says when requests open, not that the night is over", () => {
    expect(requestsClosedNote(later, at(2026, 11, 8, 12))).toBe(`Requests open at ${time(opens)}.`);
    expect(requestsClosedNote(later, at(2026, 11, 7, 12))).toBe(
      `Requests open tomorrow at ${time(opens)}.`,
    );
    const weekday = opens.toLocaleDateString(undefined, { weekday: "long" });
    expect(requestsClosedNote(later, at(2026, 11, 5, 12))).toBe(
      `Requests open ${weekday} at ${time(opens)}.`,
    );
    const date = opens.toLocaleDateString(undefined, { day: "numeric", month: "long" });
    expect(requestsClosedNote(later, at(2026, 10, 27, 12))).toBe(
      `Requests open on ${date} at ${time(opens)}.`,
    );
  });

  it("keeps the whiteboard line once requests are shut for the night", () => {
    const closed = { state: "closed" as const, at: null };
    expect(requestsClosedNote(closed, at(2026, 11, 8, 23))).toMatch(
      /^Requests are closed here for tonight\./,
    );
  });
});

describe("linkState and its wording", () => {
  // Auto window: 19:30 to 22:30.
  const created = at(2026, 7, 4, 20);
  const auto = { requestsOpen: null, requestsOpensAt: null, requestsClosesAt: null };

  it("follows the window in auto mode", () => {
    const now = at(2026, 7, 4, 21);
    const link = linkState(auto, created, now);
    expect(link.open).toBe(true);
    expect(link.soonMinutes).toBeNull();
    expect(link.status.state).toBe("open");
    expect(windowChipText(link.status, now)).toMatch(/^Request link open until /);
    expect(linkStateText(link.status, now)).toMatch(/^Open until /);
    expect(roomWindowText(link.status)).toMatch(/^Requests open until /);
    expect(switchHelp(null, link, now)).toMatch(/^On schedule, closes at /);
    expect(roomNote(link.open)).toMatch(/^People on the link can add tunes/);
  });

  it("counts down only in auto mode, inside the notice period", () => {
    const now = at(2026, 7, 4, 19, 18);
    const soon = linkState(auto, created, now);
    expect(soon.open).toBe(false);
    expect(soon.soonMinutes).toBe(12);
    expect(soon.status.state).toBe("later");
    expect(windowChipText(soon.status, now)).toMatch(/^Request link opens at /);
    expect(linkStateText(soon.status, now)).toMatch(/^Opens at /);
    expect(switchHelp(null, soon, now)).toMatch(/^On schedule, opens at /);
    expect(roomNote(soon.open)).toMatch(/^View only:/);
    expect(openingSoonNote(12)).toBe(
      "Requests open in 12 minutes. Pop your tune on the whiteboard of wishes for now.",
    );
    const forced = linkState({ ...auto, requestsOpen: false }, created, at(2026, 7, 4, 19, 18));
    expect(forced.soonMinutes).toBeNull();
  });

  it("lets a forced mode win, with fixed wording", () => {
    const closed = linkState({ ...auto, requestsOpen: false }, created, at(2026, 7, 4, 21));
    expect(closed.open).toBe(false);
    expect(windowChipText(closed.status, created)).toBe("Request link is view only");
    expect(linkStateText(closed.status, created)).toBe("View only");
    expect(switchHelp(false, closed, created)).toBe("Set by hand");
    const open = linkState({ ...auto, requestsOpen: true }, created, at(2026, 7, 5, 6));
    expect(open.open).toBe(true);
    expect(windowChipText(open.status, created)).toBe("Request link open");
    expect(roomWindowText(open.status)).toBe("Requests open");
    expect(switchHelp(true, open, created)).toBe("Set by hand");
  });

  it("reads a session with no date yet as open, with no window", () => {
    const link = linkState(auto, null, at(2026, 7, 4, 21));
    expect(link).toMatchObject({ open: true, window: null, soonMinutes: null });
    expect(switchHelp(null, link, created)).toBe("On schedule");
    expect(scheduleLabel(link.window, created)).toBe("");
  });

  it("names the day when the link opens on another one (#241)", () => {
    const opens = at(2026, 7, 4, 19, 30);
    const time = opens.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
    const weekday = opens.toLocaleDateString(undefined, { weekday: "short" });
    const date = opens.toLocaleDateString(undefined, { day: "numeric", month: "short" });
    const cases: [Date, string][] = [
      [at(2026, 7, 4, 12), `at ${time}`],
      [at(2026, 7, 3, 12), `tomorrow at ${time}`],
      [at(2026, 7, 1, 12), `${weekday} at ${time}`],
      [at(2026, 6, 20, 12), `${date} at ${time}`],
    ];
    for (const [now, when] of cases) {
      const link = linkState(auto, created, now);
      expect(windowChipText(link.status, now)).toBe(`Request link opens ${when}`);
      expect(linkStateText(link.status, now)).toBe(`Opens ${when}`);
      expect(switchHelp(null, link, now)).toBe(`On schedule, opens ${when}`);
    }
    expect(
      scheduleLabel(linkState(auto, created, at(2026, 7, 1, 12)).window, at(2026, 7, 1, 12)),
    ).toMatch(new RegExp(`^${weekday}, `));
  });

  it("says when the schedule closed the link, and spells the schedule out", () => {
    const after = linkState(auto, created, at(2026, 7, 4, 23));
    expect(after.open).toBe(false);
    expect(switchHelp(null, after, created)).toMatch(/^On schedule, closed at /);
    expect(scheduleLabel(after.window, created)).toMatch(/^\S+ \S+ to /);
  });
});
