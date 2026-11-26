// Getting tunes onto the night: by name (the songbook, then the confirm
// sheet) in both modes, and by photo of the whiteboard. Each add lands in
// Requests with its asker's vote.

import type { RequestAnswer } from "./RoomRequestSheet.svelte";
import type { ScanOutcome } from "./ScanFlow.svelte";
import { API_BASE } from "./api.js";
import { adoptCatalogue, catalogue } from "./catalogue.svelte.js";
import { downscaleImage, resolveMaxEdge } from "./downscale.js";
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
import { planScan, requestParse } from "./scan.js";
import { linkNow } from "./session.svelte.js";
import { settings } from "./settings.svelte.js";
import type { CatalogueEntry, Row } from "./types.js";
import { view } from "./view.svelte.js";
import { ASKER, hasVoted, seedAsker } from "./votes.js";

function newUid(): string {
  return crypto.randomUUID
    ? crypto.randomUUID()
    : `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// A tap in the songbook does whatever actually helps: a new tune goes to the
// confirm sheet, one already asked for gets this phone's thumbs up, a played
// one says so and stays put. The one room-only part is the request link's
// brakes (open/closed and the one-a-minute wait, see room-limits.ts): they
// govern that link, and an organiser adds whatever the switch says.
export function pickSong(entry: CatalogueEntry) {
  const room = view.mode === "room";
  // Belt and braces: App closes the songbook when the door shuts, but a tap
  // can race the change.
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
    // Already asked for: what this person wants is for it to be played, and
    // the thumbs up says exactly that. Add-only, never a toggle, so a second
    // tap can't quietly take the vote back.
    const clientId = presence.getClientId();
    const already = hasVoted(night.votes, existing.row.uid, clientId);
    if (!already) {
      night.votes = seedAsker(night.votes, existing.row.uid, clientId);
      persist();
    }
    overlays.songbook = false;
    notices.requests.show(
      already
        ? `You already want “${entry.title}”. Fingers crossed!`
        : `Your thumbs up is on “${entry.title}”.`,
    );
    return;
  }
  // The wait only gates new requests, so it's checked last: thumbs up and
  // browsing carry on through it.
  const waiting = room ? cooldownRemaining(readLastRoomAdd(), Date.now()) : 0;
  if (waiting) {
    notices.songbook.show(`One at a time! You can add another in ${cooldownLabel(waiting)}.`);
    return;
  }
  overlays.songbook = false;
  overlays.request = { entry };
}

// The confirm sheet's answer: a request (with the name, the first time), or a
// rename. The name is committed here, not per keystroke, so an abandoned
// sheet leaves it untouched. The request then goes in as part of the same
// tap, so it can't be lost between the two.
export function confirmRequest({ entry, name, comment }: RequestAnswer) {
  if (name !== null) setPlayerName(name);
  // The door can shut (or the window lapse) while the sheet is open. App
  // dismisses it when that happens, but a tap racing the change gets here.
  if (entry && view.mode === "room" && !linkNow().open) {
    notices.requests.show("Requests just closed. Try the whiteboard of wishes!");
    return;
  }
  // addByName re-runs the duplicate guard (the pool may have moved while the
  // sheet was open) and says why if it refuses. On success say so (the sheet
  // just covered the pool where the row landed) and set the expectation for
  // the cool-down before it bites.
  if (entry && addByName(entry, comment)) {
    notices.requests.show(
      view.mode === "room"
        ? `Added “${entry.title}”. Next one in a minute.`
        : `Added “${entry.title}”.`,
    );
  }
}

// Returns whether a row was added. `comment` reuses the row's `notes` slot:
// the same field a scanned board annotation ("please NO!!!") lands in, so it
// syncs and renders with no new schema.
function addByName(entry: CatalogueEntry, comment: string): boolean {
  // Same song already on the night's lists (#52)? Say where it is instead of
  // quietly doubling it. Binned copies don't block; see dupes.ts.
  const existing = findDuplicate(night.upNext, night.requests, matchKey(entry));
  if (existing) {
    notices.requests.show(duplicateLabel(existing.where));
    return false;
  }
  const uid = newUid();
  night.requests.push({
    uid,
    source: view.mode === "room" ? "room" : "manual",
    addedBy: presence.displayName(night.name),
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
  });
  // Asking for a song IS wanting it, so it counts as this device's vote (#83).
  // One row added by one person, so it's attributed rather than anonymous:
  // their thumb lights up, and the tap they'd otherwise spend upvoting their
  // own request is already spent.
  night.votes = seedAsker(night.votes, uid, presence.getClientId());
  // Start the cool-down from the moment a request actually lands, not from the
  // pick that opened the sheet: a slow typist shouldn't spend their wait
  // inside the dialog. Persisted, so a reload isn't a way around it.
  if (view.mode === "room") writeLastRoomAdd(Date.now());
  persist();
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

// One photo, start to finish: shrink it, send it, take the catalogue it
// brings back, and add the confident rows straight to Requests. Returns what's
// left for review. Rejects (abort included) for ScanFlow to word.
export async function scanBoard(file: File, signal: AbortSignal): Promise<ScanOutcome> {
  // The long edge governs the upload, not just the server's resize: the
  // camera's 3–8MB original would be thrown away server-side anyway (#44).
  const { maxImageEdge, model, disableThinking, sendCatalogue } = settings;
  const maxEdge = resolveMaxEdge(maxImageEdge);
  const upload = await downscaleImage(file, { maxEdge });
  const data = await requestParse(
    API_BASE,
    upload,
    {
      // The session's book, not the select: night.edition is the source of
      // truth and the two only diverge for the beat before the select syncs.
      edition: night.edition?.id || catalogue.editionId,
      // Tuning knobs from the settings panel: the API clamps or ignores
      // anything out of range and falls back to its configured defaults.
      model,
      disableThinking,
      sendCatalogue,
      maxImageEdge: maxEdge,
    },
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

// Rows off the board, straight in or kept in review. Whoever wrote each one
// counts as its asker, so board requests start level with app ones (#83).
// Anonymous, not attributed to the person holding the camera: one photo makes
// many rows and they asked for none of them.
export function addFromBoard(rows: Row[]) {
  night.requests.push(...rows);
  for (const row of rows) night.votes = seedAsker(night.votes, row.uid, ASKER);
  persist();
}
