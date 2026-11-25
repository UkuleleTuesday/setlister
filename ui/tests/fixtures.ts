// Typed builders for test data: each test states only the fields it is about,
// and the builder fills the rest with what the app itself writes.
import type { CatalogueEntry, Row } from "../types.js";

/** A songbook entry. `display` defaults to the title, as the API's does. */
export function song(fields: Partial<CatalogueEntry> = {}): CatalogueEntry {
  const title = fields.title ?? "";
  return { id: "", display: title, title, page: 0, ...fields };
}

/** A list row, shaped like a manual add (app.js addManualEntry). */
export function row(fields: Partial<Row> = {}): Row {
  return {
    uid: "",
    raw_title: "",
    status: "confirmed",
    method: "none",
    confidence: 1,
    match: null,
    alternatives: [],
    explanation: "",
    ...fields,
  };
}
