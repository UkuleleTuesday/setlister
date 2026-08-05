// "What's new": the app's changelog and the logic that picks what the home
// screen shows. The entries live in whats-new.json — pure data, so the
// "document this feature" PR convention (see AGENTS.md) touches no code — and
// this module stays UI-free like session-index.js: app.js owns all DOM.
//
// Entry dates are ISO YYYY-MM-DD strings. That's data, not a stored formatted
// label: the visible date still renders through Intl in the viewer's locale at
// view time, same rule as session names.

import WHATS_NEW from "./whats-new.json";

export { WHATS_NEW };

// new Date("2026-08-05") parses as UTC midnight, which renders as August 4th
// on phones west of Greenwich — so split the string and build a LOCAL date.
export function entryDate(entry) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(entry?.date || "");
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

// Max-date entry, deliberately ignoring array order: the file's convention is
// newest-first, but a mis-ordered append must never surface stale news.
export function latestEntry(entries = WHATS_NEW) {
  let best = null;
  let bestDate = null;
  for (const entry of entries) {
    const date = entryDate(entry);
    if (date && (!bestDate || date > bestDate)) {
      best = entry;
      bestDate = date;
    }
  }
  return best;
}

// Release notes want a plain date ("5 August"), not the session list's
// "Tonight/Yesterday" register — news doesn't age the way a running night
// does — so this keeps its own formatters rather than importing
// session-index.js. Viewer's locale, year only once it's a different one.
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

export function whatsNewDateLabel(entry, now = new Date()) {
  const date = entryDate(entry);
  if (!date) return "";
  const sameYear = date.getFullYear() === now.getFullYear();
  return (sameYear ? DAY_MONTH_FORMAT : FULL_DATE_FORMAT).format(date);
}
