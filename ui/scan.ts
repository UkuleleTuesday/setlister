import { findDuplicate, rowKey } from "./dupes.js";
import type { CatalogueEntry, Edition, Row } from "./types.js";

/** Mirrors utrequests/models.py ParseResponse. */
export interface ParseResponse {
  edition: Edition;
  catalogue_generated_at: string;
  rows: Omit<Row, "uid">[];
  catalogue: CatalogueEntry[];
}

/** The API clamps or ignores out-of-range values. */
export interface ParseOptions {
  edition: string;
  model: string;
  disableThinking: boolean;
  sendCatalogue: boolean;
  maxImageEdge: number;
}

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
  // Sent even after a downscale, for browsers that couldn't shrink the photo.
  form.append("max_image_edge", String(options.maxImageEdge));
  const res = await fetch(`${apiBase}/api/parse`, { method: "POST", body: form, signal });
  if (!res.ok) {
    const detail = (await res.json().catch(() => ({}))).detail;
    throw new Error(detail || `Server error (${res.status})`);
  }
  return res.json();
}

export interface ScanPlan {
  fresh: Row[];
  flagged: Row[];
  skipped: number;
}

/**
 * Confident rows skip review (#80): on a legible board, reviewing them would
 * be most of the tapping. Flagged duplicates arrive pre-removed rather than
 * dropped, so restoring one in review opts a copy back in (#52).
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

export function scanResultMessage(added: number, skipped: number): string {
  if (added) {
    return `Added ${added} from the board${skipped ? ` · skipped ${skipped} already listed` : ""}`;
  }
  if (skipped) return "Nothing new. Everything on the board is already listed.";
  return "Couldn't read any songs off that photo. Try a closer, straighter shot.";
}

/** Says what skipped review, so "the sheet shows 3, the board had 12" reads as intended. */
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
