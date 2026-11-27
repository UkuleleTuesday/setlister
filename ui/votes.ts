// Upvote only: a downvote reads as a vote against the person who asked.
//
// Votes live in their own field, not on the row: diff() writes `rows.<uid>`
// wholesale, so votes on rows would clobber each other as the room votes at once.
//
// Keyed on presence's client id, honour-system: private browsing or a second
// phone votes again, and a miscount only plays a song slightly out of order.

import type { Row, Votes } from "./types.js";

type VoteMap = Record<string, true>;

function rowVotes(votes: unknown, uid: string): VoteMap {
  const entry = votes && typeof votes === "object" ? (votes as Record<string, unknown>)[uid] : null;
  return entry && typeof entry === "object" ? (entry as VoteMap) : {};
}

export function voteCount(votes: unknown, uid: string): number {
  return Object.keys(rowVotes(votes, uid)).length;
}

export function hasVoted(votes: unknown, uid: string, clientId: string): boolean {
  return rowVotes(votes, uid)[clientId] === true;
}

// Never mutates: sync.ts diffs against the last server state.
export function toggleVote(votes: unknown, uid: string, clientId: string): Votes {
  const next: Votes = { ...(votes && typeof votes === "object" ? (votes as Votes) : {}) };
  const row = { ...rowVotes(votes, uid) };
  if (row[clientId] === true) delete row[clientId];
  else row[clientId] = true;
  if (Object.keys(row).length) next[uid] = row;
  else delete next[uid];
  return next;
}

// Every request starts at one vote, so app requests don't outrank whiteboard
// ones. Scanned rows seed this reserved voter, as the photographer asked for
// none of them. Client ids are UUIDs or `c-<n>-<n>`, so it can't collide.
export const ASKER = "asker";

export function seedAsker(votes: Votes, uid: string, voter: string): Votes {
  if (hasVoted(votes, uid, voter)) return votes;
  return toggleVote(votes, uid, voter);
}

// Display only: sorting requestsOrder itself (whole-array last-write-wins)
// would make every vote fight concurrent edits.
export function sortForDisplay<T extends Pick<Row, "uid">>(rows: T[], votes: unknown): T[] {
  return [...rows].sort((a, b) => voteCount(votes, b.uid) - voteCount(votes, a.uid));
}
