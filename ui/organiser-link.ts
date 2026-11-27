// `#organise=<key>` (#151): the key is in the hash so it never reaches server logs.

// The real key is 32 hex chars; this only rejects garbage.
const MAX_KEY_LENGTH = 200;

export function parseOrganiseKey(hash: string): string | null {
  const key = new URLSearchParams(hash.replace(/^#/, "")).get("organise")?.trim();
  return key && key.length <= MAX_KEY_LENGTH ? key : null;
}

export function stripHash(href: string): string {
  const url = new URL(href);
  url.hash = "";
  return url.toString();
}

export function parseOrganiseInput(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  if (trimmed.includes("#")) return parseOrganiseKey(trimmed.slice(trimmed.indexOf("#")));
  return /^[A-Za-z0-9_-]{8,200}$/.test(trimmed) ? trimmed : null;
}

export interface RegistrationError {
  message: string;
  action: "retry" | "reload";
}

export class TimeoutError extends Error {
  constructor() {
    super("Timed out");
    this.name = "TimeoutError";
  }
}

// Firestore never fails an offline write; it waits.
export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new TimeoutError()), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

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
  // A tab older than the last deploy: its chunks are gone. Wording varies by browser.
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
