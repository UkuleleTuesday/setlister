import type { RowActions } from "./Row.svelte";
import { catalogue } from "./catalogue.svelte.js";
import { exportPayload, exportText, exportedRows } from "./export.js";
import { setBinned, setPlayed } from "./gig-state.js";
import { night, nightSnapshot } from "./night.svelte.js";
import { movePlayed } from "./recap.js";
import * as presence from "./presence.js";
import { persist } from "./save.js";
import { copyToClipboard } from "./share-link.js";
import * as sync from "./sync.js";
import type { Row } from "./types.js";
import { sendRoomWrite } from "./room-writes.js";
import { view } from "./view.svelte.js";
import { hasVoted, toggleVote } from "./votes.js";

function withRow(uid: string, change: (row: Row) => void) {
  const row = [...night.upNext, ...night.requests].find((e) => e.uid === uid);
  if (!row) return;
  change(row);
  persist();
}

function move(from: Row[], to: Row[], uid: string) {
  const index = from.findIndex((e) => e.uid === uid);
  if (index === -1) return;
  const [row] = from.splice(index, 1);
  to.push(row);
  persist();
}

// Step past hidden (played/binned) rows, or a row burrows invisibly through a
// hidden cluster one keypress at a time.
function moveBy(uid: string, delta: -1 | 1) {
  const list = night.upNext;
  const index = list.findIndex((e) => e.uid === uid);
  if (index === -1) return;
  const hidden = (e: Row) => e.played || e.binned;
  let target = index + delta;
  while (target >= 0 && target < list.length && hidden(list[target])) target += delta;
  if (target < 0 || target >= list.length) return;
  const [row] = list.splice(index, 1);
  list.splice(target, 0, row);
  persist();
}

export const rowActions: RowActions = {
  togglePlayed: (uid) => withRow(uid, (row) => setPlayed(row, !row.played)),
  toggleBinned: (uid) => withRow(uid, (row) => setBinned(row, !row.binned)),
  movePlayed: (uid, delta) => {
    if (movePlayed(night.upNext, uid, delta)) persist();
  },
  promote: (uid) => move(night.requests, night.upNext, uid),
  demote: (uid) => move(night.upNext, night.requests, uid),
  // diff() turns a vote into a single `votes.<uid>.<clientId>` leaf write, so
  // two people voting at once both land.
  vote: (uid) => {
    const clientId = presence.getClientId();
    night.votes = toggleVote(night.votes, uid, clientId);
    persist();
    if (view.mode === "room") {
      sendRoomWrite(
        sync.setRoomVote(uid, clientId, hasVoted(night.votes, uid, clientId)),
        "Couldn’t save your thumbs up. Reload and try again.",
      );
    }
  },
  setMatch: (uid, entry) =>
    withRow(uid, (row) => {
      row.match = entry;
      row.status = "confirmed";
      row.explanation = "Manually selected";
      row.alternatives = [];
    }),
  moveBy,
  // Holds remote snapshots while a finger is on a row.
  gesture: (active) => sync.setGestureActive(active),
};

// `uids` holds the visible rows only: indexOf's -1 and the stable sort park
// played/binned rows at the front, in order. Relied on: played songs belong on top.
export function commitOrder(uids: string[]) {
  night.upNext.sort((a, b) => uids.indexOf(a.uid) - uids.indexOf(b.uid));
  persist();
}

export async function copySetlist() {
  const rows = exportedRows(night.upNext, night.requests);
  await copyToClipboard(exportText(rows));
}

export function downloadSetlist() {
  const lists = nightSnapshot();
  const rows = exportedRows(lists.upNext, lists.requests);
  const payload = exportPayload(lists.edition, catalogue.generatedAt, rows);
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "requests.json";
  a.click();
  URL.revokeObjectURL(a.href);
}
