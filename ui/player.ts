// The player's name: remembered across sessions so provenance survives a
// reload, and pushed to the presence roster so a new name shows up for
// everyone at once. Three surfaces set it (the settings field, the room's
// confirm sheet, the name amnesty), all through setPlayerName().

import { readNameResetDone, resolveNameReset, writeNameResetDone } from "./name-reset.js";
import { night } from "./night.svelte.js";
import { overlays } from "./overlays.svelte.js";
import * as presence from "./presence.js";
import { hasSavedState } from "./saved-state.js";
import { persist } from "./save.js";
import { view } from "./view.svelte.js";

export function setPlayerName(value: string) {
  night.name = value;
  persist();
  presence.refreshPresence();
}

// The one-time name amnesty (rules and copy in name-reset.ts). Runs at boot,
// after the view mode is known and before presence can broadcast the name.
export function maybeResetName() {
  const plan = resolveNameReset({
    mode: view.mode,
    done: readNameResetDone(),
    hasSavedState: hasSavedState(),
  });
  if (plan.clearName && night.name) setPlayerName("");
  if (plan.markDone) writeNameResetDone();
  if (plan.showSheet) overlays.nameReset = true;
}
