// The session link and row provenance wording. Which view a phone gets is
// view.svelte.ts's. Pure, so tests run under node.

import type { RowSource } from "./types.js";

/** Which view a device gets: the full app or the room's request view. */
export type ViewMode = "full" | "room";

// The pre-#152 sticky room flag, cleared at boot.
const LEGACY_ROOM_MODE_KEY = "setlister.roomMode.v1";

/** The one session link (#152). */
export function buildSessionUrl(href: string, id: string): string {
  const url = new URL(href);
  url.searchParams.set("session", id);
  url.searchParams.delete("mode");
  return url.toString();
}

/** The href without a retired `?mode=`, or null if it has none. */
export function withoutModeParam(href: string): string | null {
  const url = new URL(href);
  if (!url.searchParams.has("mode")) return null;
  url.searchParams.delete("mode");
  return url.toString();
}

/** Boot: strip a retired `?mode=` and the old sticky flag. */
export function retireModeLinks(): void {
  const clean = withoutModeParam(location.href);
  if (clean) history.replaceState(history.state, "", clean);
  try {
    localStorage.removeItem(LEGACY_ROOM_MODE_KEY);
  } catch {
    /* storage blocked */
  }
}

// Provenance wording for a row's `source`, shared by every row context so
// a new source value can't silently fall into the whiteboard bucket.
export function sourceLabel(source: RowSource | undefined): string {
  if (source === "manual") return "added manually";
  if (source === "room") return "from the room";
  return "from the whiteboard";
}
