// The organiser link (#151): tapping it (or pasting it in Settings) registers
// this phone as an organiser's, the key leaves the address bar at once, and
// Settings says whether the phone is registered. Nothing is locked yet, so the
// rest of the app behaves as before.
import type { Page } from "@playwright/test";
import { expect, organiserRows, setOrganiserKey, test } from "./fixtures.js";
import { startSession } from "./steps.js";

const KEY = "0123456789abcdef0123456789abcdef";

async function openOrganiserSettings(page: Page) {
  await page.locator("#settings-toggle").tap();
  await page.locator("#organiser-setting > summary").tap();
}

test("the organiser link registers this phone, inside a session too", async ({ phone }) => {
  await setOrganiserKey(KEY);
  const page = await phone();
  const id = await startSession(page);

  await page.goto(`/?session=${id}#organise=${KEY}`);
  // The key is gone before anything else happens; the session stays.
  await expect(page).toHaveURL(new RegExp(`\\?session=${id}$`));
  await expect(page.locator("#session-view")).toBeVisible();

  const sheet = page.locator("#organiser-sheet");
  await page.locator("#organiser-name").fill("Alex");
  await page.locator("#organiser-register").tap();
  await expect(sheet.locator("#organiser-message")).toHaveText(
    "Registered as Alex. Nothing changes yet: when running nights becomes organisers-only, this phone is ready.",
  );
  expect(await organiserRows()).toEqual([{ name: "Alex", key: KEY }]);

  await page.locator("#organiser-ok").tap();
  await expect(sheet).toBeHidden();

  // A plain reopen asks nothing.
  await page.reload();
  await expect(page.locator("#session-view")).toBeVisible();
  await expect(sheet).toBeHidden();

  // Settings says the phone is registered. Checked from home: opening a
  // session closes settings once the join lands, which would race the taps.
  await page.goto("/");
  await expect(page.locator("#home")).toBeVisible();
  await openOrganiserSettings(page);
  await expect(page.locator("#organiser-status")).toHaveText(
    "This phone is on the organiser list, as Alex.",
  );
});

test("a retired link says so and registers nothing", async ({ phone }) => {
  await setOrganiserKey(KEY);
  const page = await phone();
  await page.goto("/#organise=not-the-key");
  await expect(page).toHaveURL(/\/$/);

  await page.locator("#organiser-name").fill("Sam");
  await page.locator("#organiser-register").tap();
  await expect(page.locator("#organiser-title")).toHaveText("This link has been retired");
  await expect(page.locator("#organiser-message")).toHaveText(
    "The organiser link has changed. Open the newest one pinned in the organisers’ chat.",
  );
  expect(await organiserRows()).toEqual([]);

  // Tapping outside closes it, like every sheet.
  await page.locator("#organiser-sheet").tap({ position: { x: 10, y: 10 } });
  await expect(page.locator("#organiser-sheet")).toBeHidden();
});

test("a stray tap outside keeps the link for a reload; Cancel forgets it", async ({ phone }) => {
  await setOrganiserKey(KEY);
  const page = await phone();
  await page.goto(`/#organise=${KEY}`);
  const sheet = page.locator("#organiser-sheet");
  await expect(sheet).toBeVisible();

  await sheet.tap({ position: { x: 10, y: 10 } });
  await expect(sheet).toBeHidden();
  await page.reload();
  await expect(sheet).toBeVisible();

  await page.locator("#organiser-cancel").tap();
  await expect(sheet).toBeHidden();
  await page.reload();
  await expect(page.locator("#home")).toBeVisible();
  await expect(sheet).toBeHidden();
  expect(await organiserRows()).toEqual([]);
});

test("a pasted link registers too, under the name the phone already has", async ({ phone }) => {
  await setOrganiserKey(KEY);
  const page = await phone();
  await page.goto("/");
  await page.locator("#settings-toggle").tap();
  await page.locator("#player-name").fill("Robin");
  await page.locator("#organiser-setting > summary").tap();

  await page.locator("#organiser-link").fill("https://example.com/setlister/");
  await page.locator("#organiser-link-register").tap();
  await expect(page.getByText("That doesn’t look like an organiser link.")).toBeVisible();

  await page.locator("#organiser-link").fill(`https://example.com/setlister/#organise=${KEY}`);
  await page.locator("#organiser-link-register").tap();
  // The phone has a name, so there's no name step: the done step says it.
  await expect(page.locator("#organiser-title")).toHaveText("You’re on the organiser list");
  await expect(page.locator("#organiser-message")).toContainText("Registered as Robin.");
  await expect(page.locator("#organiser-name")).toHaveCount(0);
  expect(await organiserRows()).toEqual([{ name: "Robin", key: KEY }]);
});

test("a failed registration says why in plain words", async ({ phone, allowConsole }) => {
  // The aborted sign-in request is the failure under test.
  allowConsole.push(/Failed to load resource|ERR_FAILED/);
  await setOrganiserKey(KEY);
  const page = await phone();
  await page.context().route(/127\.0\.0\.1:9099/, (route) => route.abort());
  await page.goto(`/#organise=${KEY}`);
  await page.locator("#organiser-name").fill("Alex");
  await page.locator("#organiser-register").tap();

  const message = page.locator("#organiser-message");
  await expect(message).toHaveText(
    "Couldn’t reach Setlister. Check your signal or wifi, then try again.",
  );
  await expect(message).not.toContainText("Firebase");
  await expect(page.locator("#organiser-retry")).toBeVisible();
  expect(await organiserRows()).toEqual([]);
});
