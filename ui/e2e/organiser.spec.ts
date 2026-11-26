// The organiser link (#151): tapping it registers this phone as an
// organiser's, and the key leaves the address bar at once. Nothing is locked
// yet, so the rest of the app behaves as before.
import { expect, organiserRows, setOrganiserKey, test } from "./fixtures.js";
import { startSession } from "./steps.js";

const KEY = "0123456789abcdef0123456789abcdef";

test("the organiser link registers this phone, inside a session too", async ({ phone }) => {
  await setOrganiserKey(KEY);
  const page = await phone();
  const id = await startSession(page);

  await page.goto(`/?session=${id}#organise=${KEY}`);
  // The key is gone before anything else happens; the session stays.
  await expect(page).toHaveURL(new RegExp(`\\?session=${id}$`));
  await expect(page.locator("#session-view")).toBeVisible();

  // No name on this phone yet, so the sheet asks for one first.
  const sheet = page.locator("#organiser-sheet");
  await page.locator("#organiser-name").fill("Alex");
  await page.locator("#organiser-register").tap();
  await expect(sheet.locator("#organiser-message")).toHaveText("This phone can now run nights.");
  expect(await organiserRows()).toEqual([{ name: "Alex", key: KEY }]);

  await page.locator("#organiser-ok").tap();
  await expect(sheet).toBeHidden();

  // A plain reopen shows nothing: registering is a one-shot, not a route.
  await page.reload();
  await expect(page.locator("#session-view")).toBeVisible();
  await expect(sheet).toBeHidden();
});

test("an out-of-date link says so and registers nothing", async ({ phone }) => {
  await setOrganiserKey(KEY);
  const page = await phone();
  await page.goto("/#organise=not-the-key");
  await expect(page).toHaveURL(/\/$/);

  await page.locator("#organiser-name").fill("Sam");
  await page.locator("#organiser-register").tap();
  await expect(page.locator("#organiser-message")).toHaveText(
    "That organiser link is out of date. Ask for the latest one in the organisers’ chat.",
  );
  expect(await organiserRows()).toEqual([]);

  // Tapping outside closes it, like every sheet.
  await page.locator("#organiser-sheet").tap({ position: { x: 10, y: 10 } });
  await expect(page.locator("#organiser-sheet")).toBeHidden();
});
