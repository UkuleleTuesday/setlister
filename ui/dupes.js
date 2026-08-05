// Duplicate-request detection (#52).
//
// The same song can arrive twice — a re-scan of the board, a manual add on top
// of a scan, two people writing it up — and with confident scan rows skipping
// review (#80) there is no human checkpoint left to catch it. These helpers
// answer "is this song already on the night's lists?" so the add paths in
// app.js can skip or flag the copy instead of silently doubling it.
//
// Identity: a catalogue match's server-minted `id` (a slug of its display
// string — stable within an edition) when present, else the normalized
// display/raw title, so legacy rows and unmatched rows still compare.
//
// What counts as "already there" (decided in #52): rows sitting in Up next or
// Requests, and PLAYED rows (re-requesting tonight's tune is #81's no). BINNED
// rows don't block — binning meant "not this one", and a fresh, genuine
// request later deserves a fresh row.
//
// Pure module, no DOM: exported for ui/tests (same precedent as sync.js).

/**
 * Accent-insensitive lowercase form, mirroring the backend's matcher.py — so
 * "sara" equals "Sarà" here just like it does in search.
 */
export function normalizeText(s) {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/** Identity of a catalogue entry (a combobox pick or a row's match). */
export function matchKey(entry) {
  return entry.id || normalizeText(entry.display || "");
}

/** Identity of a list row: its match if it has one, else what was written. */
export function rowKey(row) {
  return row.match ? matchKey(row.match) : normalizeText(row.raw_title || "");
}

/**
 * First non-binned row in either list with the same identity, or null.
 * Returns { where, row } with `where` one of "played" | "upnext" | "requests";
 * a played row reports as "played" whichever array it lives in (older clients
 * could sync a played row into Requests).
 */
export function findDuplicate(upNext, requests, key) {
  if (!key) return null;
  for (const [list, where] of [
    [upNext, "upnext"],
    [requests, "requests"],
  ]) {
    for (const row of list) {
      if (row.binned || rowKey(row) !== key) continue;
      return { where: row.played ? "played" : where, row };
    }
  }
  return null;
}

/** The user-facing wording for each kind of existing copy. */
export function duplicateLabel(where) {
  return {
    played: "Already played tonight",
    upnext: "Already in Up next",
    requests: "Already in Requests",
  }[where];
}
