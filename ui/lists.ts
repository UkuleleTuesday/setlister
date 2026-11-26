// What the session lists render from: main.ts hands the sections one of these
// (rows as fresh copies, so an in-place edit still re-renders) after every
// change. Types plus one helper; no state lives here.

import type { Row, Votes } from "./types.js";
import { hasVoted, voteCount } from "./votes.js";

/** The want button's state for one row. */
export interface RowVote {
  count: number;
  mine: boolean;
}

export interface ListsData {
  upNext: Row[];
  requests: Row[];
  votes: Votes;
  clientId: string;
  /** The room's request view, rather than the full app. */
  room: boolean;
  /** Whether this device can vote right now (see votingEnabled in main.ts). */
  votingEnabled: boolean;
  /** The room view's request link is taking tunes. */
  roomOpen: boolean;
  showSuggestions: boolean;
  /** Nothing to export: the copy and download buttons go inert. */
  exportEmpty: boolean;
  /** "Requests open in 12 minutes…", for the room's opening-soon note. */
  openingSoon: string;
}

/** Before main.ts's first render: nothing to show yet. */
export const EMPTY_LISTS: ListsData = {
  upNext: [],
  requests: [],
  votes: {},
  clientId: "",
  room: false,
  votingEnabled: false,
  roomOpen: false,
  showSuggestions: false,
  exportEmpty: true,
  openingSoon: "",
};

/** The want button for a row, or null when this device can't vote. */
export function rowVote(data: ListsData, row: Row): RowVote | null {
  if (!data.votingEnabled) return null;
  return {
    count: voteCount(data.votes, row.uid),
    mine: hasVoted(data.votes, row.uid, data.clientId),
  };
}
