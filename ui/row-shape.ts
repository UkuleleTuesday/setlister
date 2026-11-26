// Runtime checks on rows this build didn't just write: the session doc's
// (sync.ts) and this device's saved copy (saved-state.ts). Just enough for the
// app to keep its assumptions. A bad entry is skipped, not repaired, so it
// costs that entry and never the night (#157).

import type { Candidate, Row } from "./types.js";

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/**
 * An object with a string uid. Its other fields are trusted; the readers that
 * would crash on a bad one guard themselves (normalizeText, alternativesOf).
 */
export function isRow(value: unknown): value is Row {
  return isObject(value) && typeof value.uid === "string";
}

/** A row's runner-up matches, keeping only those with an entry to show. */
export function alternativesOf(row: Row): Candidate[] {
  const alternatives: unknown = row.alternatives;
  if (!Array.isArray(alternatives)) return [];
  return alternatives.filter((alt) => isObject(alt) && isObject(alt.entry));
}
