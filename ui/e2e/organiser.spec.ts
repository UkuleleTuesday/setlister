import { ORGANISER_KEY as KEY, expect, organiserRows, setOrganiserKey, test } from "./fixtures.js";
import { startSession } from "./steps.js";

test("a room phone gets the request view, and the link makes it an organiser's", async ({
  phone,
}) => {
  const organiser = await phone();
  const id = await startSession(organiser);
  const page = await phone({ room: true });

  await page.goto(`/?session=${id}&mode=full`);
  await expect(page).toHaveURL(new RegExp(`\\?session=${id}$`));
  await expect(page.locator("body")).toHaveClass(/room-mode/);

  await page.goto(`/?session=${id}#organise=${KEY}`);
  await expect(page).toHaveURL(new RegExp(`\\?session=${id}$`));
  const sheet = page.locator("#organiser-sheet");
  await page.locator("#organiser-name").fill("Alex");
  await page.locator("#organiser-register").tap();
  await expect(sheet.locator("#organiser-message")).toHaveText(
    "Registered as Alex. This device can now run nights.",
  );
  expect(await organiserRows()).toContainEqual({ name: "Alex", key: KEY });
  await page.locator("#organiser-ok").tap();
  await expect(sheet).toBeHidden();
  await expect(page.locator("body")).not.toHaveClass(/room-mode/);

  // From home: in a session, the join landing would close settings.
  await page.goto("/");
  await expect(page.locator("#new-session")).toBeVisible();
  await page.locator("#settings-toggle").tap();
  // A status, not a second copy of the name that a rename would leave behind.
  await expect(page.locator("#organiser-status")).toHaveText("Organiser on this device");
  await expect(page.locator("#organiser-setting")).toHaveCount(0);
  await page.locator("#player-name").fill("Al");
  await expect(page.locator("#settings-panel")).not.toContainText("Alex");
});

test("a room phone can't start a night", async ({ phone }) => {
  const page = await phone({ room: true });
  await page.goto("/");
  await expect(page.locator("#home")).toBeVisible();
  await expect(page.locator("#new-session")).toHaveCount(0);
});

test("a changed key drops an organiser to the request view on their next write", async ({
  phone,
}) => {
  const page = await phone();
  await startSession(page);
  await setOrganiserKey("a-brand-new-key-0000000000000000");

  await page.locator("#window-chip").tap();
  await page.locator("#request-link-switch").tap();
  await expect(page.locator("body")).toHaveClass(/room-mode/);
  await expect(page.locator("#add-feedback")).toHaveText(
    "Organiser access has changed. Tap the latest organiser link.",
  );
});

test("a retired link says so and registers nothing", async ({ phone }) => {
  const page = await phone({ room: true });
  await page.goto("/#organise=not-the-key");
  await expect(page).toHaveURL(/\/$/);

  await page.locator("#organiser-name").fill("Sam");
  await page.locator("#organiser-register").tap();
  await expect(page.locator("#organiser-title")).toHaveText("This link has been retired");
  await expect(page.locator("#organiser-message")).toHaveText(
    "The organiser link has changed. Open the newest one pinned in the organisers’ chat.",
  );
  expect(await organiserRows()).toEqual([]);

  await page.locator("#organiser-sheet").tap({ position: { x: 10, y: 10 } });
  await expect(page.locator("#organiser-sheet")).toBeHidden();
});

test("a stray tap outside keeps the link for a reload; Cancel forgets it", async ({ phone }) => {
  const page = await phone({ room: true });
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
  const page = await phone({ room: true });
  await page.goto("/");
  await page.locator("#settings-toggle").tap();
  await page.locator("#player-name").fill("Robin");
  await page.locator("#organiser-setting > summary").tap();

  await page.locator("#organiser-link").fill("https://example.com/setlister/");
  await page.locator("#organiser-link-register").tap();
  await expect(page.getByText("That doesn’t look like an organiser link.")).toBeVisible();

  await page.locator("#organiser-link").fill(`https://example.com/setlister/#organise=${KEY}`);
  await page.locator("#organiser-link-register").tap();
  await expect(page.locator("#organiser-title")).toHaveText("You’re on the organiser list");
  await expect(page.locator("#organiser-message")).toContainText("Registered as Robin.");
  await expect(page.locator("#organiser-name")).toHaveCount(0);
  expect(await organiserRows()).toEqual([{ name: "Robin", key: KEY }]);
});

test("a failed registration says why in plain words", async ({ phone, allowConsole }) => {
  // The aborted sign-in logs one.
  allowConsole.push(/Failed to load resource|ERR_FAILED/);
  const page = await phone({ room: true });
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
