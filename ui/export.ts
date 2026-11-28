import type { Edition, Row } from "./types.js";

export function exportedRows(upNext: Row[], requests: Row[]): Row[] {
  return [...upNext, ...requests];
}

export function exportText(rows: Row[]): string {
  return rows
    .map((row) =>
      row.match
        ? `${row.match.display} (p.${row.match.page})`
        : `?? ${row.raw_title}${row.raw_page ? ` (p.${row.raw_page})` : ""}`,
    )
    .join("\n");
}

export type ExportedRow = Omit<Row, "uid" | "source" | "addedBy" | "removed" | "played" | "binned">;

// The flags are live state; their times stay, as the night's record.
function stripInternal(row: Row): ExportedRow {
  const { uid, source, addedBy, removed, played, binned, ...rest } = row;
  return rest;
}

export function exportPayload(edition: Edition | null, generatedAt: string, rows: Row[]) {
  return {
    edition,
    catalogue_generated_at: generatedAt,
    rows: rows.map(stripInternal),
  };
}
