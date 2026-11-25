// The organiser's night, in the full app: start a session from the history,
// add tunes by name, run the set (promote, mark played) and bin and restore a
// request. Selectors are the app's own ids and accessible names, so the
// Svelte ports (#158) have to keep them.
import { expect, test } from "./fixtures.js";
import { addByName, startSession } from "./steps.js";

test("opens on the session history", async ({ phone }) => {
  const page = await phone();
  await page.goto("/");
  await expect(page.locator("#home")).toBeVisible();
  await expect(page.locator("#session-list-status")).toHaveText(/no sessions/i);
});

test("runs a night: add, promote, play, bin and restore", async ({ phone }) => {
  const page = await phone();
  await startSession(page);

  await addByName(page, "Jolene", { name: "Alex" });
  await addByName(page, "Hallelujah");
  const requests = page.locator("#requests-rows");
  await expect(requests.getByRole("listitem")).toHaveCount(2);

  // Promote Jolene to Up next.
  const jolene = requests.getByRole("listitem").filter({ hasText: "Jolene" });
  await jolene.getByRole("button", { name: "Move to Up next" }).tap();
  const upNext = page.locator("#upnext-rows");
  await expect(upNext.getByRole("listitem").filter({ hasText: "Jolene" })).toBeVisible();
  await expect(requests.getByRole("listitem")).toHaveCount(1);

  // Play it: it leaves the queue for the collapsed "played" group.
  await upNext
    .getByRole("listitem")
    .filter({ hasText: "Jolene" })
    .getByRole("button", { name: "Mark played" })
    .tap();
  await expect(upNext.getByRole("listitem")).toHaveCount(0);
  await expect(page.locator("#played-group")).toContainText("1 played");

  // Bin Hallelujah, then restore it from the bin group.
  await requests
    .getByRole("listitem")
    .filter({ hasText: "Hallelujah" })
    .getByRole("button", { name: "Bin" })
    .tap();
  await expect(requests.getByRole("listitem")).toHaveCount(0);
  const bin = page.locator("#bin-group");
  await bin.getByRole("button", { name: /1 binned/ }).tap();
  await bin.getByRole("button", { name: "Un-bin" }).tap();
  await expect(requests.getByRole("listitem").filter({ hasText: "Hallelujah" })).toBeVisible();
  await expect(bin).toBeHidden();

  // Everything above synced: a fresh load of the session shows the same night.
  await page.reload();
  await expect(page.locator("#played-group")).toContainText("1 played");
  await expect(requests.getByRole("listitem").filter({ hasText: "Hallelujah" })).toBeVisible();
});
