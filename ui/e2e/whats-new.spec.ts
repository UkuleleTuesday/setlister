import WHATS_NEW from "../whats-new.json" with { type: "json" };
import { expect, test } from "./fixtures.js";

const NEWEST = [...WHATS_NEW].sort((a, b) => b.date.localeCompare(a.date))[0];

test("the banner shows the latest entry once, then retires", async ({ phone }) => {
  const page = await phone();
  await page.goto("/");

  const banner = page.locator("#whats-new-banner");
  await banner.tap();
  const sheet = page.locator("#whats-new-sheet");
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole("heading", { name: "What’s new" })).toBeVisible();
  await expect(sheet.locator(".whats-new-entry")).toHaveCount(1);

  await page.locator("#whats-new-close").tap();
  await expect(sheet).toBeHidden();
  await expect(banner).toBeHidden();
  await page.reload();
  await expect(page.locator("#whats-new-open")).toBeVisible();
  await expect(banner).toBeHidden();
});

test("the footer link opens the archive; a backdrop tap closes it, a card tap doesn't", async ({
  phone,
}) => {
  const page = await phone();
  await page.goto("/");

  await page.locator("#whats-new-open").tap();
  const sheet = page.locator("#whats-new-sheet");
  await expect(sheet).toBeVisible();
  await expect(sheet.locator(".whats-new-entry")).toHaveCount(WHATS_NEW.length);
  await expect(sheet.locator(".whats-new-items li").first()).toHaveText(NEWEST.items[0]);

  await sheet.tap({ position: { x: 8, y: 8 } });
  await expect(sheet).toBeHidden();

  await page.locator("#whats-new-open").tap();
  await sheet.locator("#whats-new-title").tap();
  await expect(sheet).toBeVisible();
});
