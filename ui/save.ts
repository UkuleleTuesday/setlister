import { night, nightSnapshot } from "./night.svelte.js";
import { organiserStatus } from "./organiser-status.svelte.js";
import { readSavedState, writeSavedState } from "./saved-state.js";
import * as sync from "./sync.js";

export function persist() {
  writeSavedState({ edition: night.edition, name: night.name });
  if (sync.getSessionId() && organiserStatus.isOrganiser) sync.notifyLocalChange(nightSnapshot());
}

export function restore() {
  const saved = readSavedState();
  if (saved.edition) night.edition = saved.edition;
  if (saved.name !== undefined) night.name = saved.name;
}
