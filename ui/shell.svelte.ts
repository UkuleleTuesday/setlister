// The page chrome's state: which view shows, the header's title and share
// button, the session view's mode classes, the request link's pills and the
// footnote. main.ts writes it, App.svelte draws it; nothing else lives here.

import type { WindowState } from "./request-window.js";

export const BRAND_TITLE = "🎶 Setlister";

export const shell = $state({
  /** Home (the history) or a session. The URL decides; see applyRoute. */
  view: "home" as "home" | "session",
  /** The room's request view (#86): only ever true while a session shows. */
  room: false,
  /** No songs and none coming: the view collapses to the add buttons. */
  fresh: false,
  requestsClosed: false,
  requestsOpeningSoon: false,
  /** The header h1: the brand on home, the night's date in a session. */
  title: BRAND_TITLE,
  /** In a session: the share button's ring and its spoken state. */
  shareActive: false,
  shareLabel: "Share session",
  /** People connected, for the badge on the share button; 0 hides it. */
  shareCount: 0,
  windowState: "closed" as WindowState,
  windowChip: "",
  roomWindow: "",
  /** The room's "As Alex" line; empty hides it. */
  roomIdentity: "",
  editionNote: "",
});
