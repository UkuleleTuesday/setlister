import type { Page } from "@playwright/test";
import { bySong } from "./api.js";
import { features } from "../features.js";
import { firebaseConfig } from "../firebase-config.js";
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

  // The camera button opens the OS picker, so feed the hidden input directly.
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
  // A second photo would drop this review (#197).
  await expect(page.locator("#camera-button")).toBeDisabled();
  const confirm = page.locator("#review-confirm");
  await expect(confirm).toHaveText("Add 2 to Requests");
  const rows = page.locator("#review-rows > li");

  await rows.nth(0).getByRole("button", { name: "Remove row" }).tap();
  await expect(rows.nth(0)).toHaveClass(/removed/);
  await expect(confirm).toHaveText("Add 1 to Requests");
  await rows.nth(0).getByRole("button", { name: "Restore row" }).tap();
  await expect(confirm).toHaveText("Add 2 to Requests");

  await rows.nth(0).locator(".warn-icon").tap();
  const lightbox = page.locator("#photo-lightbox");
  await expect(lightbox).toBeVisible();
  await expect(page.locator("#photo-lightbox-img")).toHaveAttribute("src", /^blob:/);
  await lightbox.tap();
  await expect(lightbox).toBeHidden();

  const picker = rows.nth(1).getByRole("combobox");
  await picker.fill("jol");
  await page.getByRole("option", { name: /Jolene - Dolly Parton/ }).tap();
  await expect(rows.nth(1).locator(".match-title")).toHaveText("Jolene - Dolly Parton");
  // Followed by the parser's confidence, e.g. "(50%)".
  await expect(rows.nth(1).locator(".explanation")).toHaveText(/^Manually selected/);
  await expect(rows.nth(1).getByRole("button", { name: "Change song for “Jolly”" })).toBeVisible();

  await confirm.tap();
  await expect(review).toBeHidden();
  await expect(page.locator("#camera-button")).toBeEnabled();
  const requests = page.locator("#requests-rows").getByRole("listitem");
  await expect(requests.filter({ hasText: "Lean on Me" })).toBeVisible();
  await expect(requests.filter({ hasText: "Jolene" })).toBeVisible();
});

// An unlisted night, so it doesn't stop New session.
async function seedUnlistedSession(id: string) {
  const now = { timestampValue: new Date().toISOString() };
  const empty = { arrayValue: {} };
  const res = await fetch(
    `http://127.0.0.1:8081/v1/projects/${firebaseConfig.projectId}/databases/(default)/documents/sessions?documentId=${id}`,
    {
      method: "POST",
      headers: { Authorization: "Bearer owner", "Content-Type": "application/json" },
      body: JSON.stringify({
        fields: {
          v: { integerValue: "1" },
          rows: { mapValue: {} },
          upNextOrder: empty,
          requestsOrder: empty,
          edition: { nullValue: null },
          createdBy: { stringValue: "Alex" },
          listed: { booleanValue: false },
          votes: { mapValue: {} },
          createdAt: now,
          updatedAt: now,
        },
      }),
    },
  );
  if (!res.ok) throw new Error(`Couldn't seed the session (${res.status})`);
}

// Back held down can skip straight from one night to another, past home.
test("a scan still running when you switch nights lands in neither", async ({
  phone,
  parseRows,
}) => {
  const other = "quiet-banjo";
  await seedUnlistedSession(other);
  const page = await phone();
  await page.goto(`/?session=${other}`);
  // Joined, or the join lands after the tap and reopens the night.
  await expect(
    page.getByRole("button", { name: `Sharing session ${other}. Tap for options` }),
  ).toBeVisible();
  await page.locator("#back-home").tap();
  await expect(page.locator("#session-list-status")).toBeHidden();
  await page.locator("#new-session").tap();
  await page.locator("#new-session-start").tap();
  await expect(page).not.toHaveURL(new RegExp(`session=${other}`));
  await expect(page.locator("#session-view")).toBeVisible();
  const scanned = new URL(page.url()).searchParams.get("session")!;

  let release!: (rows: unknown[]) => void;
  parseRows.current = { release: new Promise((resolve) => (release = resolve)) };
  await snap(page);
  await expect(page.locator("#scan-overlay")).toBeVisible();

  await page.evaluate(() => history.go(-2));
  await expect(page).toHaveURL(new RegExp(`session=${other}$`));
  await expect(page.locator("#scan-overlay")).toBeHidden();
  release([parsed("Lean on Me", "confirmed"), parsed("Jolene", "needs_review")]);

  // Anything the scan let through would land before this does.
  await addByName(page, "Hallelujah", { name: "Alex" });
  await expect.poll(() => storedRowCount(other)).toBe(1);
  await expect(page.locator("#requests-rows").getByRole("listitem")).toHaveCount(1);
  await expect(page.locator("#review")).toBeHidden();
  expect(await storedRowCount(scanned)).toBe(0);
});

// Row.svelte has no removed state: the lists rely on this.
test("a row removed in review never reaches the night", async ({ phone, parseRows }) => {
  const page = await phone();
  const id = await startSession(page);
  parseRows.current = [parsed("Lean on Me", "needs_review"), parsed("Jolene", "conflict")];
  await snap(page);

  const rows = page.locator("#review-rows > li");
  await rows.nth(0).getByRole("button", { name: "Remove row" }).tap();
  await page.locator("#review-confirm").tap();

  const requests = page.locator("#requests-rows").getByRole("listitem");
  await expect(requests).toHaveCount(1);
  await expect(requests.filter({ hasText: "Jolene" })).toBeVisible();
  await expect.poll(() => storedRowCount(id)).toBe(1);
});

test("review offers runner-up songs only where the reader wasn't sure", async ({
  phone,
  parseRows,
}) => {
  test.skip(!features.reviewSuggestions, "features.reviewSuggestions is off");
  const page = await phone();
  await startSession(page);
  const runnerUp = (title: string) => ({ entry: bySong(title), title_score: 60, page_delta: 0 });
  parseRows.current = [
    // Clean: straight to Requests, never offered alternatives.
    { ...parsed("Here Comes the Sun", "confirmed"), alternatives: [runnerUp("Lean on Me")] },
    {
      ...parsed("Hallelujah", "conflict"),
      alternatives: [runnerUp("Jolene"), runnerUp("Let It Be")],
    },
    parsed("Lean on Me", "needs_review"),
  ];
  await snap(page);

  const rows = page.locator("#review-rows > li");
  await expect(rows).toHaveCount(2);
  const conflict = rows.filter({ hasText: "Hallelujah" });
  await expect(conflict.locator(".chips button")).toHaveCount(2);
  await expect(rows.filter({ hasText: "Lean on Me" }).locator(".chips")).toHaveCount(0);

  await conflict.getByRole("button", { name: "Change to Jolene - Dolly Parton, page 6" }).tap();
  const corrected = rows.nth(0);
  await expect(corrected.locator(".match-title")).toHaveText("Jolene - Dolly Parton");
  await expect(corrected.locator(".explanation")).toHaveText(/^Manually selected/);
  await expect(corrected.locator(".chips")).toHaveCount(0);

  await expect.poll(() => storedRowCount(new URL(page.url()).searchParams.get("session")!)).toBe(1);
  await page.locator("#review-confirm").tap();
  await expect(page.locator("#requests-rows > li")).toHaveCount(3);
  await expect(page.locator("#requests-rows .chips")).toHaveCount(0);
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

  page.once("dialog", (dialog) => dialog.dismiss());
  await page.locator("#review-cancel").tap();
  await expect(page.locator("#review")).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await page.locator("#review-cancel").tap();
  await expect(page.locator("#review")).toBeHidden();
  // Empty #add has no height, so check the flag, not visibility.
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

  parseRows.current = "hang";
  await snap(page);
  await expect(page.locator("#scan-overlay")).toBeVisible();
  await expect(page.locator("#scan-status-text")).toHaveText("Reading the board…");
  await expect(page.locator("#camera-button")).toBeDisabled();
  await page.locator("#scan-cancel").tap();
  await expect(page.locator("#scan-result")).toHaveText("Scan cancelled. Nothing was added.");
  await expect(page.locator("#preview-wrap")).toBeHidden();

  allowConsole.push(/status of 502/);
  parseRows.current = { status: 502, detail: "Couldn't load the songbook" };
  await snap(page);
  await expect(page.locator("#error")).toHaveText("Couldn't load the songbook");
  await expect(page.locator("#preview-wrap")).toBeVisible();
  await expect(page.locator("#scan-overlay")).toBeHidden();
  await expect(page.locator("#scan-result")).toBeHidden();
});

test("leaving the session drops a review in progress", async ({ phone, parseRows }) => {
  parseRows.current = [parsed("Lean on Me", "needs_review")];
  const page = await phone();
  await startSession(page);
  await snap(page);
  await expect(page.locator("#review")).toBeVisible();

  await page.locator("#back-home").tap();
  await expect(page.locator("#home")).toBeVisible();
  await page.locator("#next-session-open").tap();
  await expect(page.locator("#session-view")).toBeVisible();
  await expect(page.locator("#review")).toBeHidden();
  await expect(page.locator("#requests-rows").getByRole("listitem")).toHaveCount(0);
});
