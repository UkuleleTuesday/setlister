// The session lists (UpNextSection / RequestsSection / BinGroup / Row): the
// gestures, the reorder, votes, the "Next" tag, the groups and export.
import type { Locator, Page } from "@playwright/test";
import { bySong } from "./api.js";
import { expect, storedRowCount, test } from "./fixtures.js";
import { addByName, startSession } from "./steps.js";

const requestRow = (page: Page, title: string) =>
  page.locator("#requests-rows > li").filter({ hasText: title });
const upNextRow = (page: Page, title: string) =>
  page.locator("#upnext-rows > li").filter({ hasText: title });
// A 1x1 PNG: small enough that downscale.ts sends it as is.
const PHOTO = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);
const upNextTitles = (page: Page) => page.locator("#upnext-rows .match-title").allTextContents();

// A horizontal swipe across a card, with pointer events like a thumb's.
async function swipe(page: Page, card: Locator, direction: "left" | "right") {
  const box = (await card.boundingBox())!;
  const y = box.y + box.height / 2;
  const from = box.x + box.width / 2;
  const to = from + (direction === "right" ? 1 : -1) * box.width * 0.45;
  await page.mouse.move(from, y);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(from + ((to - from) * i) / 8, y);
  await page.mouse.up();
}

async function threeQueued(page: Page) {
  await startSession(page);
  await addByName(page, "Jolene", { name: "Alex" });
  await addByName(page, "Hallelujah");
  await addByName(page, "Let It Be");
  for (const title of ["Jolene", "Hallelujah", "Let It Be"]) {
    await requestRow(page, title).getByRole("button", { name: "Move to Up next" }).tap();
  }
  await expect(page.locator("#upnext-rows > li")).toHaveCount(3);
}

test("swipes: right promotes and plays, left bins and demotes", async ({ phone }) => {
  const page = await phone();
  await startSession(page);
  await addByName(page, "Jolene", { name: "Alex" });
  await addByName(page, "Hallelujah");

  await swipe(page, requestRow(page, "Jolene"), "right");
  await expect(upNextRow(page, "Jolene")).toBeVisible();
  await swipe(page, requestRow(page, "Hallelujah"), "left");
  await expect(page.locator("#bin-group")).toContainText("1 binned");

  await swipe(page, upNextRow(page, "Jolene"), "left");
  await expect(requestRow(page, "Jolene")).toBeVisible();
  await swipe(page, requestRow(page, "Jolene"), "right");
  await swipe(page, upNextRow(page, "Jolene"), "right");
  await expect(page.locator("#played-group")).toContainText("1 played");

  // A short drag snaps back and does nothing.
  await addByName(page, "Let It Be");
  const card = requestRow(page, "Let It Be");
  const box = (await card.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2);
  await page.mouse.up();
  await expect(card).toBeVisible();
  await expect(card).not.toHaveClass(/swiping/);
});

test("the running order: Next tag, drag and keyboard reorder", async ({ phone }) => {
  const page = await phone();
  await threeQueued(page);
  expect(await upNextTitles(page)).toEqual([
    "Jolene - Dolly Parton",
    "Hallelujah - Leonard Cohen",
    "Let It Be - The Beatles",
  ]);
  await expect(page.locator("#upnext-rows > li").first()).toHaveClass(/next-up/);
  await expect(page.locator("#upnext-rows .next-tag")).toHaveCount(1);
  await expect(upNextRow(page, "Jolene").locator(".next-tag")).toHaveText("Next");
  await expect(page.locator("#upnext-count")).toHaveText("· 3");

  // Drag Let It Be to the top by its handle.
  const handle = upNextRow(page, "Let It Be").locator(".drag-handle");
  const from = (await handle.boundingBox())!;
  const top = (await upNextRow(page, "Jolene").boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) {
    const y = from.y + from.height / 2 + ((top.y + 4 - (from.y + from.height / 2)) * i) / 10;
    await page.mouse.move(from.x + from.width / 2, y);
  }
  await page.mouse.up();
  await expect
    .poll(() => upNextTitles(page))
    .toEqual(["Let It Be - The Beatles", "Jolene - Dolly Parton", "Hallelujah - Leonard Cohen"]);
  await expect(upNextRow(page, "Let It Be").locator(".next-tag")).toHaveText("Next");

  // Keyboard: Down twice from the top, keeping focus on the moved row.
  await upNextRow(page, "Let It Be").locator(".drag-handle").focus();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await expect
    .poll(() => upNextTitles(page))
    .toEqual(["Jolene - Dolly Parton", "Hallelujah - Leonard Cohen", "Let It Be - The Beatles"]);
  await expect(upNextRow(page, "Let It Be").locator(".drag-handle")).toBeFocused();

  // And it all synced: a reload shows the same order.
  await page.reload();
  await expect
    .poll(() => upNextTitles(page))
    .toEqual(["Jolene - Dolly Parton", "Hallelujah - Leonard Cohen", "Let It Be - The Beatles"]);
});

test("votes toggle, and the pool sorts by them", async ({ phone }) => {
  const page = await phone();
  await startSession(page);
  // Added by this phone, so each starts on its own asker vote: "You".
  await addByName(page, "Jolene", { name: "Alex" });
  await addByName(page, "Hallelujah");
  const jolene = requestRow(page, "Jolene").locator(".vote-button");
  await expect(jolene).toHaveAttribute("aria-pressed", "true");
  await expect(jolene).toHaveAccessibleName("You want this one");

  // Taking Jolene's vote back drops it below Hallelujah (still on 1).
  await jolene.tap();
  await expect(jolene).toHaveAttribute("aria-pressed", "false");
  await expect(jolene).toHaveAccessibleName("I want this one, nobody has yet");
  await expect(page.locator("#requests-rows .match-title").first()).toHaveText(
    "Hallelujah - Leonard Cohen",
  );
  await jolene.tap();
  await expect(jolene).toHaveText("You");
});

test("played and binned groups rescue their rows", async ({ phone }) => {
  const page = await phone();
  await threeQueued(page);
  await upNextRow(page, "Jolene").getByRole("button", { name: "Mark played" }).tap();
  await expect(page.locator("#played-group")).toContainText("1 played");
  // The next tune moves up to the tag.
  await expect(upNextRow(page, "Hallelujah").locator(".next-tag")).toHaveText("Next");

  const toggle = page.locator("#played-group .group-toggle");
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await toggle.tap();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  const played = page.locator("#played-group-rows > li");
  await expect(played).toHaveCount(1);
  await expect(played.first().locator(".row-meta")).toContainText(/played \d/);
  await played.first().getByRole("button", { name: "Mark not played" }).tap();
  await expect(page.locator("#played-group")).toBeHidden();
  await expect(page.locator("#upnext-rows > li")).toHaveCount(3);
});

test("export copies and downloads the night, and goes inert when empty", async ({ phone }) => {
  const page = await phone();
  await startSession(page);
  await expect(page.locator("#copy")).toBeDisabled();
  await expect(page.locator("#download")).toBeDisabled();
  await expect(page.locator("#upnext-empty")).toHaveText(
    "Nothing queued yet. Promote a request from below.",
  );
  await expect(page.locator("#requests-empty")).toHaveText(
    "No requests yet. Snap the board, or add one above.",
  );

  await addByName(page, "Jolene", { name: "Alex" });
  await expect(page.locator("#copy")).toBeEnabled();
  const before = await page.locator("#copy").innerHTML();
  await page.locator("#copy").tap();
  await expect.poll(() => page.locator("#copy").innerHTML()).not.toBe(before);
  await expect.poll(() => page.locator("#copy").innerHTML(), { timeout: 3000 }).toBe(before);

  const download = page.waitForEvent("download");
  await page.locator("#download").tap();
  const file = await download;
  expect(file.suggestedFilename()).toBe("requests.json");
  const body = JSON.parse(
    await (await file.createReadStream()).toArray().then((c) => Buffer.concat(c).toString()),
  );
  expect(body.rows).toHaveLength(1);
  expect(body.rows[0].match.title).toBe("Jolene");
  expect(body.rows[0]).not.toHaveProperty("uid");
});

test("export follows the include-crossed-out setting (#185)", async ({ phone, parseRows }) => {
  // One confident row the board had crossed out: in the night, but not in the
  // export until the setting says so.
  parseRows.current = [
    {
      raw_title: "Jolene",
      raw_page: bySong("Jolene").page,
      crossed_out: true,
      status: "confirmed",
      method: "high_confidence",
      confidence: 0.97,
      match: bySong("Jolene"),
      alternatives: [],
      explanation: "Title and page agree",
    },
  ];
  const page = await phone();
  const id = await startSession(page);
  await page.locator("#photo-input").setInputFiles({
    name: "board.png",
    mimeType: "image/png",
    buffer: PHOTO,
  });
  await expect(requestRow(page, "Jolene")).toContainText("crossed out");
  await expect(page.locator("#copy")).toBeDisabled();
  // Let the row's own push land first, so its snapshot can't redraw the
  // buttons for the setting and hide whether the setting does.
  await expect.poll(() => storedRowCount(id)).toBe(1);
  await page.waitForTimeout(500);

  await page.locator("#settings-toggle").tap();
  await page.locator("#include-crossed").tap();
  await expect(page.locator("#copy")).toBeEnabled();
  await expect(page.locator("#download")).toBeEnabled();
});
