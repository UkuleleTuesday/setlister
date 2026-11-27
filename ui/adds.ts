import type { RequestAnswer } from "./RoomRequestSheet.svelte";
import type { ScanOutcome } from "./ScanFlow.svelte";
import { API_BASE } from "./api.js";
import { adoptCatalogue, catalogue } from "./catalogue.svelte.js";
import { downscaleImage } from "./downscale.js";
import { duplicateLabel, findDuplicate, matchKey } from "./dupes.js";
import { night } from "./night.svelte.js";
import { notices } from "./notices.svelte.js";
import { overlays } from "./overlays.svelte.js";
import { setPlayerName } from "./player.js";
import * as presence from "./presence.js";
import {
  cooldownLabel,
  cooldownRemaining,
  readLastRoomAdd,
  writeLastRoomAdd,
} from "./room-limits.js";
import { persist } from "./save.js";
import { sendRoomWrite } from "./room-writes.js";
import { planScan, requestParse } from "./scan.js";
import { linkNow } from "./session.svelte.js";
import * as sync from "./sync.js";
import type { CatalogueEntry, Row } from "./types.js";
import { view } from "./view.svelte.js";
import { ASKER, hasVoted, seedAsker } from "./votes.js";

function newUid(): string {
  return crypto.randomUUID
    ? crypto.randomUUID()
    : `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function pickSong(entry: CatalogueEntry) {
  const room = view.mode === "room";
  // App closes the songbook when requests close, but a tap can race that.
  if (room && !linkNow().open) {
    overlays.songbook = false;
    notices.requests.show("Requests are closed. Try the whiteboard of wishes!");
    return;
  }
  const existing = findDuplicate(night.upNext, night.requests, matchKey(entry));
  if (existing?.where === "played") {
    notices.songbook.show(`“${entry.title}” was played earlier tonight. Pick another?`);
    return;
  }
  if (existing) {
    // Add-only, never a toggle, so a second tap can't take the vote back.
    const clientId = presence.getClientId();
    const already = hasVoted(night.votes, existing.row.uid, clientId);
    if (!already) {
      night.votes = seedAsker(night.votes, existing.row.uid, clientId);
      persist();
      if (room) {
        sendRoomWrite(
          sync.setRoomVote(existing.row.uid, clientId, true),
          "Couldn’t save your thumbs up. Reload and try again.",
        );
      }
    }
    overlays.songbook = false;
    notices.requests.show(
      already
        ? `You already want “${entry.title}”. Fingers crossed!`
        : `Your thumbs up is on “${entry.title}”.`,
    );
    return;
  }
  // Checked last: the wait gates new requests, not thumbs up.
  const waiting = room ? cooldownRemaining(readLastRoomAdd(), Date.now()) : 0;
  if (waiting) {
    notices.songbook.show(`One at a time! You can add another in ${cooldownLabel(waiting)}.`);
    return;
  }
  overlays.songbook = false;
  overlays.request = { entry };
}

// The name is committed here, not per keystroke, so an abandoned sheet leaves
// it untouched, and in the same tap as the request so neither is lost.
export function confirmRequest({ entry, name, comment }: RequestAnswer) {
  if (name !== null) setPlayerName(name);
  // App dismisses the sheet when requests close, but a tap can race that.
  if (entry && view.mode === "room" && !linkNow().open) {
    notices.requests.show("Requests just closed. Try the whiteboard of wishes!");
    return;
  }
  // addByName re-checks duplicates: the lists may have moved while the sheet was open.
  if (entry && addByName(entry, comment)) {
    notices.requests.show(
      view.mode === "room"
        ? `Added “${entry.title}”. Next one in a minute.`
        : `Added “${entry.title}”.`,
    );
  }
}

// `comment` goes in `notes`, where scanned board annotations land, so it
// needs no new schema.
function addByName(entry: CatalogueEntry, comment: string): boolean {
  const existing = findDuplicate(night.upNext, night.requests, matchKey(entry));
  if (existing) {
    notices.requests.show(duplicateLabel(existing.where));
    return false;
  }
  const uid = newUid();
  const room = view.mode === "room";
  const row: Row = {
    uid,
    source: room ? "room" : "manual",
    addedBy: presence.displayName(night.name).slice(0, 60),
    raw_title: entry.display,
    raw_page: entry.page,
    notes: (comment || "").trim().slice(0, 120) || null,
    crossed_out: false,
    status: "confirmed",
    method: "none",
    confidence: 1,
    match: entry,
    alternatives: [],
    explanation: "Added manually",
    removed: false,
    played: false,
    binned: false,
  };
  night.requests.push(row);
  const clientId = presence.getClientId();
  night.votes = seedAsker(night.votes, uid, clientId);
  persist();
  if (room) {
    // Starts on landing, not at the pick, so a slow typist doesn't spend the wait in the sheet.
    writeLastRoomAdd(Date.now());
    sendRoomWrite(
      sync.addRoomRequest(JSON.parse(JSON.stringify(row)), clientId),
      "Couldn’t add that request. Reload and try again.",
    );
  }
  return true;
}

function scannedRow(row: Omit<Row, "uid">): Row {
  return {
    ...row,
    uid: newUid(),
    source: "scan",
    addedBy: presence.displayName(night.name),
    removed: false,
    played: false,
    binned: false,
  };
}

// Rejects (abort included) for ScanFlow to word.
export async function scanBoard(file: File, signal: AbortSignal): Promise<ScanOutcome> {
  const upload = await downscaleImage(file);
  const data = await requestParse(
    API_BASE,
    upload,
    // Not the select's value: it can lag behind night.edition.
    { edition: night.edition?.id || catalogue.editionId },
    signal,
  );
  adoptCatalogue(data);
  const { fresh, flagged, skipped } = planScan(
    data.rows.map(scannedRow),
    night.upNext,
    night.requests,
  );
  if (fresh.length) addFromBoard(fresh);
  return { flagged, autoAdded: fresh.length, autoSkipped: skipped };
}

// The anonymous ASKER vote starts board requests level with app ones (#83).
export function addFromBoard(rows: Row[]) {
  night.requests.push(...rows);
  for (const row of rows) night.votes = seedAsker(night.votes, row.uid, ASKER);
  persist();
}
