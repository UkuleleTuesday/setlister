// One-time name amnesty: the names saved in the full app drifted into jokes,
// so this build clears every device's typed name ONCE and asks for a real one
// via a sheet on the next full-app open. Names are per-device (localStorage +
// presence heartbeats — see presence.js), so "reset for everyone" can only
// ship as client code each device runs for itself.
//
// Room devices are left alone: the amnesty is aimed at the full (admin) view,
// and a room phone's name rides on its requests, asked for in its own sheet.
// The done flag isn't stored in room mode either, so a device later handed the
// ?mode=full link still gets its amnesty.
//
// Pure decision logic + the sheet's copy live here (DOM-free, the testable
// seam, like view-mode.js); app.js owns the sheet. The copy is exported so
// tests pin the wording, same as plannedSessionMessage in session-index.js.

// Its own localStorage key, outside setlister.v1, so persist()/restore()'s
// schema stays untouched (the ROOM_MODE_KEY precedent).
export const NAME_RESET_KEY = "setlister.nameReset.v1";

// The amnesty round the flag records. Bump to run another reset on every
// device — no other state to migrate.
export const NAME_RESET_ROUND = "1";

export const NAME_RESET_MESSAGE =
  "Everyone's saved name has been reset. Put your real name here so the club " +
  "knows who queued what. Every time someone puts in a fake name, a puppy dies.";

// What this device should do at boot. `done` is whether the flag already
// records this round; `hasSavedState` gates the sheet to devices that have
// actually used the app — a first-ever visitor has no name to reset and
// shouldn't be greeted with news about one (they get the flag silently, so
// the sheet can never bother them later).
export function resolveNameReset({ mode, done, hasSavedState }) {
  if (mode !== "full" || done) return { clearName: false, showSheet: false, markDone: false };
  if (!hasSavedState) return { clearName: false, showSheet: false, markDone: true };
  return { clearName: true, showSheet: true, markDone: true };
}

// Thin storage wrappers, forgiving like view-mode.js's. Blocked storage reads
// as done: in private mode nothing persists anyway, and re-running the
// amnesty (sheet included) on every visit would be hostile.
export function readNameResetDone() {
  try {
    return localStorage.getItem(NAME_RESET_KEY) === NAME_RESET_ROUND;
  } catch {
    return true;
  }
}

export function writeNameResetDone() {
  try {
    localStorage.setItem(NAME_RESET_KEY, NAME_RESET_ROUND);
  } catch {
    /* storage blocked — non-fatal */
  }
}
