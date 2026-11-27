import { night } from "./night.svelte.js";
import * as presence from "./presence.js";
import { persist } from "./save.js";

export function setPlayerName(value: string) {
  night.name = value;
  persist();
  presence.refreshPresence();
}
