import type { Page } from "@playwright/test";
import { features } from "../features.js";
import { expect, test } from "./fixtures.js";
import { setRequests, startSession } from "./steps.js";

// Empty page below both popovers, which end around y=705 at this viewport.
const tapOutside = (page: Page) => page.touchscreen.tap(195, 800);

test("the share panel names the night", async ({ phone }) => {
  const page = await phone();
  const id = await startSession(page);

  await page.locator("#share-toggle").tap();
  await expect(page.locator("#share-panel")).toBeVisible();
  await expect(page.locator("#share-toggle")).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator("#share-session-name")).toHaveText(/Tonight|Today/);
  await expect(page.locator("#share-session-id")).toHaveText(id);
  await expect(page.locator("#share-link-state-text")).toHaveText(/^Request link/);
  await expect(page.locator("#share-panel select, #share-panel input")).toHaveCount(0);
  if (!features.unlistedSessions) await expect(page.locator("#share-visibility")).toHaveCount(0);
});

test("Visibility unlists a night, leaving the link working", async ({ phone }) => {
  test.skip(!features.unlistedSessions, "features.unlistedSessions is off");
  const page = await phone();
  const id = await startSession(page);

  await page.locator("#share-toggle").tap();
  await expect(page.locator("#share-visibility")).toHaveValue("shared");
  await page.locator("#share-visibility").selectOption("unlisted");
  await expect(page.locator("#share-visibility")).toBeEnabled();
  await page.locator("#share-toggle").tap();
  await page.locator("#back-home").tap();
  await expect(page.locator("#no-night")).toContainText("No night planned yet");
  await page.goto(`/?session=${id}`);
  await page.locator("#share-toggle").tap();
  await expect(page.locator("#share-visibility")).toHaveValue("unlisted");
});

test("the request link pill opens one switch, set by hand or by the schedule", async ({
  phone,
}) => {
  const page = await phone();
  await startSession(page);

  const chip = page.locator("#window-chip");
  await expect(chip).toHaveAttribute("aria-haspopup", "dialog");
  await setRequests(page, false);
  await expect(chip).toHaveText("Request link is view only");

  await chip.tap();
  const sheet = page.locator("#request-link-sheet");
  await expect(page.locator("#request-link-switch")).not.toBeChecked();
  await expect(page.locator("#request-link-note")).toHaveText(/^View only/);
  await expect(page.locator("#request-link-schedule summary")).toContainText("(paused)");

  await page.locator("#request-link-auto").tap();
  await expect(page.locator("#request-link-help")).toHaveText(/^On schedule/);
  await expect(page.locator("#request-link-auto")).toHaveCount(0);
  await expect(page.locator("#request-link-schedule summary")).toContainText(" to ");

  await page.touchscreen.tap(10, 10);
  await expect(sheet).toBeHidden();
});

test("the schedule's times sit behind a disclosure, with Use default", async ({ phone }) => {
  const page = await phone();
  await startSession(page);
  await page.locator("#window-chip").tap();

  const closes = page.locator("#request-link-close-time");
  await expect(closes).toBeHidden();
  await page.locator("#request-link-schedule > summary").tap();
  await expect(page.locator("#request-link-open-time")).toHaveValue(/T\d\d:\d\d$/);
  await expect(closes).toHaveValue(/T\d\d:\d\d$/);
  const reset = page.locator("#request-link-close-reset");
  await expect(reset).toBeHidden();

  const day = (await closes.inputValue()).slice(0, 10);
  await closes.fill(`${day}T23:45`);
  await closes.dispatchEvent("change");
  await expect(reset).toBeVisible();
  await expect(closes).toHaveValue(`${day}T23:45`);
  await reset.tap();
  await expect(reset).toBeHidden();
});

test("share's Change and the session details both lead to the request link", async ({ phone }) => {
  const page = await phone();
  await startSession(page);

  await page.locator("#share-toggle").tap();
  await page.locator("#share-request-change").tap();
  await expect(page.locator("#share-panel")).toBeHidden();
  await expect(page.locator("#request-link-sheet")).toBeVisible();
  await page.locator("#request-link-close").tap();

  await page.locator("#session-title").tap();
  await page.locator("#session-details-request-link").tap();
  await expect(page.locator("#session-details-sheet")).toBeHidden();
  await expect(page.locator("#request-link-sheet")).toBeVisible();
});

test("the night's name opens its details: the date and the songbook", async ({ phone }) => {
  const page = await phone();
  await startSession(page);

  await page.locator("#session-title").tap();
  const sheet = page.locator("#session-details-sheet");
  await expect(sheet).toBeVisible();
  const date = page.locator("#session-details-date");
  await expect(date).toContainText(String(new Date().getFullYear()));
  await expect(date).not.toHaveText(/Tonight|Today/);
  await expect(sheet.locator("#edition")).toBeEnabled();
  await page.locator("#session-details-close").tap();
  await expect(sheet).toBeHidden();

  await page.locator("#edition-change").tap();
  await expect(sheet).toBeVisible();
});

test("Here now lists who's connected", async ({ phone }) => {
  const organiser = await phone();
  const id = await startSession(organiser);
  const peer = await phone();
  await peer.goto(`/?session=${id}`);

  await expect(organiser.locator("#share-count-badge")).toHaveText("2");
  await organiser.locator("#share-toggle").tap();
  await expect(organiser.locator("#share-presence-count")).toHaveText("2");
  await expect(organiser.locator("#share-presence-list li")).toHaveCount(2);
  await expect(organiser.locator("#share-presence-list li").first()).toContainText("(you)");
});

test("an unnamed phone sees the name the room knows it by, and Here now points to Settings", async ({
  phone,
}) => {
  const page = await phone();
  await startSession(page);

  await page.locator("#share-toggle").tap();
  const self = page.locator("#share-presence-list li").first();
  await expect(self).toContainText(/Anonymous .+ \(you\)/);
  const anon = (await self.locator(".presence-name").textContent())!.replace("(you)", "").trim();
  await page.locator("#share-add-name").tap();

  await expect(page.locator("#share-panel")).toBeHidden();
  const name = page.locator("#player-name");
  await expect(name).toBeFocused();
  await expect(name).toHaveAttribute("placeholder", anon);
  await expect(page.locator("#player-name-help")).toHaveText(
    `Until you add one, the room sees you as ${anon}.`,
  );
  await name.fill("Robin");
  await expect(page.locator("#player-name-help")).toContainText("Shown on songs you add");

  await page.locator("#share-toggle").tap();
  await expect(self).toContainText("Robin (you)");
  await expect(page.locator("#share-add-name")).toHaveCount(0);
});

test("a copied link says so, then settles back", async ({ phone }) => {
  const page = await phone();
  await startSession(page);
  // Force the clipboard path: no native share sheet.
  await page.evaluate(() => {
    Object.defineProperty(navigator, "share", { value: undefined, configurable: true });
  });
  await page.locator("#share-toggle").tap();
  const button = page.locator("#share-link");
  await button.tap();
  await expect(button).toHaveText("Link copied");
  await expect(button).toHaveText("Share link", { timeout: 3000 });
});

test("settings keep this phone's name; the songbook is set per session in its details", async ({
  phone,
}) => {
  const page = await phone();
  await startSession(page);

  await page.locator("#settings-toggle").tap();
  const settings = page.locator("#settings-panel");
  await expect(settings).toBeVisible();
  await expect(settings.locator("#edition-setting, #advanced-setting, .switch")).toHaveCount(0);
  await page.locator("#player-name").fill("Robin");
  await page.locator("#settings-toggle").tap();
  await expect(settings).toBeHidden();

  await page.locator("#share-toggle").tap();
  await expect(page.locator("#share-presence-list")).toContainText("Robin (you)");
  await expect(page.locator("#share-panel #edition-setting")).toHaveCount(0);
  await page.locator("#share-toggle").tap();
  await page.locator("#session-title").tap();
  await expect(page.locator("#session-details-sheet #edition-setting")).toBeVisible();
  await page.locator("#session-details-close").tap();

  await page.reload();
  await page.locator("#settings-toggle").tap();
  await expect(page.locator("#player-name")).toHaveValue("Robin");
});

test("one popover at a time; a stray tap closes either, a tap inside doesn't", async ({
  phone,
}) => {
  const page = await phone();
  await startSession(page);

  await page.locator("#share-toggle").tap();
  await expect(page.locator("#share-panel")).toBeVisible();
  await page.locator("#settings-toggle").tap();
  await expect(page.locator("#settings-panel")).toBeVisible();
  await expect(page.locator("#share-panel")).toBeHidden();
  await expect(page.locator("#share-toggle")).toHaveAttribute("aria-expanded", "false");

  await page.locator("#settings-panel .setting-help").first().tap();
  await expect(page.locator("#settings-panel")).toBeVisible();
  await tapOutside(page);
  await expect(page.locator("#settings-panel")).toBeHidden();
  await expect(page.locator("#settings-toggle")).toHaveAttribute("aria-expanded", "false");

  await page.locator("#share-toggle").tap();
  await tapOutside(page);
  await expect(page.locator("#share-panel")).toBeHidden();
});
