// "What's new": the app's changelog and the logic that picks what the home
// screen shows. The entries live in whats-new.json — pure data, so the
// "document this feature" PR convention (see AGENTS.md) touches no code — and
// this module stays UI-free like session-index.ts: app.js owns all DOM.
//
// Entry dates are ISO YYYY-MM-DD strings. That's data, not a stored formatted
// label: the visible date still renders through Intl in the viewer's locale at
// view time, same rule as session names.

import whatsNew from "./whats-new.json";

/** One day's release note. `date` is ISO YYYY-MM-DD, never a formatted label. */
export interface WhatsNewEntry {
  date: string;
  items: string[];
}

// Declared rather than inferred from the JSON, so a malformed entry fails
// typecheck here (whats-new.test.ts also enforces the shape at runtime).
const WHATS_NEW: WhatsNewEntry[] = whatsNew;

export { WHATS_NEW };

// new Date("2026-08-05") parses as UTC midnight, which renders as August 4th
// on phones west of Greenwich — so split the string and build a LOCAL date.
export function entryDate(entry: Partial<WhatsNewEntry> | null | undefined): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(entry?.date || "");
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

// Max-date entry, deliberately ignoring array order: the file's convention is
// newest-first, but a mis-ordered append must never surface stale news.
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

// The whole history, newest first — what the footer link opens. Sorts by date
// rather than trusting array order, and drops undated entries, for the same
// reason latestEntry does: a mis-ordered or malformed append must never lead.
export function sortedEntries<T extends Partial<WhatsNewEntry>>(
  entries: T[] = WHATS_NEW as T[],
): T[] {
  // Filtered to dated entries first, so both dates below are non-null.
  return entries
    .filter(entryDate)
    .sort((a, b) => entryDate(b)!.getTime() - entryDate(a)!.getTime());
}

// Release notes want a plain date ("5 August"), not the session list's
// "Tonight/Yesterday" register — news doesn't age the way a running night
// does — so this keeps its own formatters rather than importing
// session-index.ts. Viewer's locale, year only once it's a different one.
// `now` is injectable so tests can pin the clock.
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
