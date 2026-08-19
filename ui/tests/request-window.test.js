// The request window's pure decision logic (#NEW) — no Firestore, no DOM.
//
// Every branch here is relative to "now" or to a session's own createdAt, so
// every test pins the clock explicitly, same discipline as
// session-index.test.js: a test that reads the wall clock here is a test that
// fails at midnight.

import { describe, expect, it } from "vitest";
import {
  defaultClosesAt,
  defaultOpensAt,
  defaultWindowLabel,
  effectiveRequestsOpen,
  fromDateTimeInputValue,
  isWithinWindow,
  minutesUntilOpen,
  openingSoonLabel,
  resolveWindow,
  toDateTimeInputValue,
} from "../request-window.js";

const at = (y, m, d, h = 20, min = 0) => new Date(y, m, d, h, min);

describe("defaultOpensAt", () => {
  it("is exactly 30 minutes before the session's start", () => {
    expect(defaultOpensAt(at(2026, 7, 4, 20, 0))).toEqual(at(2026, 7, 4, 19, 30));
  });
});

describe("defaultClosesAt", () => {
  it("closes at 04:00 the day after an evening session starts", () => {
    expect(defaultClosesAt(at(2026, 7, 4, 20, 0))).toEqual(at(2026, 7, 5, 4, 0));
  });

  it("closes at the same 04:00 for a session server-stamped late in the night", () => {
    expect(defaultClosesAt(at(2026, 7, 4, 23, 47))).toEqual(at(2026, 7, 5, 4, 0));
  });

  it("attributes a session created just after midnight to the PREVIOUS night", () => {
    // 01:15 still belongs to the night that started the evening before (see
    // startOfNight in session-index.js) — the close time must match what a
    // 20:00 start the previous evening would produce, not roll forward a
    // whole extra day.
    expect(defaultClosesAt(at(2026, 7, 5, 1, 15))).toEqual(
      defaultClosesAt(at(2026, 7, 4, 20, 0))
    );
  });
});

describe("resolveWindow", () => {
  const created = at(2026, 7, 4, 20, 0);

  it("uses both smart defaults when neither boundary is overridden", () => {
    const window = resolveWindow({ sessionCreatedAt: created });
    expect(window).toEqual({ opensAt: defaultOpensAt(created), closesAt: defaultClosesAt(created) });
  });

  it("overrides only the open boundary, leaving close at its default", () => {
    const opensAtOverride = at(2026, 7, 4, 18, 0);
    const window = resolveWindow({ sessionCreatedAt: created, opensAtOverride });
    expect(window.opensAt).toEqual(opensAtOverride);
    expect(window.closesAt).toEqual(defaultClosesAt(created));
  });

  it("overrides only the close boundary, leaving open at its default", () => {
    const closesAtOverride = at(2026, 7, 5, 1, 0);
    const window = resolveWindow({ sessionCreatedAt: created, closesAtOverride });
    expect(window.opensAt).toEqual(defaultOpensAt(created));
    expect(window.closesAt).toEqual(closesAtOverride);
  });

  it("overrides both boundaries independently", () => {
    const opensAtOverride = at(2026, 7, 4, 18, 0);
    const closesAtOverride = at(2026, 7, 5, 1, 0);
    expect(resolveWindow({ sessionCreatedAt: created, opensAtOverride, closesAtOverride })).toEqual({
      opensAt: opensAtOverride,
      closesAt: closesAtOverride,
    });
  });

  it("fails OPEN (returns null) when close is at or before open", () => {
    expect(
      resolveWindow({
        sessionCreatedAt: created,
        opensAtOverride: at(2026, 7, 5, 2, 0),
        closesAtOverride: at(2026, 7, 5, 2, 0),
      })
    ).toBeNull();
    expect(
      resolveWindow({
        sessionCreatedAt: created,
        opensAtOverride: at(2026, 7, 5, 2, 0),
        closesAtOverride: at(2026, 7, 5, 1, 0),
      })
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

// The <input type="datetime-local"> bridge — local time only, same footgun
// toDateInputValue/fromDateInputValue in session-index.js already dodge.
describe("datetime-local input helpers", () => {
  it("renders the local date and time", () => {
    expect(toDateTimeInputValue(at(2026, 7, 5, 0, 30))).toBe("2026-08-05T00:30");
    expect(toDateTimeInputValue(at(2026, 0, 1, 9, 5))).toBe("2026-01-01T09:05");
  });

  it("round-trips a picked value", () => {
    expect(toDateTimeInputValue(fromDateTimeInputValue("2026-08-11T19:30"))).toBe(
      "2026-08-11T19:30"
    );
  });

  it("treats a cleared or malformed picker as no value", () => {
    expect(fromDateTimeInputValue("")).toBeNull();
    expect(fromDateTimeInputValue(null)).toBeNull();
    expect(fromDateTimeInputValue("2026-8-5T09:00")).toBeNull();
    expect(fromDateTimeInputValue("2026-08-05")).toBeNull();
  });
});
