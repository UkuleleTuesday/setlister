// Stands in for utrequests/api.py so the suite needs neither the API nor
// Gemini. Shapes mirror utrequests/models.py.
import type { BrowserContext, Route } from "@playwright/test";
import type { CatalogueEntry } from "../types.js";

export const EDITION = { id: "current", title: "Current", description: "" };

function song(page: number, title: string, artist: string): CatalogueEntry {
  return {
    id: `${title}-${artist}`.toLowerCase().replace(/\W+/g, "-"),
    display: `${title} - ${artist}`,
    title,
    artist,
    page,
  };
}

export const CATALOGUE: CatalogueEntry[] = [
  song(4, "9 to 5", "Dolly Parton"),
  song(5, "Hallelujah", "Leonard Cohen"),
  song(6, "Jolene", "Dolly Parton"),
  song(9, "Let It Be", "The Beatles"),
  song(42, "Here Comes the Sun", "The Beatles"),
  song(55, "Lean on Me", "Bill Withers"),
];

export const bySong = (title: string) => CATALOGUE.find((e) => e.title === title)!;

/** What /api/parse answers: rows, an error, or "hang" (the cancel path). */
export type ParseRows = unknown[] | { status: number; detail: string } | "hang";

const json = (route: Route, body: unknown) =>
  route.fulfill({
    status: 200,
    contentType: "application/json",
    // The real API is cross-origin too (see API_BASE in api.ts).
    headers: { "access-control-allow-origin": "*" },
    body: JSON.stringify(body),
  });

export async function stubApi(context: BrowserContext, parseRows: () => ParseRows) {
  await context.route("http://127.0.0.1:8080/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/editions") return json(route, { editions: [EDITION] });
    if (path === "/api/catalogue") {
      return json(route, {
        edition: EDITION,
        catalogue_generated_at: "2026-11-24T00:00:00Z",
        catalogue: CATALOGUE,
      });
    }
    if (path === "/api/parse") {
      const reply = parseRows();
      // Left unanswered: the page's own abort is what ends it.
      if (reply === "hang") return;
      if (!Array.isArray(reply)) {
        return route.fulfill({
          status: reply.status,
          contentType: "application/json",
          headers: { "access-control-allow-origin": "*" },
          body: JSON.stringify({ detail: reply.detail }),
        });
      }
      return json(route, {
        edition: EDITION,
        catalogue_generated_at: "2026-11-24T00:00:00Z",
        rows: reply,
        catalogue: CATALOGUE,
      });
    }
    return route.fulfill({ status: 404, body: "{}" });
  });
}
