// The whiteboard scan, minus the UI: the /api/parse call, and what a scan's
// rows mean for the night. ScanFlow.svelte owns the screens; adds.ts owns the
// lists the rows land in.

import { findDuplicate, rowKey } from "./dupes.js";
import type { CatalogueEntry, Edition, Row } from "./types.js";

/** What /api/parse answers (utrequests/models.py ParseResponse). */
export interface ParseResponse {
  edition: Edition;
  catalogue_generated_at: string;
  rows: Omit<Row, "uid">[];
  catalogue: CatalogueEntry[];
}

/** The settings-panel knobs a scan sends; the API clamps or ignores them. */
export interface ParseOptions {
  edition: string;
  model: string;
  disableThinking: boolean;
  sendCatalogue: boolean;
  maxImageEdge: number;
}

/**
 * POST the photo to /api/parse. Server errors carry a user-facing `detail`,
 * which becomes the thrown message; an abort or a network failure rejects as
 * fetch does (AbortError / TypeError), for the caller to word.
 */
export async function requestParse(
  apiBase: string,
  image: Blob,
  options: ParseOptions,
  signal: AbortSignal,
): Promise<ParseResponse> {
  const form = new FormData();
  form.append("image", image);
  form.append("edition", options.edition);
  if (options.model) form.append("model", options.model);
  form.append("thinking_budget", options.disableThinking ? "0" : "1024");
  form.append("catalogue_in_prompt", options.sendCatalogue ? "true" : "false");
  // Sent anyway: a browser that couldn't downscale still gets the size it
  // asked for, and when the shrink worked this is a no-op on a photo that
  // already fits.
  form.append("max_image_edge", String(options.maxImageEdge));
  const res = await fetch(`${apiBase}/api/parse`, { method: "POST", body: form, signal });
  if (!res.ok) {
    const detail = (await res.json().catch(() => ({}))).detail;
    throw new Error(detail || `Server error (${res.status})`);
  }
  return res.json();
}

/** A scan's rows, sorted by what happens to them. */
export interface ScanPlan {
  /** Confident, new to the night: straight into Requests (#80). */
  fresh: Row[];
  /** Everything else, for the review sheet; duplicates arrive pre-removed. */
  flagged: Row[];
  /** Confident rows dropped as already listed, or repeated on the board. */
  skipped: number;
}

/**
 * Confident matches skip the queue (#80): on a mostly-legible board,
 * reviewing rows that need no review was the bulk of the tap work. Only the
 * flagged rows (needs_review / conflict / unmatched) go to review;
 * crossed-out-but-confirmed rows auto-add with their flag.
 *
 * Duplicate gate (#52): a re-scan must not double the night, so confident
 * rows already on the lists, or earlier in this same batch (boards repeat
 * songs too), are skipped. Flagged rows that duplicate the lists, the fresh
 * rows included, arrive pre-removed: the review sheet's remove/restore IS
 * the "offer to skip", and restoring opts a copy back in deliberately.
 */
export function planScan(entries: Row[], upNext: Row[], requests: Row[]): ScanPlan {
  const seen = new Set<string>();
  const fresh: Row[] = [];
  let skipped = 0;
  for (const entry of entries.filter((e) => e.status === "confirmed")) {
    const key = rowKey(entry);
    if (seen.has(key) || findDuplicate(upNext, requests, key)) {
      skipped++;
      continue;
    }
    seen.add(key);
    fresh.push(entry);
  }
  const withFresh = [...requests, ...fresh];
  const flagged = entries
    .filter((e) => e.status !== "confirmed")
    .map((e) =>
      e.match && findDuplicate(upNext, withFresh, rowKey(e)) ? { ...e, removed: true } : e,
    );
  return { fresh, flagged, skipped };
}

/** What a scan with nothing to review says it did. */
export function scanResultMessage(added: number, skipped: number): string {
  if (added) {
    return `Added ${added} from the board${skipped ? ` · skipped ${skipped} already listed` : ""}`;
  }
  if (skipped) return "Nothing new. Everything on the board is already listed.";
  return "Couldn't read any songs off that photo. Try a closer, straighter shot.";
}

/**
 * The review sheet's opening line. Orientation first: how many rows skipped
 * the queue (and how many were already listed), so "the sheet shows 3 but
 * the board had 12" reads as the feature it is, not a bug.
 */
export function reviewNote(autoAdded: number, autoSkipped: number): string {
  if (autoAdded) {
    const dupes = autoSkipped ? ` (${autoSkipped} already listed)` : "";
    return (
      `${autoAdded} clear ${autoAdded === 1 ? "match" : "matches"} went straight to ` +
      `Requests${dupes}. These need a look first.`
    );
  }
  if (autoSkipped) {
    return `${autoSkipped} from the board ${autoSkipped === 1 ? "was" : "were"} already listed. These need a look first.`;
  }
  return "Fix any misreads, drop what you don't want, then add them to Requests.";
}
