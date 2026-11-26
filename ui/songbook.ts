// Wording shared by every song list (the songbook sheet, the review sheet's
// picker): what an empty list means, and how tonight's state is tagged. Pure,
// so app.js and the Svelte sheets can't drift apart.

import type { DuplicateWhere } from "./dupes.js";

/** Where the catalogue fetch stands. */
export type CatalogueStatus = "loading" | "ready" | "error";

/**
 * Explain an empty result list instead of showing nothing: no catalogue yet,
 * catalogue unreachable, or a genuine no-match. Silence must never read as
 * "that song isn't in the book".
 */
export function catalogueEmptyMessage(status: CatalogueStatus, query: string): string {
  if (status === "loading") return "Loading the songbook…";
  if (status === "error") return "Couldn't load the songbook. Check your connection";
  return query.trim() ? `No matches for “${query.trim()}”` : "This songbook has no tunes in it yet";
}

/**
 * Tonight's state for a song, as a short tag next to it in any song list:
 * what's already played or asked for, seen BEFORE the tap rather than as a
 * refusal after it.
 */
export function tonightTagLabel(where: DuplicateWhere): string {
  return { played: "played", upnext: "up next", requests: "requested" }[where];
}
