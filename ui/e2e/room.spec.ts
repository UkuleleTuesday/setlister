import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures.js";
import { addByName, setRequests, startSession } from "./steps.js";

// Forced open so tests don't depend on the time of day. Must run before any
// tune is added: this write's snapshot, landing inside sync.ts's push debounce,
// would replace unpushed local edits (#153).
async function openForRequests(organiser: Page): Promise<string> {
  const id = await startSession(organiser);
  await setRequests(organiser, true);
  return id;
}

// Waits for the organiser's Jolene: acting earlier races the same debounce (#153).
async function joinRoom(room: Page, id: string) {
  await room.goto(`/?session=${id}`);
  await expect(room.locator("#room-window")).toHaveText(/requests open/i);
  await expect(room.locator("#session-title")).toHaveCount(0);
  await expect(
    room.locator("#requests-rows").getByRole("listitem").filter({ hasText: "Jolene" }),
  ).toBeVisible();
}

test("the room requests a tune and backs another, and the organiser sees both live", async ({
  phone,
}) => {
  const organiser = await phone();
  const id = await openForRequests(organiser);
  await addByName(organiser, "Jolene", { name: "Alex" });

  const room = await phone({ room: true });
  await joinRoom(room, id);

  await addByName(room, "Let It Be", { name: "Sam" });
  const roomRequests = room.locator("#requests-rows");
  await expect(roomRequests.getByRole("listitem")).toHaveCount(2);

  await roomRequests
    .getByRole("listitem")
    .filter({ hasText: "Jolene" })
    .getByRole("button", { name: "I want this one too, 1 person wants it" })
    .tap();
  await expect(
    roomRequests.getByRole("button", { name: "You and 1 other want this one" }),
  ).toBeVisible();

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

  const room = await phone({ room: true });
  await joinRoom(room, id);
  await room.locator(".songbook-trigger:visible").tap();
  await room
    .locator("#songbook-sheet")
    .getByRole("button", { name: /^Jolene - Dolly Parton, page 6, requested/ })
    .tap();

  await expect(room.locator("#add-feedback")).toHaveText("Your thumbs up is on “Jolene”.");
  await expect(room.locator("#requests-rows").getByRole("listitem")).toHaveCount(1);
});

test("the room can leave for the session list and come back", async ({ phone }) => {
  const organiser = await phone();
  const id = await startSession(organiser);

  const room = await phone({ room: true });
  await room.goto(`/?session=${id}`);
  await expect(room.locator("body")).toHaveClass(/room-mode/);
  await expect(room.locator("#window-chip")).toBeHidden();

  await room.locator("#back-home").tap();
  await expect(room).toHaveURL(/\/$/);
  await expect(room.locator("#new-session")).toHaveCount(0);
  await room.locator(`#home [data-id="${id}"]`).tap();
  await expect(room).toHaveURL(new RegExp(`\\?session=${id}$`));
  await expect(room.locator("#room-window")).toBeVisible();
});

test("days before the night, the room hears when requests open, not that they're over", async ({
  phone,
}) => {
  const organiser = await phone();
  await organiser.goto("/");
  await expect(organiser.locator("#session-list-status")).toBeHidden();
  await organiser.locator("#new-session").tap();
  const d = new Date();
  d.setDate(d.getDate() + 3);
  const pad = (n: number) => String(n).padStart(2, "0");
  await organiser
    .locator("#new-session-date")
    .fill(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
  await organiser.locator("#new-session-start").tap();
  await organiser.waitForURL(/[?&]session=/);
  const id = new URL(organiser.url()).searchParams.get("session")!;

  const room = await phone({ room: true });
  await room.goto(`/?session=${id}`);
  const note = room.locator("#requests-closed-note");
  await expect(note).toBeVisible();
  await expect(note).toHaveText(/^Requests open \S+ at .+\.$/);
});
