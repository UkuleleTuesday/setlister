// A bare number matches the page: people at the club hold the printed book.
// Ranking stays shallow and stable so results don't jump between keystrokes.

import { normalizeText } from "./dupes.js";
import type { CatalogueEntry } from "./types.js";

export function searchSongs<T extends Pick<CatalogueEntry, "title" | "artist" | "page">>(
  catalogue: T[],
  query: string,
  { limit = Infinity } = {},
): T[] {
  const q = normalizeText(query.trim());
  const terms = q.split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  const page = /^\d+$/.test(q) ? Number(q) : null;
  const tiers: T[][] = [[], [], []];
  for (const entry of catalogue) {
    if (page !== null && entry.page === page) {
      tiers[0].push(entry);
      continue;
    }
    const title = normalizeText(entry.title);
    const haystack = `${title} ${normalizeText(entry.artist || "")}`;
    if (!terms.every((term) => haystack.includes(term))) continue;
    tiers[title.startsWith(q) ? 1 : 2].push(entry);
  }
  return tiers.flat().slice(0, limit);
}
