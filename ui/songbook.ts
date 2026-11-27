import type { DuplicateWhere } from "./dupes.js";

export type CatalogueStatus = "loading" | "ready" | "error";

// Silence must never read as "that song isn't in the book".
export function catalogueEmptyMessage(status: CatalogueStatus, query: string): string {
  if (status === "loading") return "Loading the songbook…";
  if (status === "error") return "Couldn't load the songbook. Check your connection";
  return query.trim() ? `No matches for “${query.trim()}”` : "This songbook has no tunes in it yet";
}

export function tonightTagLabel(where: DuplicateWhere): string {
  return { played: "played", upnext: "up next", requests: "requested" }[where];
}
