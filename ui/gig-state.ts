// Times are ISO strings, not Timestamps: sync.ts diffs rows by JSON.stringify,
// so a Timestamp would churn the doc on every push. ISO, not epoch ms, so the
// JSON download reads as a date.
//
// Un-marking deletes the key: updateDoc rejects undefined, and the row then
// matches a never-marked (legacy) one.

import type { Row } from "./types.js";

type GigRow = Pick<Row, "played" | "playedAt" | "binned" | "binnedAt">;

export function setPlayed(row: GigRow, played: boolean, now = Date.now()): void {
  row.played = played;
  if (played) {
    row.playedAt = new Date(now).toISOString();
    setBinned(row, false);
  } else {
    delete row.playedAt;
  }
}

export function setBinned(row: GigRow, binned: boolean, now = Date.now()): void {
  row.binned = binned;
  if (binned) {
    row.binnedAt = new Date(now).toISOString();
    setPlayed(row, false);
  } else {
    delete row.binnedAt;
  }
}

// Row.svelte has no pressed Played or Bin button: these filters keep those rows out.
export function workingUpNext<T extends GigRow>(rows: T[]): T[] {
  return rows.filter((row) => !row.played && !row.binned);
}

export function workingRequests<T extends GigRow>(rows: T[]): T[] {
  return rows.filter((row) => !row.binned);
}

// `rows` is unvalidated: a bad value should cost a missing time, not a broken row.
export function stateTime(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
