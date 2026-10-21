// Live gig state on a row: played / binned, and WHEN each was set.
//
// `playedAt` / `binnedAt` are ISO-8601 UTC strings, not Firestore Timestamps:
// sync.js compares and copies rows with JSON.stringify (diff / deepCopy) and
// persists them to localStorage, so a Timestamp object would never compare
// equal and would churn the doc on every push. ISO rather than epoch ms so the
// JSON download reads as a date. Rendering goes through Intl at view time
// (sessionTimeLabel), never a stored formatted string.
//
// Un-marking DELETES the key rather than setting undefined: serialize() hands
// the live row object straight to updateDoc, and the Firestore SDK rejects
// undefined values. Deleting also keeps an un-marked row shaped exactly like a
// row that was never marked, which is what every legacy row looks like.
//
// Client clock, like the rest of the app. Rows are whole-row last-write-wins,
// so the time always travels in the same write as the flag it dates.
//
// Pure module, no DOM: exported for ui/tests (the votes.js precedent).

/** Mark played (true) or not played (false). Played and binned are mutually
 * exclusive, so marking played also lifts a bin. */
export function setPlayed(row, played, now = Date.now()) {
  row.played = played;
  if (played) {
    row.playedAt = new Date(now).toISOString();
    setBinned(row, false);
  } else {
    delete row.playedAt;
  }
}

/** Mark binned (true) or restored (false); binning also un-plays. */
export function setBinned(row, binned, now = Date.now()) {
  row.binned = binned;
  if (binned) {
    row.binnedAt = new Date(now).toISOString();
    setPlayed(row, false);
  } else {
    delete row.binnedAt;
  }
}

// A stored playedAt/binnedAt as a Date, or null when absent or malformed.
// Defensive in the readMeta spirit: `rows` is an unvalidated map, and a bad
// value should cost a missing time, not a broken row.
export function stateTime(value) {
  if (typeof value !== "string") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
