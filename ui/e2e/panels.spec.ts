// The header popovers: the share panel (SharePanel.svelte, with Presence) and
// settings (SettingsPanel.svelte). What they write, what survives a reload,
// and that both get out of the way on a stray tap.
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures.js";
import { startSession } from "./steps.js";

// Empty page background below both popovers (they end around y=705 at this
// viewport), where a thumb would land to dismiss one.
const tapOutside = (page: Page) => page.touchscreen.tap(195, 800);

test("the share panel names the night and unlists it", async ({ phone }) => {
  const page = await phone();
  const id = await startSession(page);

  await page.locator("#share-toggle").tap();
  const panel = page.locator("#share-panel");
  await expect(panel).toBeVisible();
  await expect(page.locator("#share-toggle")).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator("#share-session-name")).toHaveText(/Tonight|Today/);
  await expect(page.locator("#share-session-id")).toHaveText(id);
  await expect(page.locator("#share-visibility")).toHaveValue("shared");

  // Unlisted takes the night off the club's list; the link still opens it.
  await page.locator("#share-visibility").selectOption("unlisted");
  await expect(page.locator("#share-visibility")).toBeEnabled();
  await page.locator("#share-toggle").tap();
  await page.locator("#back-home").tap();
  await expect(page.locator("#session-list-status")).toHaveText(/no sessions/i);
  await page.goto(`/?session=${id}`);
  await page.locator("#share-toggle").tap();
  await expect(page.locator("#share-visibility")).toHaveValue("unlisted");
});

test("the request link's window, overrides and modes", async ({ phone }) => {
  const page = await phone();
  await startSession(page);
  await page.locator("#share-toggle").tap();

  // Auto: the window fields show the resolved default, with nothing to reset.
  const opens = page.locator("#share-requests-open-time");
  const closes = page.locator("#share-requests-close-time");
  await expect(opens).toHaveValue(/T\d\d:\d\d$/);
  await expect(closes).toHaveValue(/T\d\d:\d\d$/);
  await expect(page.locator("#share-requests-close-reset")).toBeHidden();

  // Overriding the close time offers "Use default", which clears it again.
  const day = (await closes.inputValue()).slice(0, 10);
  await closes.fill(`${day}T23:45`);
  await closes.dispatchEvent("change");
  const reset = page.locator("#share-requests-close-reset");
  await expect(reset).toBeVisible();
  await expect(closes).toHaveValue(`${day}T23:45`);
  await reset.tap();
  await expect(reset).toBeHidden();

  // A forced mode makes the schedule inert, so its fields go.
  await page.locator("#share-requests").selectOption("closed");
  await expect(page.locator("#share-requests-open-time-field")).toBeHidden();
  await expect(page.locator("#share-request-note")).toHaveText(/^View only/);
  await page.locator("#share-toggle").tap();
  await expect(page.locator("#window-chip")).toHaveText("Request link is view only");

  // The chip opens the panel on that row, and isn't an "outside" tap.
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
  // No native share sheet here, so the link goes to the clipboard.
  await page.evaluate(() => {
    Object.defineProperty(navigator, "share", { value: undefined, configurable: true });
  });
  await page.locator("#share-toggle").tap();
  const button = page.locator("#share-link");
  await button.tap();
  await expect(button).toHaveText("Link copied");
  await expect(button).toHaveText("Share link", { timeout: 3000 });
});

test("settings remember the name and the toggles", async ({ phone }) => {
  const page = await phone();
  await startSession(page);

  await page.locator("#settings-toggle").tap();
  await expect(page.locator("#settings-panel")).toBeVisible();
  // A session control, so it shows in a session.
  await expect(page.locator("#edition-setting")).toBeVisible();
  await page.locator("#player-name").fill("Robin");
  await page.locator("#show-suggestions").check();
  await page.locator("#settings-toggle").tap();
  await expect(page.locator("#settings-panel")).toBeHidden();

  // The name reaches "Here now".
  await page.locator("#share-toggle").tap();
  await expect(page.locator("#share-presence-list")).toContainText("Robin (you)");

  await page.reload();
  await page.locator("#settings-toggle").tap();
  await expect(page.locator("#player-name")).toHaveValue("Robin");
  await expect(page.locator("#show-suggestions")).toBeChecked();

  // On home the songbook choice belongs to the new-session sheet.
  await page.locator("#settings-toggle").tap();
  await page.locator("#back-home").tap();
  await page.locator("#settings-toggle").tap();
  await expect(page.locator("#edition-setting")).toBeHidden();
});

test("one popover at a time, and a stray tap closes either", async ({ phone }) => {
  const page = await phone();
  await startSession(page);

  await page.locator("#share-toggle").tap();
  await expect(page.locator("#share-panel")).toBeVisible();
  // Opening settings closes share.
  await page.locator("#settings-toggle").tap();
  await expect(page.locator("#settings-panel")).toBeVisible();
  await expect(page.locator("#share-panel")).toBeHidden();
  await expect(page.locator("#share-toggle")).toHaveAttribute("aria-expanded", "false");

  // A tap inside stays; a tap on the page outside closes.
  await page.locator("#settings-panel .note").first().tap();
  await expect(page.locator("#settings-panel")).toBeVisible();
  await tapOutside(page);
  await expect(page.locator("#settings-panel")).toBeHidden();
  await expect(page.locator("#settings-toggle")).toHaveAttribute("aria-expanded", "false");

  await page.locator("#share-toggle").tap();
  await tapOutside(page);
  await expect(page.locator("#share-panel")).toBeHidden();
});
