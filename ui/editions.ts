import type { Edition } from "./types.js";

export function editionLabel(e: Pick<Edition, "id"> & Partial<Pick<Edition, "title">>): string {
  if (e.title && e.title !== e.id) return e.title;
  return e.id
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function parseEdition(value: unknown): Edition | null {
  return !!value && typeof value === "object" && typeof (value as Edition).id === "string"
    ? (value as Edition)
    : null;
}

/** Parses `/api/editions`. */
export function parseEditions(data: unknown): Edition[] {
  const list = (data as { editions?: unknown } | null)?.editions;
  if (!Array.isArray(list)) return [];
  return list.filter((e): e is Edition => parseEdition(e) !== null);
}
