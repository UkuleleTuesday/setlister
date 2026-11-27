// Per-device, client-side: with only a free-text name for identity, the aim is
// a flood made inconvenient, not impossible (#88).

// Breaks up a burst without anyone sitting waiting.
export const ROOM_ADD_COOLDOWN_MS = 60_000;

// Persisted so a reload isn't a way around the wait.
const LAST_ROOM_ADD_KEY = "setlister.lastRoomAdd.v1";

export function cooldownRemaining(
  lastAddAt: number | null | undefined,
  now: number,
  window = ROOM_ADD_COOLDOWN_MS,
): number {
  if (!lastAddAt) return 0;
  const elapsed = now - lastAddAt;
  // Fail open on a clock that moved backwards: a missed cool-down costs one
  // extra request, a stuck one locks a person out for good.
  if (elapsed < 0 || elapsed >= window) return 0;
  return window - elapsed;
}

export function cooldownLabel(ms: number): string {
  const seconds = Math.ceil(ms / 1000);
  return seconds <= 1 ? "a moment" : `${seconds} seconds`;
}

export function readLastRoomAdd(): number {
  try {
    const stored = Number(localStorage.getItem(LAST_ROOM_ADD_KEY));
    return Number.isFinite(stored) && stored > 0 ? stored : 0;
  } catch {
    return 0; // storage blocked (private mode): the brake doesn't apply
  }
}

export function writeLastRoomAdd(when: number): void {
  try {
    localStorage.setItem(LAST_ROOM_ADD_KEY, String(when));
  } catch {
    /* storage blocked: non-fatal */
  }
}
