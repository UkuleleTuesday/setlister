import { expect, test } from "./fixtures.js";
import { setRequests, startSession } from "./steps.js";

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
  await page.locator("#session-title").tap();
  await expect(page.locator("#edition-note")).toContainText("matched against “Current”");
  await page.locator("#session-details-close").tap();

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

const NOTE = "December at the Wild Duck, 17–20 Sycamore St.";

test("the night's note reaches home and the night's page, for everyone, open or shut", async ({
  phone,
}) => {
  const organiser = await phone();
  const id = await startSession(organiser);
  await setRequests(organiser, false);
  await organiser.locator("#back-home").tap();
  const homeNote = organiser.locator(".next-session-note");
  await expect(homeNote).toHaveCount(0);

  await organiser.locator("#next-session-open").tap();
  await organiser.locator("#session-title").tap();
  const field = organiser.locator("#session-blurb");
  await field.fill(NOTE);
  // A tap outside mustn't lose it: it saves, and the sheet stays open.
  await organiser.locator("#session-details-sheet").tap({ position: { x: 8, y: 8 } });
  await expect(organiser.locator("#session-details-sheet")).toBeVisible();
  await organiser.locator("#session-details-close").tap();
  await expect(organiser.locator("#night-note")).toContainText(NOTE);
  await organiser.locator("#back-home").tap();
  await expect(homeNote).toHaveText(NOTE);

  // Requests are shut, which hides the room's controls but not the note.
  const room = await phone({ room: true });
  await room.goto("/");
  await expect(room.locator(".next-session-note")).toHaveText(NOTE);
  await room.goto(`/?session=${id}`);
  await expect(room.locator("#night-note")).toContainText(NOTE);

  await organiser.locator("#next-session-open").tap();
  await organiser.locator("#session-title").tap();
  await expect(field).toHaveValue(NOTE);
  await field.fill("");
  await field.press("Enter");
  await organiser.locator("#session-details-close").tap();
  await expect(organiser.locator("#night-note")).toHaveCount(0);
  await expect(room.locator("#night-note")).toHaveCount(0);
  await organiser.locator("#back-home").tap();
  await expect(homeNote).toHaveCount(0);
});

test("an open details sheet never writes over another organiser's note", async ({ phone }) => {
  const first = await phone();
  const id = await startSession(first);
  await first.locator("#session-title").tap();
  const firstField = first.locator("#session-blurb");
  await expect(firstField).toHaveValue("");

  const second = await phone();
  await second.goto(`/?session=${id}`);
  // The page shows before the night's data arrives; its label waits for it.
  await expect(second.locator("#session-title")).toContainText(/Today|Tonight/);
  await second.locator("#session-title").tap();
  await second.locator("#session-blurb").fill(NOTE);
  await second.locator("#session-blurb").press("Enter");
  await second.locator("#session-details-close").tap();

  // Untouched, the first sheet follows the change and closing it saves nothing.
  await expect(firstField).toHaveValue(NOTE);
  await first.locator("#session-details-close").tap();
  await expect(first.locator("#night-note")).toContainText(NOTE);
  await expect(second.locator("#night-note")).toContainText(NOTE);
});

test("the note can be written when starting the night", async ({ phone }) => {
  const page = await phone();
  await page.goto("/");
  await expect(page.locator("#session-list-status")).toBeHidden();
  await page.locator("#new-session").tap();
  await page.locator("#new-session-blurb").fill(NOTE);
  await page.locator("#new-session-start").tap();
  await page.waitForURL(/[?&]session=/);
  await expect(page.locator("#night-note")).toContainText(NOTE);
  await page.locator("#back-home").tap();
  await expect(page.locator(".next-session-note")).toHaveText(NOTE);
  await expect(page.locator("#next-session")).toContainText("From the organisers");
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
