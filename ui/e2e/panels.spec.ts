import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures.js";
import { startSession } from "./steps.js";

// Empty page below both popovers, which end around y=705 at this viewport.
const tapOutside = (page: Page) => page.touchscreen.tap(195, 800);

test("the share panel names the night and unlists it, leaving the link working", async ({
  phone,
}) => {
  const page = await phone();
  const id = await startSession(page);

  await page.locator("#share-toggle").tap();
  const panel = page.locator("#share-panel");
  await expect(panel).toBeVisible();
  await expect(page.locator("#share-toggle")).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator("#share-session-name")).toHaveText(/Tonight|Today/);
  await expect(page.locator("#share-session-id")).toHaveText(id);
  await expect(page.locator("#share-visibility")).toHaveValue("shared");

  await page.locator("#share-visibility").selectOption("unlisted");
  await expect(page.locator("#share-visibility")).toBeEnabled();
  await page.locator("#share-toggle").tap();
  await page.locator("#back-home").tap();
  await expect(page.locator("#session-list-status")).toHaveText(/no sessions/i);
  await page.goto(`/?session=${id}`);
  await page.locator("#share-toggle").tap();
  await expect(page.locator("#share-visibility")).toHaveValue("unlisted");
});

test("the request link's window, overrides, modes and chip", async ({ phone }) => {
  const page = await phone();
  await startSession(page);
  await page.locator("#share-toggle").tap();

  const opens = page.locator("#share-requests-open-time");
  const closes = page.locator("#share-requests-close-time");
  await expect(opens).toHaveValue(/T\d\d:\d\d$/);
  await expect(closes).toHaveValue(/T\d\d:\d\d$/);
  await expect(page.locator("#share-requests-close-reset")).toBeHidden();

  const day = (await closes.inputValue()).slice(0, 10);
  await closes.fill(`${day}T23:45`);
  await closes.dispatchEvent("change");
  const reset = page.locator("#share-requests-close-reset");
  await expect(reset).toBeVisible();
  await expect(closes).toHaveValue(`${day}T23:45`);
  await reset.tap();
  await expect(reset).toBeHidden();

  await page.locator("#share-requests").selectOption("closed");
  await expect(page.locator("#share-requests-open-time-field")).toBeHidden();
  await expect(page.locator("#share-request-note")).toHaveText(/^View only/);
  await page.locator("#share-toggle").tap();
  await expect(page.locator("#window-chip")).toHaveText("Request link is view only");

  await page.locator("#window-chip").tap();
  await expect(page.locator("#share-panel")).toBeVisible();
  await expect(page.locator("#share-requests")).toHaveValue("closed");
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

test("settings remember the name and the toggles; the songbook choice is session-only", async ({
  phone,
}) => {
  const page = await phone();
  await startSession(page);

  await page.locator("#settings-toggle").tap();
  await expect(page.locator("#settings-panel")).toBeVisible();
  await expect(page.locator("#edition-setting")).toBeVisible();
  await page.locator("#player-name").fill("Robin");
  await page.locator("#show-suggestions").check();
  await page.locator("#settings-toggle").tap();
  await expect(page.locator("#settings-panel")).toBeHidden();

  await page.locator("#share-toggle").tap();
  await expect(page.locator("#share-presence-list")).toContainText("Robin (you)");

  await page.reload();
  await page.locator("#settings-toggle").tap();
  await expect(page.locator("#player-name")).toHaveValue("Robin");
  await expect(page.locator("#show-suggestions")).toBeChecked();

  await page.locator("#settings-toggle").tap();
  await page.locator("#back-home").tap();
  await page.locator("#settings-toggle").tap();
  await expect(page.locator("#edition-setting")).toBeHidden();
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

  await page.locator("#settings-panel .note").first().tap();
  await expect(page.locator("#settings-panel")).toBeVisible();
  await tapOutside(page);
  await expect(page.locator("#settings-panel")).toBeHidden();
  await expect(page.locator("#settings-toggle")).toHaveAttribute("aria-expanded", "false");

  await page.locator("#share-toggle").tap();
  await tapOutside(page);
  await expect(page.locator("#share-panel")).toBeHidden();
});
