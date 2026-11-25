// Room mode's add cool-down (#88): the pure timing logic. The decisions under
// test — a fresh device is never blocked, the window expires on time, and a
// nonsensical stored time fails OPEN rather than locking someone out of
// requesting for the rest of the night.
import { describe, expect, it } from "vitest";

import { ROOM_ADD_COOLDOWN_MS, cooldownLabel, cooldownRemaining } from "../room-limits.js";

const NOW = 1_770_000_000_000; // pinned: these are durations, not dates

describe("cooldownRemaining", () => {
  it("never blocks a device that hasn't added anything", () => {
    expect(cooldownRemaining(0, NOW)).toBe(0);
    expect(cooldownRemaining(null, NOW)).toBe(0);
  });

  it("blocks for the remainder of the window after an add", () => {
    expect(cooldownRemaining(NOW, NOW)).toBe(ROOM_ADD_COOLDOWN_MS);
    expect(cooldownRemaining(NOW - 20_000, NOW)).toBe(40_000);
  });

  it("expires exactly at the window's end", () => {
    expect(cooldownRemaining(NOW - ROOM_ADD_COOLDOWN_MS, NOW)).toBe(0);
    expect(cooldownRemaining(NOW - ROOM_ADD_COOLDOWN_MS - 1, NOW)).toBe(0);
  });

  it("fails open on a time from the future, rather than locking the device", () => {
    expect(cooldownRemaining(NOW + 60_000, NOW)).toBe(0);
  });
});

describe("cooldownLabel", () => {
  it("rounds up, so it never promises a wait that hasn't finished", () => {
    expect(cooldownLabel(41_200)).toBe("42 seconds");
    expect(cooldownLabel(2_000)).toBe("2 seconds");
  });

  it("says 'a moment' rather than '1 seconds'", () => {
    expect(cooldownLabel(900)).toBe("a moment");
    expect(cooldownLabel(1_000)).toBe("a moment");
  });
});
