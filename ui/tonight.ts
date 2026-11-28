// What tonight's card on home says about the night so far.

import { playedOrder } from "./recap.js";
import type { ListState, Row } from "./types.js";

export interface TonightSummary {
  /** The top of Up next, once a tune has been played: before that, it's only the organisers' prep. */
  next: Row | null;
  requests: number;
  played: number;
}

export function tonightSummary({ upNext, requests }: Pick<ListState, "upNext" | "requests">) {
  const played = playedOrder(upNext).length;
  return {
    next: played ? (upNext.find((row) => !row.played && !row.binned) ?? null) : null,
    requests: requests.filter((row) => !row.binned).length,
    played,
  } satisfies TonightSummary;
}

/** "3 requests · 1 played", leaving out a zero. */
export function tonightCounts({ requests, played }: TonightSummary): string {
  const parts: string[] = [];
  if (requests) parts.push(`${requests} ${requests === 1 ? "request" : "requests"}`);
  if (played) parts.push(`${played} played`);
  return parts.join(" · ");
}

/** "p.9 Let It Be - The Beatles", or the raw title quoted for a row off the book. */
export function tonightNextText(row: Row): string {
  return row.match ? `p.${row.match.page} ${row.match.display}` : `“${row.raw_title}”`;
}
