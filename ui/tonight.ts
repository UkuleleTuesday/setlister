// What tonight's card on home says about the night so far.

import { playedOrder } from "./recap.js";
import type { ListState } from "./types.js";

export interface TonightSummary {
  requests: number;
  played: number;
}

export function tonightSummary({ upNext, requests }: Pick<ListState, "upNext" | "requests">) {
  return {
    requests: requests.filter((row) => !row.binned).length,
    played: playedOrder(upNext).length,
  } satisfies TonightSummary;
}

/** ["3 requests", "1 played"], leaving out a zero. */
export function tonightCounts({ requests, played }: TonightSummary): string[] {
  const parts: string[] = [];
  if (requests) parts.push(`${requests} ${requests === 1 ? "request" : "requests"}`);
  if (played) parts.push(`${played} played`);
  return parts;
}
