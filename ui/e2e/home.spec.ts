// The home view (Home.svelte) and the new-session sheet
// (NewSessionSheet.svelte): the next night leads, one planned night at a time,
// the history collapses past a handful, and a bad link says so.
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures.js";
import { startSession } from "./steps.js";

/** YYYY-MM-DD for `days` from today, in local time like the date picker. */
function dayOffset(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Start a listed night on another day, then come back to the history. */
async function startPastNight(page: Page, date: string) {
  await page.locator("#new-session").tap();
  await page.locator("#new-session-date").fill(date);
  await page.locator("#new-session-start").tap();
  await page.waitForURL(/[?&]session=/);
  await page.locator("#back-home").tap();
  await expect(page.locator("#home")).toBeVisible();
}

test("tonight leads, and blocks a second shared night", async ({ phone }) => {
  const page = await phone();
  await startSession(page);
  await page.locator("#back-home").tap();

  const card = page.locator("#next-session .next-session-card");
  await expect(card).toContainText("Next session");
  await expect(card).toContainText(/Tonight|Today/);
  // With a night coming up, New session steps back to the quiet style.
  await expect(page.locator("#new-session")).toHaveClass(/secondary-new/);

  // One planned night at a time: Shared is refused and says why...
  await page.locator("#new-session").tap();
  const start = page.locator("#new-session-start");
  await expect(page.locator("#new-session-notice")).toContainText("already planned");
  await expect(start).toBeDisabled();
  // ...and Unlisted is the way past it.
  await page.locator("#new-session-visibility").selectOption("unlisted");
  await expect(page.locator("#new-session-notice")).toBeHidden();
  await expect(start).toBeEnabled();

  // Cancel closes, and the backdrop does too.
  await page.locator("#new-session-cancel").tap();
  await expect(page.locator("#new-session-sheet")).toBeHidden();
  await page.locator("#new-session").tap();
  await page.locator("#new-session-sheet").tap({ position: { x: 8, y: 8 } });
  await expect(page.locator("#new-session-sheet")).toBeHidden();

  // The card opens the night.
  await card.tap();
  await page.waitForURL(/[?&]session=/);
  await expect(page.locator("#session-view")).toBeVisible();
});

test("the history collapses its older nights", async ({ phone }) => {
  test.slow(); // seven sessions, each created through the UI
  const page = await phone();
  await page.goto("/");
  // Seven past Tuesdays-ish: PAST_VISIBLE (5) + 2, the first count that
  // collapses (one extra row is never hidden behind a tap).
  for (let week = 1; week <= 7; week++) await startPastNight(page, dayOffset(-7 * week));

  await expect(page.locator("#past-heading")).toBeVisible();
  await expect(page.locator("#session-list").getByRole("listitem")).toHaveCount(5);
  const toggle = page.locator("#past-older .group-toggle");
  await expect(toggle).toHaveText("2 older sessions");
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await toggle.tap();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator("#past-older-rows").getByRole("listitem")).toHaveCount(2);
  // Nothing is upcoming, so New session is the hero again.
  await expect(page.locator("#next-session")).toBeHidden();
  await expect(page.locator("#new-session")).not.toHaveClass(/secondary-new/);
});

test("a malformed share link lands on the history with an error", async ({ phone }) => {
  const page = await phone();
  await page.goto("/?session=Not-A-Session");
  await expect(page.locator("#home-error")).toHaveText("That share link doesn’t look right.");
  await expect(page).not.toHaveURL(/session=/);
  // Opening the sheet clears it.
  await page.locator("#new-session").tap();
  await expect(page.locator("#home-error")).toBeHidden();
});
