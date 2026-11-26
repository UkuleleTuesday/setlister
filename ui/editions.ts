// Songbook editions: how one is named in a select, and the listing the API
// returns. Pure, so every select labels a book the same way.

import type { Edition } from "./types.js";

/** An edition's display name: its title, or its id made readable. */
export function editionLabel(e: Pick<Edition, "id"> & Partial<Pick<Edition, "title">>): string {
  if (e.title && e.title !== e.id) return e.title;
  return e.id
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** `/api/editions`: the books on offer. Entries without an id are dropped. */
export function parseEditions(data: unknown): Edition[] {
  const list = (data as { editions?: unknown } | null)?.editions;
  if (!Array.isArray(list)) return [];
  return list.filter((e): e is Edition => !!e && typeof e === "object" && typeof e.id === "string");
}
