// The "What's new" sheet (WhatsNewSheet.svelte): the home banner announces
// the latest entry once, the footer link opens the whole archive, and every
// way out works on a phone.
import WHATS_NEW from "../whats-new.json" with { type: "json" };
import { expect, test } from "./fixtures.js";

// Newest first, as the sheet shows it (ISO dates sort as strings).
const NEWEST = [...WHATS_NEW].sort((a, b) => b.date.localeCompare(a.date))[0];

test("the banner shows the latest entry once, then retires", async ({ phone }) => {
  const page = await phone();
  await page.goto("/");

  const banner = page.locator("#whats-new-banner");
  await banner.tap();
  const sheet = page.locator("#whats-new-sheet");
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole("heading", { name: "What’s new" })).toBeVisible();
  // An announcement: the latest entry alone.
  await expect(sheet.locator(".whats-new-entry")).toHaveCount(1);

  await page.locator("#whats-new-close").tap();
  await expect(sheet).toBeHidden();
  // Opening is seeing: the banner is gone, and stays gone on the next visit.
  await expect(banner).toBeHidden();
  await page.reload();
  await expect(page.locator("#whats-new-open")).toBeVisible();
  await expect(banner).toBeHidden();
});

test("the footer link opens the archive, and a backdrop tap closes it", async ({ phone }) => {
  const page = await phone();
  await page.goto("/");

  await page.locator("#whats-new-open").tap();
  const sheet = page.locator("#whats-new-sheet");
  await expect(sheet).toBeVisible();
  await expect(sheet.locator(".whats-new-entry")).toHaveCount(WHATS_NEW.length);
  await expect(sheet.locator(".whats-new-items li").first()).toHaveText(NEWEST.items[0]);

  // Tap the backdrop, well clear of the card.
  await sheet.tap({ position: { x: 8, y: 8 } });
  await expect(sheet).toBeHidden();

  // A tap inside the card doesn't close it.
  await page.locator("#whats-new-open").tap();
  await sheet.locator("#whats-new-title").tap();
  await expect(sheet).toBeVisible();
});
