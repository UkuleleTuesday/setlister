import whatsNew from "./whats-new.json";

/** `date` is ISO YYYY-MM-DD, never a formatted label. */
export interface WhatsNewEntry {
  date: string;
  items: string[];
}

// Declared, not inferred, so a malformed entry fails typecheck.
const WHATS_NEW: WhatsNewEntry[] = whatsNew;

export { WHATS_NEW };

// new Date("2026-08-05") parses as UTC midnight, which renders as August 4th
// on phones west of Greenwich, so split the string and build a LOCAL date.
export function entryDate(entry: Partial<WhatsNewEntry> | null | undefined): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(entry?.date || "");
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

export function latestEntry<T extends Partial<WhatsNewEntry>>(
  entries: T[] = WHATS_NEW as T[],
): T | null {
  let best: T | null = null;
  let bestDate: Date | null = null;
  for (const entry of entries) {
    const date = entryDate(entry);
    if (date && (!bestDate || date > bestDate)) {
      best = entry;
      bestDate = date;
    }
  }
  return best;
}

export function sortedEntries<T extends Partial<WhatsNewEntry>>(
  entries: T[] = WHATS_NEW as T[],
): T[] {
  return entries
    .filter(entryDate)
    .sort((a, b) => entryDate(b)!.getTime() - entryDate(a)!.getTime());
}

// A plain date, not session-index.ts's "Tonight/Yesterday": news doesn't age
// the way a running night does.
const DAY_MONTH_FORMAT = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  month: "long",
});
const FULL_DATE_FORMAT = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  month: "long",
  year: "numeric",
});

export function whatsNewDateLabel(
  entry: Partial<WhatsNewEntry> | null | undefined,
  now = new Date(),
): string {
  const date = entryDate(entry);
  if (!date) return "";
  const sameYear = date.getFullYear() === now.getFullYear();
  return (sameYear ? DAY_MONTH_FORMAT : FULL_DATE_FORMAT).format(date);
}

// The last-seen entry's ISO date retires the home banner, so shipping a newer
// entry revives it with nothing to migrate.
export const WHATS_NEW_SEEN_KEY = "setlister.whatsNew.v1";

// With storage blocked (private mode) the banner shows every visit.
export function readWhatsNewSeen(): string | null {
  try {
    return localStorage.getItem(WHATS_NEW_SEEN_KEY);
  } catch {
    return null;
  }
}

export function writeWhatsNewSeen(date: string): void {
  try {
    localStorage.setItem(WHATS_NEW_SEEN_KEY, date);
  } catch {
    /* best-effort: the banner just returns next visit */
  }
}
