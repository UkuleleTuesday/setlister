// The "What's new" selection logic and — just as importantly — the shape of
// whats-new.json itself. The hygiene suite at the bottom is what makes the
// AGENTS.md convention ("user-visible changes get an entry") mechanical: a bad
// append fails `npm test` before it ships.

import { describe, expect, it } from "vitest";
import { WHATS_NEW, entryDate, latestEntry, whatsNewDateLabel } from "../whats-new.js";

// Tuesday 4 August 2026, 21:00 — same pinned clock as session-index.test.js.
const NOW = new Date(2026, 7, 4, 21, 0);

describe("entryDate", () => {
  it("builds a LOCAL date, not a UTC one", () => {
    // new Date("2026-08-05") would be UTC midnight — i.e. August 4th on a phone
    // west of Greenwich. The whole point of entryDate is that it never is.
    const date = entryDate({ date: "2026-08-05" });
    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(7);
    expect(date.getDate()).toBe(5);
    expect(date.getHours()).toBe(0);
  });

  it("rejects anything that isn't YYYY-MM-DD", () => {
    expect(entryDate({ date: "05/08/2026" })).toBeNull();
    expect(entryDate({ date: "2026-8-5" })).toBeNull();
    expect(entryDate({ date: "" })).toBeNull();
    expect(entryDate({})).toBeNull();
    expect(entryDate(null)).toBeNull();
  });
});

describe("latestEntry", () => {
  it("picks the max date regardless of array order", () => {
    // Newest-first is only a convention; a mis-ordered append must never
    // surface stale news.
    const shuffled = [
      { date: "2026-07-16", items: ["b"] },
      { date: "2026-08-05", items: ["a"] },
      { date: "2026-07-18", items: ["c"] },
    ];
    expect(latestEntry(shuffled).date).toBe("2026-08-05");
  });

  it("is null for an empty changelog", () => {
    expect(latestEntry([])).toBeNull();
  });

  it("skips entries whose date doesn't parse", () => {
    expect(
      latestEntry([
        { date: "not a date", items: ["x"] },
        { date: "2026-07-13", items: ["y"] },
      ]).date
    ).toBe("2026-07-13");
  });

  it("defaults to the real changelog", () => {
    expect(latestEntry()).toBe(latestEntry(WHATS_NEW));
  });
});

describe("whatsNewDateLabel", () => {
  it("renders day and month in the viewer's locale", () => {
    expect(whatsNewDateLabel({ date: "2026-08-05" }, NOW)).toBe(
      new Intl.DateTimeFormat(undefined, { day: "numeric", month: "long" }).format(
        new Date(2026, 7, 5)
      )
    );
  });

  it("adds the year only once it's a different one", () => {
    expect(whatsNewDateLabel({ date: "2026-07-13" }, NOW)).not.toMatch(/2026/);
    expect(whatsNewDateLabel({ date: "2025-12-16" }, NOW)).toMatch(/2025/);
  });

  it("is empty for a malformed entry", () => {
    expect(whatsNewDateLabel({ date: "soon" }, NOW)).toBe("");
  });
});

// The convention, enforced: whats-new.json stays machine-checkable data.
describe("whats-new.json hygiene", () => {
  it("has at least one entry", () => {
    expect(WHATS_NEW.length).toBeGreaterThan(0);
  });

  it("dates are ISO YYYY-MM-DD and parse as real dates", () => {
    for (const entry of WHATS_NEW) {
      expect(entry.date, JSON.stringify(entry)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      const date = entryDate(entry);
      expect(date, entry.date).not.toBeNull();
      // Catches 2026-02-31-style dates, which Date silently rolls over.
      expect(date.getDate()).toBe(Number(entry.date.slice(8, 10)));
    }
  });

  it("every entry has non-empty, user-facing items", () => {
    for (const entry of WHATS_NEW) {
      expect(Array.isArray(entry.items), entry.date).toBe(true);
      expect(entry.items.length, entry.date).toBeGreaterThan(0);
      for (const item of entry.items) {
        expect(typeof item).toBe("string");
        expect(item.trim().length, entry.date).toBeGreaterThan(0);
      }
    }
  });

  it("has no duplicate dates — extend the day's entry instead", () => {
    const dates = WHATS_NEW.map((entry) => entry.date);
    expect(new Set(dates).size).toBe(dates.length);
  });
});
