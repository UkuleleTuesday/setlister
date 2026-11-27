import type { Page } from "@playwright/test";
import { features } from "../features.js";
import { expect, test } from "./fixtures.js";
import { startSession } from "./steps.js";

/** Local YYYY-MM-DD, as the date picker uses. */
function dayOffset(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

async function startPastNight(page: Page, date: string) {
  await page.locator("#new-session").tap();
  await page.locator("#new-session-date").fill(date);
  await page.locator("#new-session-start").tap();
  await page.waitForURL(/[?&]session=/);
  await page.locator("#back-home").tap();
  await expect(page.locator("#home")).toBeVisible();
}

test("tonight leads, and blocks a second night", async ({ phone }) => {
  const page = await phone();
  await startSession(page);
  await page.locator("#back-home").tap();

  const card = page.locator("#next-session .next-session-card");
  await expect(card).toContainText("Next session");
  await expect(card).toContainText(/Tonight|Today/);
  await expect(page.locator("#new-session")).toHaveClass(/btn-soft/);

  await page.locator("#new-session").tap();
  const start = page.locator("#new-session-start");
  await expect(page.locator("#new-session-notice")).toContainText("already planned");
  await expect(start).toBeDisabled();
  if (features.unlistedSessions) {
    await page.locator("#new-session-visibility").selectOption("unlisted");
    await expect(page.locator("#new-session-notice")).toBeHidden();
    await expect(start).toBeEnabled();
  } else {
    await expect(page.locator("#new-session-notice")).toHaveText(/home screen\.$/);
    await expect(page.locator("#new-session-visibility")).toHaveCount(0);
  }

  await page.locator("#new-session-cancel").tap();
  await expect(page.locator("#new-session-sheet")).toBeHidden();
  await page.locator("#new-session").tap();
  await page.locator("#new-session-sheet").tap({ position: { x: 8, y: 8 } });
  await expect(page.locator("#new-session-sheet")).toBeHidden();

  await card.tap();
  await page.waitForURL(/[?&]session=/);
  await expect(page.locator("#session-view")).toBeVisible();
});

test("past nights list in full, newest first, one heading per month", async ({ phone }) => {
  test.slow(); // twelve sessions, each created through the UI
  const page = await phone();
  await page.goto("/");
  for (let week = 1; week <= 12; week++) await startPastNight(page, dayOffset(-7 * week));

  await expect(page.locator("#past-heading")).toBeVisible();
  await expect(page.locator("#session-list").getByRole("listitem")).toHaveCount(12);
  // 6 days at 01:00, when last week's night hasn't quite turned a week old.
  await expect(page.locator("#session-list .session-item-name").first()).toHaveText(
    /^(Last week|6 days ago)$/,
  );
  // Twelve weeks span three or four months, each headed once.
  const months = await page.locator("#session-list .month-label").allTextContents();
  expect(months.length).toBeGreaterThanOrEqual(3);
  expect(new Set(months).size).toBe(months.length);
  await expect(page.locator("#next-session")).toBeHidden();
  await expect(page.locator("#new-session")).not.toHaveClass(/btn-soft/);
});

test("a malformed share link lands on the history with an error that New session clears", async ({
  phone,
}) => {
  const page = await phone();
  await page.goto("/?session=Not-A-Session");
  await expect(page.locator("#home-error")).toHaveText("That share link doesn’t look right.");
  await expect(page).not.toHaveURL(/session=/);
  await page.locator("#new-session").tap();
  await expect(page.locator("#home-error")).toBeHidden();
});
