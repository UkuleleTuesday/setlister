import { expect, storedLists, test } from "./fixtures.js";
import { addByName, startSession } from "./steps.js";

test("opens on the session history", async ({ phone }) => {
  const page = await phone();
  await page.goto("/");
  await expect(page.locator("#home")).toBeVisible();
  await expect(page.locator("#no-night")).toContainText("No night planned yet");
});

test("runs a night: add, promote, play, bin and restore, surviving a reload", async ({ phone }) => {
  const page = await phone();
  const id = await startSession(page);

  await addByName(page, "Jolene", { name: "Alex" });
  await addByName(page, "Hallelujah");
  const requests = page.locator("#requests-rows");
  await expect(requests.getByRole("listitem")).toHaveCount(2);

  const jolene = requests.getByRole("listitem").filter({ hasText: "Jolene" });
  await jolene.getByRole("button", { name: "Move to Up next" }).tap();
  const upNext = page.locator("#upnext-rows");
  await expect(upNext.getByRole("listitem").filter({ hasText: "Jolene" })).toBeVisible();
  await expect(requests.getByRole("listitem")).toHaveCount(1);

  await upNext
    .getByRole("listitem")
    .filter({ hasText: "Jolene" })
    .getByRole("button", { name: "Mark played" })
    .tap();
  await expect(upNext.getByRole("listitem")).toHaveCount(0);
  await expect(page.locator("#played-group")).toContainText("1 played");

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

  await expect.poll(() => storedLists(id)).toEqual({ upNext: [], requests: ["Hallelujah"] });
  await page.reload();
  await expect(page.locator("#played-group")).toContainText("1 played");
  await expect(requests.getByRole("listitem").filter({ hasText: "Hallelujah" })).toBeVisible();
});
