// Row checks for the session doc and saved state (#157). Bad entries are
// skipped, never repaired.

import type { Candidate, Row } from "./types.js";

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/** An object with a string uid; other fields are trusted. */
export function isRow(value: unknown): value is Row {
  return isObject(value) && typeof value.uid === "string";
}

/** Runner-up matches that have an entry to show. */
export function alternativesOf(row: Row): Candidate[] {
  const alternatives: unknown = row.alternatives;
  if (!Array.isArray(alternatives)) return [];
  return alternatives.filter((alt) => isObject(alt) && isObject(alt.entry));
}
