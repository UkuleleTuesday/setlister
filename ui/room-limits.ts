// Room mode's brake on adding (#88): a **cool-down** between one device's
// requests, so a keen participant can't fill the pool in a minute. #88's "rate
// over volume" reading: ten requests across an evening is ordinary, ten in
// ninety seconds is a flood.
//
// Client-side and per-device. The only identity the app has is a free-text
// name, so anyone determined clears storage and carries on, which is #88's
// point: make a flood visible and slightly inconvenient, not impossible. This
// stops the accidental version.

// Long enough to break up a burst, short enough that nobody sits waiting: a
// request is a thing you have one of, not a thing you do continuously.
export const ROOM_ADD_COOLDOWN_MS = 60_000;

// Its own key, outside setlister.v1 (the saved night, saved-state.ts), like
// the other per-device flags. Persisted rather than held in memory so a
// reload isn't a way around the wait.
const LAST_ROOM_ADD_KEY = "setlister.lastRoomAdd.v1";

// Milliseconds left before this device may add again; 0 when it's free to.
export function cooldownRemaining(
  lastAddAt: number | null | undefined,
  now: number,
  window = ROOM_ADD_COOLDOWN_MS,
): number {
  if (!lastAddAt) return 0;
  const elapsed = now - lastAddAt;
  // A clock that moved backwards (timezone change, a stored time from the
  // future) would otherwise lock the device out for good, so anything
  // nonsensical counts as expired. Failing open is right here: a missed
  // cool-down costs one extra request, a stuck one a person who can never
  // request again.
  if (elapsed < 0 || elapsed >= window) return 0;
  return window - elapsed;
}

// "a moment" / "42 seconds": said out loud in a pub, not counted down.
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
