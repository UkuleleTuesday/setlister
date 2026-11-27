import WHATS_NEW from "../whats-new.json" with { type: "json" };
import { expect, test } from "./fixtures.js";

const NEWEST = [...WHATS_NEW].sort((a, b) => b.date.localeCompare(a.date))[0];

test("the pill flags the latest entry once, then stays as the way in", async ({ phone }) => {
  const page = await phone();
  await page.goto("/");

  const pill = page.locator("#whats-new-banner");
  await expect(pill).toHaveClass(/unseen/);
  await pill.tap();
  const sheet = page.locator("#whats-new-sheet");
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole("heading", { name: "What’s new" })).toBeVisible();
  await expect(sheet.locator(".whats-new-entry")).toHaveCount(1);
  await expect(sheet.locator(".whats-new-items li").first()).toHaveText(NEWEST.items[0]);

  await page.locator("#whats-new-close").tap();
  await expect(sheet).toBeHidden();
  await expect(pill).toBeVisible();
  await expect(pill).not.toHaveClass(/unseen/);
  await page.reload();
  await expect(pill).toBeVisible();
  await expect(pill).not.toHaveClass(/unseen/);
});

test("earlier updates open the full history; a backdrop tap closes it, a card tap doesn't", async ({
  phone,
}) => {
  const page = await phone();
  await page.goto("/");

  await page.locator("#whats-new-banner").tap();
  const sheet = page.locator("#whats-new-sheet");
  await sheet.locator("#whats-new-earlier").tap();
  await expect(sheet.locator(".whats-new-entry")).toHaveCount(WHATS_NEW.length);
  await expect(sheet.locator("#whats-new-earlier")).toHaveCount(0);

  await sheet.tap({ position: { x: 8, y: 8 } });
  await expect(sheet).toBeHidden();

  await page.locator("#whats-new-banner").tap();
  await expect(sheet.locator(".whats-new-entry")).toHaveCount(1);
  await sheet.locator("#whats-new-title").tap();
  await expect(sheet).toBeVisible();
});
