// The night as it leaves the app: the plain-text setlist the copy button puts
// on the clipboard, and the JSON the download button saves. Both cover both
// lists, running order first: Up next, then the requests in the pool.

import type { Edition, Row } from "./types.js";

/** What gets exported: not removed, and crossed-out only when asked for. */
export function exportedRows(upNext: Row[], requests: Row[], includeCrossed: boolean): Row[] {
  return [...upNext, ...requests].filter(
    (row) => !row.removed && (includeCrossed || !row.crossed_out),
  );
}

/** One line per tune: "Jolene - Dolly Parton (p.12)", or "?? <raw>" unmatched. */
export function exportText(rows: Row[]): string {
  return rows
    .map((row) =>
      row.match
        ? `${row.match.display} (p.${row.match.page})`
        : `?? ${row.raw_title}${row.raw_page ? ` (p.${row.raw_page})` : ""}`,
    )
    .join("\n");
}

/** An exported row: a row without the app's own UI and provenance fields. */
export type ExportedRow = Omit<Row, "uid" | "source" | "addedBy" | "removed" | "played" | "binned">;

// `played` and `binned` are live gig-tracking state, not part of the setlist
// payload; the times they were set (`playedAt` / `binnedAt`) are exported as
// the night's record of what got played when. A row carrying `playedAt` is a
// played row.
function stripInternal(row: Row): ExportedRow {
  const { uid, source, addedBy, removed, played, binned, ...rest } = row;
  return rest;
}

/** The download's `requests.json`. */
export function exportPayload(edition: Edition | null, generatedAt: string, rows: Row[]) {
  return {
    edition,
    catalogue_generated_at: generatedAt,
    rows: rows.map(stripInternal),
  };
}
