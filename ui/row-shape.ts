// Bad entries are skipped, never repaired (#157).

import type { Candidate, Row } from "./types.js";

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/** Only the uid is checked; other fields are trusted. */
export function isRow(value: unknown): value is Row {
  return isObject(value) && typeof value.uid === "string";
}

export function alternativesOf(row: Row): Candidate[] {
  const alternatives: unknown = row.alternatives;
  if (!Array.isArray(alternatives)) return [];
  return alternatives.filter((alt) => isObject(alt) && isObject(alt.entry));
}
