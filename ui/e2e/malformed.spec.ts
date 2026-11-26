// A session doc with bad entries in it (#157): the rules only check its
// top-level keys, so one malformed row or edition must cost that entry, not
// the night, on every phone. The fixture fails the test on any console error.
import type { Page } from "@playwright/test";
import { firebaseConfig } from "../firebase-config.js";
import { NAME_RESET_KEY, NAME_RESET_ROUND } from "../name-reset.js";
import { bySong } from "./api.js";
import { expect, storedRowCount, test } from "./fixtures.js";
import { addByName, startSession } from "./steps.js";

// The emulator's REST API with its "owner" rules bypass, as in fixtures.ts:
// it only exists locally.
const DOC = (id: string) =>
  `http://127.0.0.1:8081/v1/projects/${firebaseConfig.projectId}/databases/(default)/documents/sessions/${id}`;
const OWNER = { Authorization: "Bearer owner" };

// Firestore REST values for the bad entries.
const str = (stringValue: string) => ({ stringValue });
const map = (fields: Record<string, unknown>) => ({ mapValue: { fields } });
const BAD = {
  "rows.gone": { nullValue: null },
  "rows.text": str("Hey Ya"),
  "rows.moved": map({ uid: str("elsewhere"), raw_title: str("Creep") }),
  "rows.odd": map({
    uid: str("odd"),
    raw_title: { integerValue: "42" },
    status: str("unmatched"),
    alternatives: map({ entry: str("Creep") }),
  }),
  "rows.alts": map({
    uid: str("alts"),
    raw_title: str("Let It Be"),
    status: str("needs_review"),
    alternatives: { arrayValue: { values: [{ nullValue: null }, map({ title_score: str("x") })] } },
  }),
  edition: map({ id: { integerValue: "7" } }),
};

// Writes BAD over the session doc, leaving its other fields alone.
async function corrupt(id: string) {
  const mask = Object.keys(BAD)
    .map((path) => `updateMask.fieldPaths=${path}`)
    .join("&");
  const rows: Record<string, unknown> = {};
  const fields: Record<string, unknown> = { rows: map(rows) };
  for (const [path, value] of Object.entries(BAD)) {
    if (path.startsWith("rows.")) rows[path.slice("rows.".length)] = value;
    else fields[path] = value;
  }
  const res = await fetch(`${DOC(id)}?${mask}`, {
    method: "PATCH",
    headers: { ...OWNER, "Content-Type": "application/json" },
    body: JSON.stringify({ fields }),
  });
  if (!res.ok) throw new Error(`Couldn't corrupt the session (${res.status})`);
}

// The stored row keys and edition, as the emulator holds them.
async function stored(id: string) {
  const res = await fetch(DOC(id), { headers: OWNER });
  const doc = (await res.json()) as {
    fields: { rows: { mapValue: { fields?: object } }; edition: unknown };
  };
  return { rows: Object.keys(doc.fields.rows.mapValue.fields ?? {}), edition: doc.fields.edition };
}

// Saved state from a build that let the same kind of entry through, with
// alternative suggestions on so the chips render. The name amnesty is marked
// done, as on any phone that has used the app since.
async function withBadSavedState(page: Page) {
  await page.addInitScript(
    ([key, round]) => localStorage.setItem(key, round),
    [NAME_RESET_KEY, NAME_RESET_ROUND],
  );
  await page.addInitScript(() => {
    localStorage.setItem(
      "setlister.v1",
      JSON.stringify({
        upNext: [null, "Hey Ya"],
        requests: [],
        edition: { id: 7 },
        settings: { showSuggestions: true },
      }),
    );
  });
}

test("bad rows and a bad edition cost those entries, not the night", async ({ phone }) => {
  const organiser = await phone();
  const id = await startSession(organiser);
  await addByName(organiser, "Jolene", { name: "Alex" });
  await expect.poll(() => storedRowCount(id)).toBe(1);
  await corrupt(id);

  // The organiser takes the bad snapshot live; a fresh phone opens it cold.
  const rows = (page: Page) => page.locator("#requests-rows > li");
  await expect(rows(organiser).filter({ hasText: "Let It Be" })).toBeVisible();
  const other = await phone();
  await withBadSavedState(other);
  await other.goto(`/?session=${id}&mode=full`);
  await expect(rows(other).filter({ hasText: "Jolene" })).toBeVisible();
  await expect(rows(other).filter({ hasText: "Let It Be" })).toBeVisible();
  await expect(rows(other)).toHaveCount(3); // Jolene, alts, odd

  // The room sees the same, and the songbook still opens and adds.
  const room = await phone();
  await room.goto(`/?session=${id}&mode=request`);
  await expect(rows(room).filter({ hasText: "Jolene" })).toBeVisible();
  await addByName(other, "Hallelujah", { name: "Sam" });
  await expect(rows(other).filter({ hasText: bySong("Hallelujah").title })).toBeVisible();

  // A full-app push deleted what nobody could render, and only that.
  await expect.poll(async () => (await stored(id)).rows.length).toBe(4);
  const after = await stored(id);
  expect(after.rows).toEqual(expect.arrayContaining(["alts", "odd"]));
  expect(after.edition).toEqual({ nullValue: null });
});
