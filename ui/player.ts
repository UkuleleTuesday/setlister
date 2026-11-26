// The player's name: remembered across sessions so provenance survives a
// reload, and pushed to the presence roster so a new name shows up for
// everyone at once. Three surfaces set it (the settings field, the room's
// confirm sheet, the organiser link's name step), all through setPlayerName().

import { night } from "./night.svelte.js";
import * as presence from "./presence.js";
import { persist } from "./save.js";

export function setPlayerName(value: string) {
  night.name = value;
  persist();
  presence.refreshPresence();
}
