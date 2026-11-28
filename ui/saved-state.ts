// The night itself lives in Firestore. This keeps what the phone needs before
// a doc arrives: who's holding it and which book to search. Read field by
// field: an older build or a full disk can leave anything (#157).

import { parseEdition } from "./editions.js";
import type { Edition } from "./types.js";

export const STORAGE_KEY = "setlister.v1";

export interface SavedState {
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
  const edition = parseEdition(s.edition);
  if (edition) out.edition = edition;
  if (typeof s.name === "string") out.name = s.name;
  return out;
}
