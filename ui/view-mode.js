// Room mode (#86, phase 1): the room's view of a session — add and watch
// requests, follow the set read-only — opened from a shared `?mode=request`
// link. It is a view, not a permission — firestore.rules
// grants any client with the session id full write access either way — so the
// job here is only to decide which view a device gets, and to keep that
// decision sticky: a phone that arrived through the room link must stay in the
// room view across reloads and plain-link opens, never silently graduating to
// the full app (accidental reordering is the failure mode #86 worries about).
// The one way back out is a deliberate `?mode=full` link — no in-app escape.
//
// Pure decision logic lives here (app.js can't be imported under node, so this
// is the testable seam, like dupes.js and session-id.js).

// The sticky flag's localStorage key. Its own key, outside setlister.v1, so
// persist()/restore()'s schema stays untouched (the WHATS_NEW_SEEN_KEY
// precedent).
export const ROOM_MODE_KEY = "setlister.roomMode.v1";

// What view this device gets, from the URL and the sticky flag. Returns
// `{ mode, store }`: `mode` is the view to render now, `store` is what the
// sticky flag should become ("room" or null). An unrecognised `mode` param
// falls through to the flag, so a mangled link can't flip a device's view.
export function resolveMode(searchParams, storedMode) {
  const param = searchParams.get("mode");
  if (param === "request") return { mode: "room", store: "room" };
  if (param === "full") return { mode: "full", store: null };
  const room = storedMode === "room";
  return { mode: room ? "room" : "full", store: room ? "room" : null };
}

// Every shareable session URL funnels through here so the `mode` param is
// always deliberate: the room link sets `request`, the full-app link sets
// `full` — being handed the full-app link IS the deliberate way out, so it
// must override a clicker's sticky room flag rather than fall through to it
// (and a room-mode sharer can't propagate their own mode by accident either,
// since location.href's param is always overwritten).
// Built on the given href so the GitHub Pages subpath survives.
export function buildSessionUrl(href, id, { room = false } = {}) {
  const url = new URL(href);
  url.searchParams.set("session", id);
  url.searchParams.set("mode", room ? "request" : "full");
  return url.toString();
}

// Provenance wording for a row's `source`, shared by every renderRow branch so
// a new source value can't silently fall into the whiteboard bucket.
export function sourceLabel(source) {
  if (source === "manual") return "added manually";
  if (source === "room") return "from the room";
  return "from the whiteboard";
}

// Thin storage wrappers: in private mode stickiness degrades to URL-only,
// which is fine for an honour-system view.
export function readStoredMode() {
  try {
    return localStorage.getItem(ROOM_MODE_KEY);
  } catch {
    return null;
  }
}

export function writeStoredMode(value) {
  try {
    if (value) localStorage.setItem(ROOM_MODE_KEY, value);
    else localStorage.removeItem(ROOM_MODE_KEY);
  } catch {
    /* storage blocked — non-fatal */
  }
}
