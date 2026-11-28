import { exportedRows } from "./export.js";
import { night } from "./night.svelte.js";
import * as presence from "./presence.js";
import { openingSoonNote, requestsClosedNote } from "./request-window.js";
import { session } from "./session.svelte.js";
import type { Row } from "./types.js";
import { organiserStatus } from "./organiser-status.svelte.js";
import { hasVoted, voteCount } from "./votes.js";

/** The want button's state for one row. */
export interface RowVote {
  count: number;
  mine: boolean;
}

class Lists {
  room = $derived(!organiserStatus.isOrganiser);
  roomOpen = $derived(this.room && session.link.open);
  // A View-only link promises the room can only watch. Closing the link
  // doesn't stop the organiser voting.
  votingEnabled = $derived(!this.room || session.link.open);
  // Copying "" or downloading `{rows: []}` would be traps, so export disables.
  exportEmpty = $derived(exportedRows(night.upNext, night.requests).length === 0);
  closedNote = $derived(requestsClosedNote(session.link.status, session.now));
  openingSoon = $derived(
    session.link.soonMinutes === null ? "" : openingSoonNote(session.link.soonMinutes),
  );
}

export const lists = new Lists();

export function rowVote(row: Row): RowVote | null {
  if (!lists.votingEnabled) return null;
  return {
    count: voteCount(night.votes, row.uid),
    mine: hasVoted(night.votes, row.uid, presence.getClientId()),
  };
}
