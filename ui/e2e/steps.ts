import { type Page, expect } from "@playwright/test";
import { bySong } from "./api.js";

export async function startSession(page: Page): Promise<string> {
  await page.goto("/");
  await page.locator("#new-session").tap();
  await page.locator("#new-session-start").tap();
  await page.waitForURL(/[?&]session=/);
  await expect(page.locator("#session-view")).toBeVisible();
  return new URL(page.url()).searchParams.get("session")!;
}

/** Pass `name` on a device's first request: only then does the sheet ask for one. */
export async function addByName(page: Page, title: string, { name }: { name?: string } = {}) {
  await page.locator(".songbook-trigger:visible").tap();
  const sheet = page.locator("#songbook-sheet");
  await expect(sheet).toBeVisible();
  await sheet.getByRole("button", { name: new RegExp(`^${bySong(title).display}, page`) }).tap();
  const request = page.locator("#room-request-sheet");
  await expect(request).toBeVisible();
  if (name) await page.locator("#room-request-name").fill(name);
  await page.locator("#room-request-confirm").tap();
  await expect(request).toBeHidden();
}

/**
 * Sets the request link by hand, so tests don't depend on the time of day. A
 * switch already in that state gets flipped twice: by schedule isn't by hand.
 */
export async function setRequests(page: Page, open: boolean) {
  await page.locator("#window-chip").tap();
  const toggle = page.locator("#request-link-switch");
  await expect(toggle).toBeVisible();
  if ((await toggle.isChecked()) === open) {
    await toggle.tap();
    await expect(toggle).toBeChecked({ checked: !open });
    await expect(toggle).toBeEnabled();
  }
  await toggle.tap();
  await expect(toggle).toBeChecked({ checked: open });
  await expect(page.locator("#request-link-help")).toHaveText("Set by hand");
  await page.locator("#request-link-close").tap();
  await expect(page.locator("#request-link-sheet")).toBeHidden();
}
