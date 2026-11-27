import type { CatalogueEntry, Row } from "../types.js";

/** `display` defaults to the title, as the API's does. */
export function song(fields: Partial<CatalogueEntry> = {}): CatalogueEntry {
  const title = fields.title ?? "";
  return { id: "", display: title, title, page: 0, ...fields };
}

/** Shaped like an add by name (adds.ts). */
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
