// The organiser link (#151): `…/setlister/#organise=<key>`, pinned in the
// organisers' chat. Tapping it registers this phone as an organiser's (see
// organiser.svelte.ts). The key rides in the hash so it never reaches server
// logs, and the app strips it on load so a screenshot or "copy link" can't
// pass it on. A one-shot action, not a route: `?session=` alone still decides
// what the page shows.
//
// Pure, so it runs under node (like view-mode.ts).

// Generous: the real key is 32 hex chars (`openssl rand -hex 16`), and the
// rules compare it exactly anyway. The cap only stops a mangled paste from
// being sent at all.
const MAX_KEY_LENGTH = 200;

/** The key in an organiser link's hash, or null if the hash isn't one. */
export function parseOrganiseKey(hash: string): string | null {
  const key = new URLSearchParams(hash.replace(/^#/, "")).get("organise")?.trim();
  return key && key.length <= MAX_KEY_LENGTH ? key : null;
}

/** The same URL without its hash, keeping the path and `?session=`. */
export function stripHash(href: string): string {
  const url = new URL(href);
  url.hash = "";
  return url.toString();
}
