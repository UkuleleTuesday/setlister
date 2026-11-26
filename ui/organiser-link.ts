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

/**
 * The key from what someone pasted into Settings: the whole organiser link,
 * or just the key. The home-screen route on iPhone, where a tapped link opens
 * in Safari instead of the app.
 */
export function parseOrganiseInput(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  if (trimmed.includes("#")) return parseOrganiseKey(trimmed.slice(trimmed.indexOf("#")));
  // A bare key: one token, nothing URL-shaped.
  return /^[A-Za-z0-9_-]{8,200}$/.test(trimmed) ? trimmed : null;
}

/** What the sheet says when registering fails, and what its button does. */
export interface RegistrationError {
  message: string;
  action: "retry" | "reload";
}

/** Rejected by withTimeout(): the write never came back. */
export class TimeoutError extends Error {
  constructor() {
    super("Timed out");
    this.name = "TimeoutError";
  }
}

/** `promise`, or a TimeoutError after `ms`. Firestore doesn't fail an
 * offline write, it waits, so without this "Registering" never ends. */
export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new TimeoutError()), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// Plain words for the failures an organiser can hit. Raw Firebase messages
// ("auth/network-request-failed") go to the console, never the sheet.
export function describeRegistrationError(err: unknown): RegistrationError {
  const code = (err as { code?: unknown } | null)?.code;
  const text = err instanceof Error ? err.message : String(err);
  if (
    err instanceof TimeoutError ||
    code === "auth/network-request-failed" ||
    code === "unavailable"
  ) {
    return {
      message: "Couldn’t reach Setlister. Check your signal or wifi, then try again.",
      action: "retry",
    };
  }
  // A tab open since before a deploy asks for a chunk that's gone: only a
  // reload can fix it. Chrome, Safari and Firefox word it differently.
  if (/dynamically imported module|importing a module script failed/i.test(text)) {
    return {
      message: "Setlister has been updated since this page opened. Reload to finish registering.",
      action: "reload",
    };
  }
  if (
    typeof code === "string" &&
    (code === "auth/admin-restricted-operation" ||
      code === "auth/operation-not-allowed" ||
      code === "auth/invalid-api-key" ||
      code.startsWith("auth/api-key-not-valid"))
  ) {
    return {
      message: "Organiser sign-in isn’t switched on yet. Let whoever looks after Setlister know.",
      action: "retry",
    };
  }
  return {
    message: "Something went wrong. Try again, or tap the link again later.",
    action: "retry",
  };
}
