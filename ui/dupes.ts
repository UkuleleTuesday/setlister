// Binned copies never count: binning means "not this one", and a later genuine
// request deserves a fresh row.

import type { CatalogueEntry, Row } from "./types.js";

export type DuplicateWhere = "played" | "upnext" | "requests";

export interface Duplicate {
  where: DuplicateWhere;
  row: Row;
}

// Mirrors matcher.py, so "sara" equals "Sarà" here as it does in search.
// Coerced: synced titles aren't type-checked.
export function normalizeText(s: unknown): string {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

// Partial: legacy rows embed matches from before entries had ids.
export function matchKey(entry: Partial<Pick<CatalogueEntry, "id" | "display">>): string {
  return entry.id || normalizeText(entry.display || "");
}

export function rowKey(row: Pick<Row, "match" | "raw_title">): string {
  return row.match ? matchKey(row.match) : normalizeText(row.raw_title || "");
}

// "played" wherever the row sits: older clients could sync a played row into
// Requests.
export function findDuplicate(upNext: Row[], requests: Row[], key: string): Duplicate | null {
  if (!key) return null;
  for (const [list, where] of [
    [upNext, "upnext"],
    [requests, "requests"],
  ] as const) {
    for (const row of list) {
      if (row.binned || rowKey(row) !== key) continue;
      return { where: row.played ? "played" : where, row };
    }
  }
  return null;
}

// findDuplicate() for every key in one pass, for tagging a whole songbook.
export function indexTonight(upNext: Row[], requests: Row[]): Map<string, Duplicate> {
  const index = new Map<string, Duplicate>();
  for (const [list, where] of [
    [upNext, "upnext"],
    [requests, "requests"],
  ] as const) {
    for (const row of list) {
      const key = rowKey(row);
      if (row.binned || !key || index.has(key)) continue;
      index.set(key, { where: row.played ? "played" : where, row });
    }
  }
  return index;
}

export function duplicateLabel(where: DuplicateWhere): string {
  return {
    played: "Already played tonight",
    upnext: "Already in Up next",
    requests: "Already in Requests",
  }[where];
}
