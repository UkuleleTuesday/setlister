// Songbook search, shared by the inline type-ahead and the room's songbook
// sheet so the two can't disagree about what "42" or "let" finds.
//
// - Every word must appear in title + artist, any order, accent-insensitive
//   (normalizeText mirrors the backend matcher, so "sara" finds "Sarà").
// - A bare number also matches the page: people at the club hold the printed
//   book, and "p.42" is how they point at a tune.
// - Ranking is deliberately shallow and stable, so results never jump around
//   between keystrokes: page hit, then title starting with the query, then
//   everything else, each tier in book (page) order.
//
// Pure module, no DOM: exported for ui/tests.

import { normalizeText } from "./dupes.js";

export function searchSongs(catalogue, query, { limit = Infinity } = {}) {
  const q = normalizeText(query.trim());
  const terms = q.split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  const page = /^\d+$/.test(q) ? Number(q) : null;
  const tiers = [[], [], []];
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
