import type { Page } from "@playwright/test";
import { bySong } from "./api.js";
import { expect, test } from "./fixtures.js";
import { addByName, startSession } from "./steps.js";

const songbook = (page: Page) => page.locator("#songbook-sheet");
const songButton = (page: Page, title: string) =>
  songbook(page).getByRole("button", { name: new RegExp(`^${bySong(title).display}, page`) });

async function openSongbook(page: Page) {
  await page.locator(".songbook-trigger:visible").tap();
  await expect(songbook(page)).toBeVisible();
}

test("search narrows the book, by title or page, says when nothing matches, and resets on close", async ({
  phone,
}) => {
  const page = await phone();
  await startSession(page);
  await openSongbook(page);

  const rows = page.locator("#songbook-list li");
  await expect(rows).toHaveCount(6);
  await page.locator("#songbook-search").fill("dolly");
  await expect(rows).toHaveCount(2);
  await page.locator("#songbook-search").fill("42");
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("Here Comes the Sun");
  await page.locator("#songbook-search").fill("zzz");
  await expect(rows).toHaveCount(0);
  await expect(page.locator("#songbook-empty")).toHaveText("No matches for “zzz”");

  await page.locator("#songbook-close").tap();
  await expect(songbook(page)).toBeHidden();
  await openSongbook(page);
  await expect(page.locator("#songbook-search")).toHaveValue("");
  await songbook(page).tap({ position: { x: 8, y: 8 } });
  await expect(songbook(page)).toBeHidden();
});

test("tonight's tags: requested tunes show their thumbs, played ones refuse", async ({ phone }) => {
  const page = await phone();
  await startSession(page);
  await addByName(page, "Jolene", { name: "Alex" });
  await addByName(page, "Hallelujah");
  const requests = page.locator("#requests-rows");
  await requests
    .getByRole("listitem")
    .filter({ hasText: "Hallelujah" })
    .getByRole("button", { name: "Move to Up next" })
    .tap();
  await page
    .locator("#upnext-rows")
    .getByRole("listitem")
    .filter({ hasText: "Hallelujah" })
    .getByRole("button", { name: "Mark played" })
    .tap();

  await openSongbook(page);
  await expect(songButton(page, "Jolene")).toHaveAccessibleName(
    /requested, 1 person wants it, including you$/,
  );
  await expect(songButton(page, "Jolene").locator(".tonight-tag")).toHaveText("1 · requested");
  await expect(songButton(page, "Hallelujah").locator(".tonight-tag")).toHaveText("played");

  await songButton(page, "Hallelujah").tap();
  await expect(page.locator("#songbook-status")).toHaveText(
    "“Hallelujah” was played earlier tonight. Pick another?",
  );
  await expect(songbook(page)).toBeVisible();
});

test("the room waits a minute between requests, but can still back a tune", async ({ phone }) => {
  const organiser = await phone();
  const id = await startSession(organiser);
  await organiser.locator("#share-toggle").tap();
  await organiser.locator("#share-requests").selectOption("open");
  await organiser.locator("#share-toggle").tap();
  await addByName(organiser, "Jolene", { name: "Alex" });

  const room = await phone({ room: true });
  await room.goto(`/?session=${id}`);
  await expect(room.locator("#requests-rows").getByRole("listitem")).toHaveCount(1);
  await addByName(room, "Let It Be", { name: "Sam" });
  await expect(room.locator("#add-feedback")).toHaveText(
    "Added “Let It Be”. Next one in a minute.",
  );

  await openSongbook(room);
  await expect(room.locator("#songbook-wait")).toBeVisible();
  await songButton(room, "Lean on Me").tap();
  await expect(room.locator("#songbook-status")).toHaveText(
    /^One at a time! You can add another in \d+ seconds\.$/,
  );
  await expect(room.locator("#songbook-wait")).toBeHidden();

  await songButton(room, "Jolene").tap();
  await expect(songbook(room)).toBeHidden();
  await expect(room.locator("#add-feedback")).toHaveText("Your thumbs up is on “Jolene”.");
});

test("the confirm sheet needs a name, carries a comment, renames, and cancels cleanly", async ({
  phone,
}) => {
  const organiser = await phone();
  const id = await startSession(organiser);
  await organiser.locator("#share-toggle").tap();
  await organiser.locator("#share-requests").selectOption("open");
  await organiser.locator("#share-toggle").tap();

  const room = await phone({ room: true });
  await room.goto(`/?session=${id}`);
  await openSongbook(room);
  await songButton(room, "Jolene").tap();

  const sheet = room.locator("#room-request-sheet");
  await expect(sheet).toBeVisible();
  await expect(room.locator("#room-request-title")).toHaveText("Who’s asking?");
  await expect(room.locator("#room-request-song")).toHaveText(bySong("Jolene").display);
  await room.locator("#room-request-confirm").tap();
  await expect(room.locator("#room-request-error")).toHaveText(
    "Add a name so the room knows whose request it is.",
  );
  await expect(sheet).toBeVisible();

  await room.locator("#room-request-name").fill("Sam");
  await room.locator("#room-request-comment").fill("birthday request!");
  await room.locator("#room-request-confirm").tap();
  await expect(sheet).toBeHidden();
  const row = room.locator("#requests-rows").getByRole("listitem").filter({ hasText: "Jolene" });
  await expect(row).toContainText("birthday request!");
  await expect(room.locator("#room-identity-text")).toHaveText("As Sam");

  await room.locator("#room-identity-change").tap();
  await expect(room.locator("#room-request-title")).toHaveText("Your name");
  await expect(room.locator("#room-request-song")).toBeHidden();
  await expect(room.locator("#room-request-comment-field")).toBeHidden();
  await expect(room.locator("#room-request-confirm")).toHaveText("Save");
  await room.locator("#room-request-name").fill("Samira");
  await room.locator("#room-request-confirm").tap();
  await expect(room.locator("#room-identity-text")).toHaveText("As Samira");

  await room.locator("#room-identity-change").tap();
  await room.locator("#room-request-cancel").tap();
  await expect(sheet).toBeHidden();
  await room.locator("#room-identity-change").tap();
  await sheet.tap({ position: { x: 8, y: 8 } });
  await expect(sheet).toBeHidden();
  await expect(room.locator("#room-identity-text")).toHaveText("As Samira");
});
