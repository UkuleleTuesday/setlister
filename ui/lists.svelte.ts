// What the session lists derive from the night beyond the rows themselves:
// whether this phone can vote, whether the room's link is open, whether
// there's anything to export, and the room's opening-soon note.

import { exportedRows } from "./export.js";
import { night } from "./night.svelte.js";
import * as presence from "./presence.js";
import { openingSoonNote } from "./request-window.js";
import { session } from "./session.svelte.js";
import { settings } from "./settings.svelte.js";
import type { Row } from "./types.js";
import { view } from "./view.svelte.js";
import { hasVoted, voteCount } from "./votes.js";

/** The want button's state for one row. */
export interface RowVote {
  count: number;
  mine: boolean;
}

class Lists {
  /** The room's read-mostly rows. */
  room = $derived(view.mode === "room");
  /** The room view's request link is taking tunes. */
  roomOpen = $derived(this.room && session.link.open);
  // A room device on a View-only link doesn't vote either: the share panel
  // promises those people can "open tonight's pool and watch it", and a live
  // control would make that a lie. The full app always votes: closing the
  // link is about the link.
  votingEnabled = $derived(!this.room || session.link.open);
  // The export pair covers both lists; with nothing to export, copying an
  // empty string and downloading `{rows: []}` are traps, not actions.
  exportEmpty = $derived(
    exportedRows(night.upNext, night.requests, settings.includeCrossed).length === 0,
  );
  openingSoon = $derived(
    session.link.soonMinutes === null ? "" : openingSoonNote(session.link.soonMinutes),
  );
}

export const lists = new Lists();

/** The want button for a row, or null when this phone can't vote. */
export function rowVote(row: Row): RowVote | null {
  if (!lists.votingEnabled) return null;
  return {
    count: voteCount(night.votes, row.uid),
    mine: hasVoted(night.votes, row.uid, presence.getClientId()),
  };
}
