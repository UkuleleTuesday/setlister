// The page chrome (App.svelte): the header's title and share button, the tab
// title, the edition footnote, and the one-time name amnesty sheet.
import type { Page } from "@playwright/test";
import { NAME_RESET_KEY, NAME_RESET_MESSAGE } from "../name-reset.js";
import { STORAGE_KEY } from "../saved-state.js";
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

// A device that saved a name before the amnesty round shipped.
async function savedNameFromBefore(page: Page) {
  await page.goto("/");
  await page.evaluate(
    ([storageKey, resetKey]) => {
      localStorage.setItem(storageKey, JSON.stringify({ upNext: [], name: "Captain Strum" }));
      localStorage.removeItem(resetKey);
    },
    [STORAGE_KEY, NAME_RESET_KEY],
  );
  await page.reload();
}

test("the name amnesty asks once, and Save keeps the new name", async ({ phone }) => {
  const page = await phone();
  await savedNameFromBefore(page);
  const sheet = page.locator("#name-reset-sheet");
  await expect(sheet).toBeVisible();
  await expect(page.locator("#name-reset-message")).toHaveText(NAME_RESET_MESSAGE);
  await expect(page.locator("#name-reset-name")).toHaveValue("");

  await page.locator("#name-reset-name").fill("Alex");
  await page.locator("#name-reset-save").tap();
  await expect(sheet).toBeHidden();
  await page.locator("#settings-toggle").tap();
  await expect(page.locator("#player-name")).toHaveValue("Alex");

  // Once per device: a reload doesn't bring it back.
  await page.reload();
  await expect(page.locator("#home")).toBeVisible();
  await expect(sheet).toBeHidden();
});

test("every way out of the name amnesty is a later, and clears the old name", async ({ phone }) => {
  const page = await phone();
  await savedNameFromBefore(page);
  const sheet = page.locator("#name-reset-sheet");
  await expect(sheet).toBeVisible();
  // Forgiving dismissal: anywhere on the backdrop.
  await sheet.tap({ position: { x: 8, y: 8 } });
  await expect(sheet).toBeHidden();
  await page.locator("#settings-toggle").tap();
  await expect(page.locator("#player-name")).toHaveValue("");

  // Later, and Save with nothing typed, are the same "not now".
  await savedNameFromBefore(page);
  await page.locator("#name-reset-later").tap();
  await expect(sheet).toBeHidden();
  await savedNameFromBefore(page);
  await page.locator("#name-reset-save").tap();
  await expect(sheet).toBeHidden();
});
