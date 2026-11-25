// The photo flow with the vision call stubbed (e2e/api.ts): confident matches
// go straight into Requests, flagged ones wait in the review sheet.
import { bySong } from "./api.js";
import { expect, test } from "./fixtures.js";
import { startSession } from "./steps.js";

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
  await startSession(page);

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
  await page.locator("#review-confirm").tap();
  await expect(review).toBeHidden();

  const requests = page.locator("#requests-rows").getByRole("listitem");
  await expect(requests).toHaveCount(2);
  await expect(requests.filter({ hasText: "Here Comes the Sun" })).toBeVisible();
  await expect(requests.filter({ hasText: "Lean on Me" })).toBeVisible();
});
