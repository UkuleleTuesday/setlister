// This device's copy of the night, so a reload or an accidental close loses
// nothing: both lists (rows carry their matched entry inline, so they render
// and export before the catalogue reloads), the votes, the session's book, the
// player's name, the session id and the settings.
//
// What comes back is whatever an older build (or a full disk) left, so it's
// read field by field: a field of the wrong kind is dropped. What's inside the
// lists, votes and edition is taken on trust, like the session doc's in
// sync.ts (#157 tracks real checks for both).

import type { Edition, Row, Votes } from "./types.js";

export const STORAGE_KEY = "setlister.v1";

export interface SavedState {
  upNext: Row[];
  requests: Row[];
  votes: Votes;
  edition: Edition | null;
  name: string;
  /** null when no session is active. */
  sessionId: string | null;
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

/** Whether this device has saved anything at all (the name amnesty asks). */
export function hasSavedState(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== null;
  } catch {
    return false;
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
  if (Array.isArray(s.upNext)) out.upNext = s.upNext;
  if (Array.isArray(s.requests)) out.requests = s.requests;
  // The pre-split payload: the old single `setlist` was the running order,
  // so it becomes Up next.
  if (Array.isArray(s.setlist) && !out.upNext && !out.requests) out.upNext = s.setlist;
  if (s.votes && typeof s.votes === "object") out.votes = s.votes as Votes;
  if (s.edition && typeof s.edition === "object") out.edition = s.edition as Edition;
  if (typeof s.name === "string") out.name = s.name;
  out.settings = s.settings;
  return out;
}
