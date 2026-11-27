import type { CatalogueEntry, Edition } from "./types.js";

export const API_BASE = ["localhost", "127.0.0.1"].includes(location.hostname)
  ? "http://127.0.0.1:8080"
  : "https://europe-west1-songbook-generator.cloudfunctions.net/setlister-api";

/** `/api/catalogue`. */
export interface CatalogueResponse {
  edition: Edition;
  catalogue: CatalogueEntry[];
  catalogue_generated_at: string;
}
