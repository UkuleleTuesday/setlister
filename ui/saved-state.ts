// Rows carry their matched entry inline, so they render and export before the
// catalogue reloads. Read field by field: an older build or a full disk can
// leave anything (#157).

import { parseEdition } from "./editions.js";
import { isRow } from "./row-shape.js";
import type { Edition, Row, Votes } from "./types.js";

export const STORAGE_KEY = "setlister.v1";

export interface SavedState {
  upNext: Row[];
  requests: Row[];
  votes: Votes;
  edition: Edition | null;
  name: string;
}

export function writeSavedState(state: SavedState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* storage may be full or blocked (private mode): non-fatal */
  }
}

export function readSavedState(): Partial<SavedState> {
  let saved: unknown;
  try {
    saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
  } catch {
    return {};
  }
  if (!saved || typeof saved !== "object") return {};
  const s = saved as Record<string, unknown>;
  const out: Partial<SavedState> = {};
  if (Array.isArray(s.upNext)) out.upNext = s.upNext.filter(isRow);
  if (Array.isArray(s.requests)) out.requests = s.requests.filter(isRow);
  // Pre-split payload: the single `setlist` was the running order.
  if (Array.isArray(s.setlist) && !out.upNext && !out.requests) {
    out.upNext = s.setlist.filter(isRow);
  }
  if (s.votes && typeof s.votes === "object") out.votes = s.votes as Votes;
  const edition = parseEdition(s.edition);
  if (edition) out.edition = edition;
  if (typeof s.name === "string") out.name = s.name;
  return out;
}
