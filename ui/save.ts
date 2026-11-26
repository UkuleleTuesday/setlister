// This device's copy of the night, and the push to the session's peers. Every
// change ends with persist(); both destinations get plain copies, never the
// live state.

import { night, nightSnapshot } from "./night.svelte.js";
import { readSavedState, writeSavedState } from "./saved-state.js";
import { applySettings, settingsSnapshot } from "./settings.svelte.js";
import * as sync from "./sync.js";

export function persist() {
  const lists = nightSnapshot();
  writeSavedState({
    ...lists,
    name: night.name,
    // So a reload silently rejoins (main.ts routes to it).
    sessionId: sync.getSessionId(),
    settings: settingsSnapshot(),
  });
  if (sync.getSessionId()) sync.notifyLocalChange(lists);
}

/** Load what this device saved last time. */
export function restore() {
  const saved = readSavedState();
  if (saved.upNext) night.upNext = saved.upNext;
  if (saved.requests) night.requests = saved.requests;
  if (saved.votes) night.votes = saved.votes;
  if (saved.edition) night.edition = saved.edition;
  if (saved.name !== undefined) night.name = saved.name;
  applySettings(saved.settings);
}
