// This device's copy of the night, so a reload or an accidental close loses
// nothing: both lists (rows carry their matched entry inline, so they render
// and export before the catalogue reloads), the votes, the session's book, the
// player's name and the settings. Which session to rejoin is the URL's
// (?session=), not this.
//
// What comes back is whatever an older build (or a full disk) left, so it's
// read field by field: a field of the wrong kind is dropped, as are non-row
// list entries and an edition without an id (#157).

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
  /** applySettings() in settings.svelte.ts validates its own fields. */
  settings: unknown;
}

export function writeSavedState(state: SavedState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* storage may be full or blocked (private mode): non-fatal */
  }
}

/** The usable parts of what's saved; a corrupt payload reads as nothing. */
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
  // The pre-split payload: the old single `setlist` was the running order,
  // so it becomes Up next.
  if (Array.isArray(s.setlist) && !out.upNext && !out.requests) {
    out.upNext = s.setlist.filter(isRow);
  }
  if (s.votes && typeof s.votes === "object") out.votes = s.votes as Votes;
  const edition = parseEdition(s.edition);
  if (edition) out.edition = edition;
  if (typeof s.name === "string") out.name = s.name;
  out.settings = s.settings;
  return out;
}
