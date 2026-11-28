import type { Page } from "@playwright/test";
import { features } from "../features.js";
import { expect, storedRowCount, test } from "./fixtures.js";
import { addByName, setRequests, startSession } from "./steps.js";

/** Local YYYY-MM-DD, as the date picker uses. */
function dayOffset(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

async function startPastNight(page: Page, date: string) {
  // The no-night callout lands above the button when the list loads; a tap
  // before then can miss it.
  await expect(page.locator("#session-list-status")).toBeHidden();
  await page.locator("#new-session").tap();
  await page.locator("#new-session-date").fill(date);
  await page.locator("#new-session-start").tap();
  await page.waitForURL(/[?&]session=/);
  await page.locator("#back-home").tap();
  await expect(page.locator("#home")).toBeVisible();
}

test("tonight leads, and a second night isn't offered while it's planned", async ({ phone }) => {
  const page = await phone();
  await startSession(page);
  await page.locator("#back-home").tap();

  const card = page.locator("#next-session .next-session-card");
  await expect(card.locator("#next-session-name")).toHaveText(/Tonight|Today/);
  await expect(card).not.toContainText("Started by");
  // Organisers add from inside the night: the card just opens it.
  await expect(page.locator("#next-session-add")).toHaveCount(0);
  await expect(page.locator("#next-session-open")).toHaveText("See tonight’s setlist");

  if (features.unlistedSessions) {
    await page.locator("#new-session").tap();
    await expect(page.locator("#new-session-notice")).toContainText("already planned");
    await page.locator("#new-session-visibility").selectOption("unlisted");
    await expect(page.locator("#new-session-start")).toBeEnabled();
    await page.locator("#new-session-cancel").tap();
  } else {
    await expect(page.locator("#new-session")).toHaveCount(0);
  }

  // Anywhere on the card, not just its last row.
  await card.tap({ position: { x: 24, y: 24 } });
  await page.waitForURL(/[?&]session=/);
  await expect(page.locator("#session-view")).toBeVisible();
  await expect(page.locator("#songbook-sheet")).toBeHidden();
});

test("the room's card says how the night is going and requests in one tap", async ({ phone }) => {
  const organiser = await phone();
  const id = await startSession(organiser);
  await setRequests(organiser, true);
  await addByName(organiser, "Jolene", { name: "Alex" });
  await addByName(organiser, "Hallelujah");
  await organiser
    .locator("#requests-rows")
    .getByRole("listitem")
    .filter({ hasText: "Jolene" })
    .getByRole("button", { name: "Move to Up next" })
    .tap();
  await expect.poll(() => storedRowCount(id)).toBe(2);

  const room = await phone({ room: true });
  await room.goto("/");
  await expect(room.locator(".home-intro")).toHaveText(
    "Ask for tunes and follow the night’s setlist.",
  );
  const status = room.locator("#next-session-status");
  await expect(status).toHaveText(/^Requests open.* · 1 request$/);
  await expect(status).toHaveClass(/open/);
  await expect(room.locator("#new-session")).toHaveCount(0);

  const organiserRow = (title: string) =>
    organiser
      .locator("#upnext-rows, #requests-rows")
      .getByRole("listitem")
      .filter({ hasText: title });
  await organiserRow("Hallelujah").getByRole("button", { name: "Move to Up next" }).tap();
  await organiserRow("Jolene").getByRole("button", { name: "Mark played" }).tap();
  // The night's counts, live; no "Next": the card isn't a playlist.
  await expect(status).toHaveText(/^Requests open.* · 1 played$/);
  await expect(room.locator("#next-session")).not.toContainText("Next");

  await room.locator("#next-session-add").tap();
  await room.waitForURL(new RegExp(`[?&]session=${id}`));
  await expect(room.locator("#songbook-sheet")).toBeVisible();
});

test("with requests closed, the room's card only opens the setlist", async ({ phone }) => {
  const organiser = await phone();
  await startSession(organiser);
  await setRequests(organiser, false);

  const room = await phone({ room: true });
  await room.goto("/");
  await expect(room.locator("#next-session-status")).toHaveText("Requests closed");
  await expect(room.locator("#next-session-status")).not.toHaveClass(/open/);
  await expect(room.locator("#next-session-add")).toHaveCount(0);
  await room.locator("#next-session .next-session-card").tap({ position: { x: 24, y: 24 } });
  await expect(room.locator("#session-view")).toBeVisible();
  await expect(room.locator("#songbook-sheet")).toBeHidden();
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
