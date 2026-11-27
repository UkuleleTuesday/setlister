import type { RowSource } from "./types.js";

export type ViewMode = "full" | "room";

// The pre-#152 sticky room flag.
const LEGACY_ROOM_MODE_KEY = "setlister.roomMode.v1";

export function buildSessionUrl(href: string, id: string): string {
  const url = new URL(href);
  url.searchParams.set("session", id);
  url.searchParams.delete("mode");
  return url.toString();
}

export function withoutModeParam(href: string): string | null {
  const url = new URL(href);
  if (!url.searchParams.has("mode")) return null;
  url.searchParams.delete("mode");
  return url.toString();
}

export function retireModeLinks(): void {
  const clean = withoutModeParam(location.href);
  if (clean) history.replaceState(history.state, "", clean);
  try {
    localStorage.removeItem(LEGACY_ROOM_MODE_KEY);
  } catch {
    /* storage blocked */
  }
}

export function sourceLabel(source: RowSource | undefined): string {
  if (source === "manual") return "added manually";
  if (source === "room") return "from the room";
  return "from the whiteboard";
}
