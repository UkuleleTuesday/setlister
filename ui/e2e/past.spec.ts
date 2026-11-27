import type { Page } from "@playwright/test";
import { expect, storedRowCount, test } from "./fixtures.js";
import { addByName } from "./steps.js";

function yesterday(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

async function startPastNight(page: Page): Promise<string> {
  await page.goto("/");
  await page.locator("#new-session").tap();
  await page.locator("#new-session-date").fill(yesterday());
  await page.locator("#new-session-start").tap();
  await page.waitForURL(/[?&]session=/);
  return new URL(page.url()).searchParams.get("session")!;
}

const titles = (page: Page, list: string) => page.locator(`${list} .match-title`).allTextContents();
const upNextRow = (page: Page, title: string) =>
  page.locator("#upnext-rows > li").filter({ hasText: title });

test("a past night opens as a recap, and Edit backfills and fixes the order", async ({ phone }) => {
  const page = await phone();
  const id = await startPastNight(page);

  // Read-only by default: no adding, no running-order tools.
  await expect(page.locator("#recap")).toBeVisible();
  await expect(page.locator("#recap-empty")).toContainText("Tap Edit");
  await expect(page.locator("#window-chip")).toHaveCount(0);
  await expect(page.locator(".songbook-trigger:visible")).toHaveCount(0);

  // Its songbook is part of the record: locked until Edit.
  await page.locator("#session-title").tap();
  await expect(page.locator("#session-details-sheet #edition")).toBeDisabled();
  await expect(page.locator("#session-details-request-link")).toHaveCount(0);
  await page.locator("#session-details-close").tap();

  const edit = page.locator("#past-edit");
  await expect(edit).toHaveText("Edit");
  await edit.tap();
  await expect(page.locator("#past-edit-note")).toBeVisible();
  await expect(edit).toHaveText("Done");

  await addByName(page, "Jolene", { name: "Alex" });
  await addByName(page, "Hallelujah");
  await addByName(page, "Let It Be");
  await addByName(page, "Lean on Me");
  for (const title of ["Jolene", "Hallelujah", "Let It Be"]) {
    await page
      .locator("#requests-rows > li")
      .filter({ hasText: title })
      .getByRole("button", { name: "Move to Up next" })
      .tap();
  }
  // Nothing is next on a night that's over.
  await expect(page.locator(".next-tag")).toHaveCount(0);
  for (const title of ["Jolene", "Let It Be", "Hallelujah"]) {
    await upNextRow(page, title).getByRole("button", { name: "Mark played" }).tap();
  }

  // Edit mode lists what was played, open and in the order it was ticked.
  const playedRows = "#played-group-rows";
  await expect(page.locator(playedRows)).toBeVisible();
  expect(await titles(page, playedRows)).toEqual([
    "Jolene - Dolly Parton",
    "Let It Be - The Beatles",
    "Hallelujah - Leonard Cohen",
  ]);
  const hallelujah = page.locator(`${playedRows} > li`).filter({ hasText: "Hallelujah" });
  await expect(hallelujah.getByRole("button", { name: "Played later" })).toBeDisabled();
  await hallelujah.getByRole("button", { name: "Played earlier" }).tap();
  expect(await titles(page, playedRows)).toEqual([
    "Jolene - Dolly Parton",
    "Hallelujah - Leonard Cohen",
    "Let It Be - The Beatles",
  ]);

  await edit.tap();
  await expect(page.locator("#recap")).toBeVisible();
  expect(await titles(page, "#recap-rows")).toEqual([
    "Jolene - Dolly Parton",
    "Hallelujah - Leonard Cohen",
    "Let It Be - The Beatles",
  ]);
  await expect(page.locator("#recap-count")).toHaveText("· 3");
  await expect(page.locator("#recap-rows")).toContainText(/played \d/);
  await expect(page.locator("#recap-rows button")).toHaveCount(0);
  await expect(page.locator("#unplayed-group .group-toggle")).toHaveText("1 not played");
  await expect.poll(() => storedRowCount(id)).toBe(4);

  // The room sees the same story, with no way to edit it.
  const room = await phone({ room: true });
  await room.goto(`/?session=${id}`);
  await expect(room.locator("#recap")).toBeVisible();
  await expect
    .poll(() => titles(room, "#recap-rows"))
    .toEqual(["Jolene - Dolly Parton", "Hallelujah - Leonard Cohen", "Let It Be - The Beatles"]);
  await expect(room.locator("#past-edit")).toHaveCount(0);
  await expect(room.locator(".room-top:visible")).toHaveCount(0);
});

test("leaving a past night drops edit mode", async ({ phone }) => {
  const page = await phone();
  await startPastNight(page);
  await page.locator("#past-edit").tap();
  await expect(page.locator("#past-edit-note")).toBeVisible();
  await page.locator("#back-home").tap();
  await page.locator("#session-list .session-item").first().tap();
  await expect(page.locator("#recap")).toBeVisible();
  await expect(page.locator("#past-edit")).toHaveText("Edit");
});
