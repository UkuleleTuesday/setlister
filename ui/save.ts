import { night, nightSnapshot } from "./night.svelte.js";
import { readSavedState, writeSavedState } from "./saved-state.js";
import * as sync from "./sync.js";
import { view } from "./view.svelte.js";

export function persist() {
  const lists = nightSnapshot();
  writeSavedState({
    ...lists,
    name: night.name,
  });
  if (sync.getSessionId() && view.mode === "full") sync.notifyLocalChange(lists);
}

export function restore() {
  const saved = readSavedState();
  if (saved.upNext) night.upNext = saved.upNext;
  if (saved.requests) night.requests = saved.requests;
  if (saved.votes) night.votes = saved.votes;
  if (saved.edition) night.edition = saved.edition;
  if (saved.name !== undefined) night.name = saved.name;
}
