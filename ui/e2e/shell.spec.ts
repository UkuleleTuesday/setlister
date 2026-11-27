import { expect, test } from "./fixtures.js";
import { startSession } from "./steps.js";

test("the header names the night, and home takes the brand back", async ({ phone }) => {
  const page = await phone();
  await page.goto("/");
  const title = page.locator("header h1");
  await expect(title).toHaveText("Setlister");
  await expect(page).toHaveTitle("Setlister · Ukulele Tuesday");
  await expect(page.locator("#share-toggle")).toBeHidden();
  await expect(page.locator("#edition-note")).toBeHidden();

  const id = await startSession(page);
  // Not always "Tonight": after midnight it's a weekday and date.
  await expect(title).not.toHaveText("Setlister");
  const label = (await title.textContent())!;
  await expect(page).toHaveTitle(`${label} · Setlister`);
  await expect(page.locator("body")).toHaveClass(/in-session/);
  const share = page.locator("#share-toggle");
  await expect(share).toBeVisible();
  await expect(share).toHaveAccessibleName(`Sharing session ${id}. Tap for options`);
  // Alone, the count would only say "you".
  await expect(page.locator("#share-count-badge")).toBeHidden();
  await expect(page.locator("#edition-note")).toContainText("Matched against “Current”");

  await page.locator("#back-home").tap();
  await expect(page.locator("#home")).toBeVisible();
  await expect(title).toHaveText("Setlister");
  await expect(page).toHaveTitle("Setlister · Ukulele Tuesday");
  await expect(page.locator("body")).not.toHaveClass(/in-session/);
  await expect(page.locator("#share-count-badge")).toBeHidden();
});

test("the header and session bar fit a 320px phone", async ({ phone }) => {
  const page = await phone();
  await startSession(page);
  await page.setViewportSize({ width: 320, height: 640 });
  for (const id of [
    "#session-title",
    "#share-toggle",
    "#settings-toggle",
    "#back-home",
    "#window-chip",
  ]) {
    const box = (await page.locator(id).boundingBox())!;
    expect(box.x, id).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width, id).toBeLessThanOrEqual(320);
  }
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test("home's night speaks to the room and to organisers", async ({ phone }) => {
  const organiser = await phone();
  await startSession(organiser);
  await organiser.locator("#back-home").tap();
  await expect(organiser.locator(".next-session-pitch")).toContainText("Snap the whiteboard");

  const room = await phone({ room: true });
  await room.goto("/");
  await expect(room.locator(".next-session-pitch")).toContainText("Ask for the tunes");
});

test("with no night planned, home says so to each role", async ({ phone }) => {
  const room = await phone({ room: true });
  await room.goto("/");
  await expect(room.locator("#no-night")).toContainText("shows up here");

  const organiser = await phone();
  await organiser.goto("/");
  await expect(organiser.locator("#no-night")).toContainText("Start one");
  await expect(organiser.locator("#new-session")).toHaveClass(/btn-primary/);
});
