// Room mode's brakes on adding (#88). Two of them, for two different failure
// modes:
//
// - A **confirmation** before a request lands, because a room submitter has no
//   bin and no undo — once a row is in the pool it's in, and it's in for
//   everyone. The full app doesn't need this: an organiser transcribing the
//   board adds in bulk and can bin a mistake.
// - A **cool-down** between one device's requests, so a keen participant can't
//   fill the pool in a minute. #88's "rate over volume" reading: ten requests
//   across an evening is ordinary, ten in ninety seconds is a flood.
//
// Both are client-side and per-device. The only identity the app has is a
// free-text name, so anyone determined clears storage and carries on — which
// is the point #88 makes: the goal is making a flood visible and slightly
// inconvenient, not preventing it. This stops the accidental version.

// Long enough to break up a burst, short enough that nobody sits waiting: a
// request is a thing you have one of, not a thing you do continuously.
export const ROOM_ADD_COOLDOWN_MS = 60_000;

// Its own key, outside setlister.v1, so persist()/restore()'s schema stays
// untouched (the What's-new / room-mode key precedent). Persisted rather than
// held in memory so a reload isn't a way around the wait.
export const LAST_ROOM_ADD_KEY = "setlister.lastRoomAdd.v1";

// Milliseconds left before this device may add again; 0 when it's free to.
export function cooldownRemaining(lastAddAt, now, window = ROOM_ADD_COOLDOWN_MS) {
  if (!lastAddAt) return 0;
  const elapsed = now - lastAddAt;
  // A clock that moved backwards (timezone change, a stored time from the
  // future) would otherwise lock the device out for good — treat anything
  // nonsensical as expired. Failing open is right here: the cost of a missed
  // cool-down is one extra request, the cost of a stuck one is a person who
  // can never request again.
  if (elapsed < 0 || elapsed >= window) return 0;
  return window - elapsed;
}

// "a moment" / "42 seconds" — said out loud in a pub, not counted down.
export function cooldownLabel(ms) {
  const seconds = Math.ceil(ms / 1000);
  return seconds <= 1 ? "a moment" : `${seconds} seconds`;
}

export function readLastRoomAdd() {
  try {
    const stored = Number(localStorage.getItem(LAST_ROOM_ADD_KEY));
    return Number.isFinite(stored) && stored > 0 ? stored : 0;
  } catch {
    return 0; // storage blocked (private mode) — the brake just doesn't apply
  }
}

export function writeLastRoomAdd(when) {
  try {
    localStorage.setItem(LAST_ROOM_ADD_KEY, String(when));
  } catch {
    /* storage blocked — non-fatal */
  }
}
