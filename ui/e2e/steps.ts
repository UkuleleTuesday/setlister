import { type Page, expect } from "@playwright/test";
import { bySong } from "./api.js";

export async function startSession(page: Page): Promise<string> {
  await page.goto("/");
  // The next night's card lands above the button when the list loads; a tap
  // before then can hit the card instead.
  await expect(page.locator("#home")).toBeVisible();
  await expect(page.locator("#session-list-status")).toBeHidden();
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
