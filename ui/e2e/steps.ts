// Multi-tap steps the specs share. Each one taps, as a thumb would.
import { type Page, expect } from "@playwright/test";
import { bySong } from "./api.js";

/** From the history: New session, Start, and wait for the session view. */
export async function startSession(page: Page): Promise<string> {
  await page.goto("/");
  await page.locator("#new-session").tap();
  await page.locator("#new-session-start").tap();
  await page.waitForURL(/[?&]session=/);
  await expect(page.locator("#session-view")).toBeVisible();
  return new URL(page.url()).searchParams.get("session")!;
}

/**
 * Open the songbook, pick `title` and confirm it in the request sheet. The
 * sheet asks for a name on this device's first request only, so pass `name`
 * then.
 */
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
