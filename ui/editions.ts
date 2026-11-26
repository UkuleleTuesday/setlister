// Songbook editions: how one is named in a select. Pure, so main.ts and the
// Svelte panels label them the same way.

import type { Edition } from "./types.js";

/** An edition's display name: its title, or its id made readable. */
export function editionLabel(e: Pick<Edition, "id"> & Partial<Pick<Edition, "title">>): string {
  if (e.title && e.title !== e.id) return e.title;
  return e.id
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
