// The room's view of a night: a second phone opens the request link, asks for
// a tune and thumbs up one someone already asked for, and the organiser's
// phone sees both live.
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures.js";
import { addByName, startSession } from "./steps.js";

// Start a night and force its request link open, so the tests don't depend
// on the time of day they run (Auto follows the night's schedule; see
// request-window.ts).
//
// Done BEFORE any tune is added, deliberately: a snapshot landing inside
// sync.ts's 300ms push debounce currently replaces local edits that haven't
// been pushed yet (applyRemoteState in app.js re-persists the remote lists),
// and this metadata write's own snapshot is one. Drop the ordering once #153
// is fixed.
async function openForRequests(organiser: Page): Promise<string> {
  const id = await startSession(organiser);
  await organiser.locator("#share-toggle").tap();
  await organiser.locator("#share-requests").selectOption("open");
  await organiser.locator("#share-toggle").tap();
  await expect(organiser.locator("#share-panel")).toBeHidden();
  return id;
}

// Open the request link and wait until the organiser's Jolene has synced in.
// Acting earlier races the same debounce (#153): Jolene's snapshot would land
// on top of the room's own unpushed request.
async function joinRoom(room: Page, id: string) {
  await room.goto(`/?session=${id}&mode=request`);
  await expect(room.locator("#room-window")).toHaveText(/requests open/i);
  await expect(
    room.locator("#requests-rows").getByRole("listitem").filter({ hasText: "Jolene" }),
  ).toBeVisible();
}

test("the room requests a tune and backs another", async ({ phone }) => {
  const organiser = await phone();
  const id = await openForRequests(organiser);
  await addByName(organiser, "Jolene", { name: "Alex" });

  const room = await phone();
  await joinRoom(room, id);

  await addByName(room, "Let It Be", { name: "Sam" });
  const roomRequests = room.locator("#requests-rows");
  await expect(roomRequests.getByRole("listitem")).toHaveCount(2);

  // Thumbs up the organiser's request.
  await roomRequests
    .getByRole("listitem")
    .filter({ hasText: "Jolene" })
    .getByRole("button", { name: "I want this one too, 1 person wants it" })
    .tap();
  await expect(
    roomRequests.getByRole("button", { name: "You and 1 other want this one" }),
  ).toBeVisible();

  // The organiser sees the new request and the vote without reloading.
  const requests = organiser.locator("#requests-rows");
  await expect(requests.getByRole("listitem").filter({ hasText: "Let It Be" })).toBeVisible();
  await expect(
    requests
      .getByRole("listitem")
      .filter({ hasText: "Jolene" })
      .getByRole("button", { name: "You and 1 other want this one" }),
  ).toBeVisible();
});

test("a tune already asked for gets a thumbs up instead of a copy", async ({ phone }) => {
  const organiser = await phone();
  const id = await openForRequests(organiser);
  await addByName(organiser, "Jolene", { name: "Alex" });

  const room = await phone();
  await joinRoom(room, id);
  await room.locator(".songbook-trigger:visible").tap();
  await room
    .locator("#songbook-sheet")
    .getByRole("button", { name: /^Jolene - Dolly Parton, page 6, requested/ })
    .tap();

  await expect(room.locator("#add-feedback")).toHaveText("Your thumbs up is on “Jolene”.");
  await expect(room.locator("#requests-rows").getByRole("listitem")).toHaveCount(1);
});
