import { type BrowserContext, type Page, expect, test as base } from "@playwright/test";
import { firebaseConfig } from "../firebase-config.js";
import { type ParseRows, stubApi } from "./api.js";

// The emulator keys data by the app's project id, not test:e2e's --project.
// Its admin routes don't exist in production, so the wipe can only hit the emulator.
const EMULATOR = "http://127.0.0.1:8081";
const PROJECT = firebaseConfig.projectId;

/** The organiser key every test's phones register with. */
export const ORGANISER_KEY = "0123456789abcdef0123456789abcdef";

interface Fixtures {
  /** A new device (own context, localStorage and client id), registered as an organiser unless `room`. */
  phone: (options?: { room?: boolean }) => Promise<Page>;
  parseRows: { current: ParseRows };
  /** Console errors a test expects (a stubbed server error logs one). */
  allowConsole: RegExp[];
}

async function clearFirestore() {
  const res = await fetch(
    `${EMULATOR}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`,
    { method: "DELETE" },
  );
  if (!res.ok) throw new Error(`Couldn't clear the Firestore emulator (${res.status})`);
}

// Proof a push landed, for tests that must not act inside sync's push debounce
// (#153). "Bearer owner" is the emulator-only rules bypass.
export async function storedRowCount(sessionId: string): Promise<number> {
  const res = await fetch(
    `${EMULATOR}/v1/projects/${PROJECT}/databases/(default)/documents/sessions/${sessionId}`,
    { headers: { Authorization: "Bearer owner" } },
  );
  if (!res.ok) return 0;
  const doc = (await res.json()) as {
    fields?: { rows?: { mapValue?: { fields?: Record<string, unknown> } } };
  };
  return Object.keys(doc.fields?.rows?.mapValue?.fields ?? {}).length;
}

const DOCS = `${EMULATOR}/v1/projects/${PROJECT}/databases/(default)/documents`;

export async function setOrganiserKey(key: string): Promise<void> {
  const res = await fetch(`${DOCS}/clubConfig/organiserKey`, {
    method: "PATCH",
    headers: { Authorization: "Bearer owner", "Content-Type": "application/json" },
    body: JSON.stringify({ fields: { key: { stringValue: key } } }),
  });
  if (!res.ok) throw new Error(`Couldn't set the organiser key (${res.status})`);
}

// What Visibility → Unlisted writes, for nights unlisted while the picker is off.
export async function unlistSession(sessionId: string): Promise<void> {
  const owner = { Authorization: "Bearer owner", "Content-Type": "application/json" };
  const patched = await fetch(`${DOCS}/sessions/${sessionId}?updateMask.fieldPaths=listed`, {
    method: "PATCH",
    headers: owner,
    body: JSON.stringify({ fields: { listed: { booleanValue: false } } }),
  });
  const removed = await fetch(`${DOCS}/sessionIndex/${sessionId}`, {
    method: "DELETE",
    headers: owner,
  });
  if (!patched.ok || !removed.ok) throw new Error("Couldn't unlist the session");
}

export async function organiserRows(): Promise<{ name?: string; key?: string }[]> {
  const res = await fetch(`${DOCS}/organisers`, { headers: { Authorization: "Bearer owner" } });
  if (!res.ok) return [];
  const body = (await res.json()) as {
    documents?: { fields: Record<string, { stringValue?: string }> }[];
  };
  return (body.documents ?? []).map(({ fields }) => ({
    name: fields.name?.stringValue,
    key: fields.key?.stringValue,
  }));
}

// Clears the saved name afterwards so specs still get the first-request name prompt.
async function registerOrganiser(page: Page) {
  await page.goto(`/#organise=${ORGANISER_KEY}`);
  await page.locator("#organiser-name").fill("Organiser");
  await page.locator("#organiser-register").tap();
  await page.locator("#organiser-ok").tap();
  await page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem("setlister.v1") || "{}");
    localStorage.setItem("setlister.v1", JSON.stringify({ ...saved, name: "" }));
  });
  await page.reload();
}

export const test = base.extend<Fixtures>({
  // Playwright reads dependencies off a destructured first argument, so `{}` is required.
  // eslint-disable-next-line no-empty-pattern
  parseRows: async ({}, use) => {
    await use({ current: [] });
  },

  // eslint-disable-next-line no-empty-pattern
  allowConsole: async ({}, use) => {
    await use([]);
  },

  phone: async ({ browser, parseRows, allowConsole }, use) => {
    // Starting a night is refused while another is planned, so no state may leak.
    await clearFirestore();
    const contexts: BrowserContext[] = [];
    const errors: string[] = [];
    await setOrganiserKey(ORGANISER_KEY);
    await use(async ({ room = false } = {}) => {
      const label = `phone ${contexts.length + 1}`;
      // browser.newContext() picks up the project's `use` (viewport, touch).
      const context = await browser.newContext();
      contexts.push(context);
      await stubApi(context, () => parseRows.current);
      // The app reaches the emulator only because it's on localhost; anything
      // that escapes to googleapis.com would hit production.
      await context.route(/^https:\/\/[^/]*googleapis\.com\//, (route) => {
        errors.push(`${label}: blocked a real Google API call: ${route.request().url()}`);
        return route.abort();
      });
      context.on("console", (msg) => {
        if (msg.type() !== "error") return;
        if (allowConsole.some((pattern) => pattern.test(msg.text()))) return;
        // "Failed to load resource" names no URL; its location does.
        const where = msg.location().url;
        errors.push(`${label}: ${msg.text()}${where ? ` (${where})` : ""}`);
      });
      context.on("weberror", (err) => errors.push(`${label}: ${err.error().message}`));
      const page = await context.newPage();
      if (!room) await registerOrganiser(page);
      return page;
    });
    for (const context of contexts) await context.close();
    expect(errors, "console errors").toEqual([]);
  },
});

export { expect };
