import { stateTime } from "./gig-state.js";
import type { Row } from "./types.js";

/**
 * Played rows in the order they were played: by tick time, or by the running
 * order when any row lacks one (ticked before times were recorded).
 */
export function playedOrder(upNext: Row[]): Row[] {
  const played = upNext.filter((row) => row.played);
  if (!played.every((row) => stateTime(row.playedAt))) return played;
  // Stable, so rows ticked in the same instant keep the running order.
  return played.sort((a, b) => stateTime(a.playedAt)!.getTime() - stateTime(b.playedAt)!.getTime());
}

/**
 * Swaps a played row with its neighbour in playedOrder. Returns false at
 * either end.
 */
export function movePlayed(upNext: Row[], uid: string, delta: -1 | 1): boolean {
  const order = playedOrder(upNext);
  const from = order.findIndex((row) => row.uid === uid);
  const to = from + delta;
  if (from === -1 || to < 0 || to >= order.length) return false;
  const a = order[from];
  const b = order[to];
  // Trade the moments, so every time shown is still one a song was really
  // ticked: only which song it belongs to changes.
  if (a.playedAt && b.playedAt) [a.playedAt, b.playedAt] = [b.playedAt, a.playedAt];
  // Swap the running order too: it decides untimed rows, and ties.
  const ai = upNext.indexOf(a);
  const bi = upNext.indexOf(b);
  upNext[ai] = b;
  upNext[bi] = a;
  return true;
}
