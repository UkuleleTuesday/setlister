// The photo flow with the vision call stubbed (e2e/api.ts): confident matches
// go straight into Requests, flagged ones wait in the review sheet.
import type { Page } from "@playwright/test";
import { bySong } from "./api.js";
import { expect, storedRowCount, test } from "./fixtures.js";
import { addByName, startSession } from "./steps.js";

// A 1x1 PNG: small enough that downscale.ts sends it as is.
const PHOTO = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

test("a scan adds confident rows and reviews the rest", async ({ phone, parseRows }) => {
  parseRows.current = [
    {
      raw_title: "Here comes the sun",
      raw_page: 42,
      status: "confirmed",
      method: "high_confidence",
      confidence: 0.97,
      match: bySong("Here Comes the Sun"),
      alternatives: [],
      explanation: "Title and page agree",
    },
    {
      raw_title: "Lean on",
      raw_page: null,
      status: "needs_review",
      method: "title_only",
      confidence: 0.61,
      match: bySong("Lean on Me"),
      alternatives: [],
      explanation: "Title only, no page to confirm it",
    },
  ];
  const page = await phone();
  const id = await startSession(page);

  // The camera button opens the OS picker; hand the hidden input a file instead.
  await page.locator("#photo-input").setInputFiles({
    name: "board.png",
    mimeType: "image/png",
    buffer: PHOTO,
  });

  const review = page.locator("#review");
  await expect(review).toBeVisible();
  await expect(page.locator("#review-rows").getByRole("listitem")).toHaveCount(1);
  await expect(page.locator("#review-confirm")).toHaveText("Add 1 to Requests");
  // Wait for the confident row's push to land: confirming between that push
  // and its snapshot loses the reviewed row (#153). Drop once that's fixed.
  await expect.poll(() => storedRowCount(id)).toBe(1);
  await page.locator("#review-confirm").tap();
  await expect(review).toBeHidden();

  const requests = page.locator("#requests-rows").getByRole("listitem");
  await expect(requests).toHaveCount(2);
  await expect(requests.filter({ hasText: "Here Comes the Sun" })).toBeVisible();
  await expect(requests.filter({ hasText: "Lean on Me" })).toBeVisible();
});

// A parsed row as /api/parse sends it.
function parsed(title: string, status: string, raw = title) {
  const match = status === "unmatched" ? null : bySong(title);
  return {
    raw_title: raw,
    raw_page: match?.page ?? null,
    status,
    method: status === "confirmed" ? "high_confidence" : "title_only",
    confidence: status === "confirmed" ? 0.95 : 0.5,
    match,
    alternatives: [],
    explanation: status === "confirmed" ? "Title and page agree" : "Needs a check",
  };
}

const snap = (page: Page) =>
  page.locator("#photo-input").setInputFiles({
    name: "board.png",
    mimeType: "image/png",
    buffer: PHOTO,
  });

test("a scan with nothing to check just says what it added", async ({ phone, parseRows }) => {
  const page = await phone();
  await startSession(page);
  await addByName(page, "Jolene", { name: "Alex" });
  parseRows.current = [parsed("Jolene", "confirmed"), parsed("Let It Be", "confirmed")];

  await snap(page);
  await expect(page.locator("#scan-result")).toHaveText(
    "Added 1 from the board · skipped 1 already listed",
  );
  await expect(page.locator("#review")).toBeHidden();
  await expect(page.locator("#preview-wrap")).toBeHidden();
  await expect(page.locator("#requests-rows").getByRole("listitem")).toHaveCount(2);
});

test("review: remove and restore, correct a song, check the photo", async ({
  phone,
  parseRows,
}) => {
  const page = await phone();
  await startSession(page);
  parseRows.current = [parsed("Lean on Me", "needs_review"), parsed("x", "unmatched", "Jolly")];
  await snap(page);

  const review = page.locator("#review");
  await expect(review).toBeVisible();
  await expect(page.locator("#add")).toBeHidden();
  const confirm = page.locator("#review-confirm");
  await expect(confirm).toHaveText("Add 2 to Requests");
  const rows = page.locator("#review-rows > li");

  // Remove and restore.
  await rows.nth(0).getByRole("button", { name: "Remove row" }).tap();
  await expect(rows.nth(0)).toHaveClass(/removed/);
  await expect(confirm).toHaveText("Add 1 to Requests");
  await rows.nth(0).getByRole("button", { name: "Restore row" }).tap();
  await expect(confirm).toHaveText("Add 2 to Requests");

  // The flagged match's warning opens the photo; a tap anywhere closes it.
  await rows.nth(0).locator(".warn-icon").tap();
  const lightbox = page.locator("#photo-lightbox");
  await expect(lightbox).toBeVisible();
  await expect(page.locator("#photo-lightbox-img")).toHaveAttribute("src", /^blob:/);
  await lightbox.tap();
  await expect(lightbox).toBeHidden();

  // The unmatched row opens with its picker: type, pick, and it's confirmed.
  const picker = rows.nth(1).getByRole("combobox");
  await picker.fill("jol");
  await page.getByRole("option", { name: /Jolene - Dolly Parton/ }).tap();
  await expect(rows.nth(1).locator(".match-title")).toHaveText("Jolene - Dolly Parton");
  // (It keeps the parser's confidence, as it always has: "Manually selected (50%)".)
  await expect(rows.nth(1).locator(".explanation")).toHaveText(/^Manually selected/);
  // Confirmed now, so the picker folds back behind "Change song".
  await expect(rows.nth(1).getByRole("button", { name: "Change song for “Jolly”" })).toBeVisible();

  await confirm.tap();
  await expect(review).toBeHidden();
  const requests = page.locator("#requests-rows").getByRole("listitem");
  await expect(requests.filter({ hasText: "Lean on Me" })).toBeVisible();
  await expect(requests.filter({ hasText: "Jolene" })).toBeVisible();
});

test("a flagged copy of a listed song arrives removed, and cancel asks first", async ({
  phone,
  parseRows,
}) => {
  const page = await phone();
  await startSession(page);
  await addByName(page, "Jolene", { name: "Alex" });
  parseRows.current = [parsed("Jolene", "needs_review"), parsed("Hallelujah", "conflict")];
  await snap(page);

  const first = page.locator("#review-rows > li").nth(0);
  await expect(first).toHaveClass(/removed/);
  await expect(first.locator(".dup-note")).toHaveText("Already in Requests");
  await expect(page.locator("#review-confirm")).toHaveText("Add 1 to Requests");

  // Dismissing the prompt keeps the review; accepting discards it.
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.locator("#review-cancel").tap();
  await expect(page.locator("#review")).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await page.locator("#review-cancel").tap();
  await expect(page.locator("#review")).toBeHidden();
  // Back to the camera (empty #add has no height, so check the flag itself).
  await expect(page.locator("#add")).not.toHaveAttribute("hidden");
  await expect(page.locator("#requests-rows").getByRole("listitem")).toHaveCount(1);
});

test("a scan can be cancelled, and a server error says why", async ({
  phone,
  parseRows,
  allowConsole,
}) => {
  const page = await phone();
  await startSession(page);

  // A scan that never answers: Cancel is the way out.
  parseRows.current = "hang";
  await snap(page);
  await expect(page.locator("#scan-overlay")).toBeVisible();
  await expect(page.locator("#scan-status-text")).toHaveText("Reading the board…");
  await page.locator("#scan-cancel").tap();
  await expect(page.locator("#scan-result")).toHaveText("Scan cancelled. Nothing was added.");
  await expect(page.locator("#preview-wrap")).toBeHidden();

  // A server error keeps the photo up beside the API's own wording.
  allowConsole.push(/status of 502/);
  parseRows.current = { status: 502, detail: "Couldn't load the songbook" };
  await snap(page);
  await expect(page.locator("#error")).toHaveText("Couldn't load the songbook");
  await expect(page.locator("#preview-wrap")).toBeVisible();
  await expect(page.locator("#scan-overlay")).toBeHidden();
  await expect(page.locator("#scan-result")).toBeHidden();
});
