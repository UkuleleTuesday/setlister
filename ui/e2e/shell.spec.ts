// The page chrome (App.svelte): the header's title and share button, the tab
// title, and the edition footnote.
import { expect, test } from "./fixtures.js";
import { startSession } from "./steps.js";

test("the header names the night, and home takes the brand back", async ({ phone }) => {
  const page = await phone();
  await page.goto("/");
  const title = page.locator("header h1");
  await expect(title).toHaveText("🎶 Setlister");
  await expect(page).toHaveTitle("Setlister · Ukulele Tuesday");
  await expect(page.locator("#share-toggle")).toBeHidden();
  await expect(page.locator("#edition-note")).toBeHidden();

  const id = await startSession(page);
  // The night's date ("Tonight", or a weekday and date late at night).
  await expect(title).not.toHaveText("🎶 Setlister");
  const label = (await title.textContent())!;
  await expect(page).toHaveTitle(`${label} · Setlister`);
  await expect(page.locator("body")).toHaveClass(/in-session/);
  const share = page.locator("#share-toggle");
  await expect(share).toBeVisible();
  await expect(share).toHaveClass(/active/);
  await expect(share).toHaveAccessibleName(`Sharing session ${id}. Tap for options`);
  await expect(page.locator("#share-count-badge")).toHaveText("1");
  await expect(page.locator("#edition-note")).toContainText("Matched against “Current”");

  await page.locator("#back-home").tap();
  await expect(page.locator("#home")).toBeVisible();
  await expect(title).toHaveText("🎶 Setlister");
  await expect(page).toHaveTitle("Setlister · Ukulele Tuesday");
  await expect(page.locator("body")).not.toHaveClass(/in-session/);
  await expect(page.locator("#share-count-badge")).toBeHidden();
});
