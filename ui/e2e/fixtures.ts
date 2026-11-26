// Shared setup for every e2e test:
// - a clean Firestore emulator, so no test sees another's sessions (starting
//   a shared night is refused while another is planned);
// - no route to real Google APIs: the app only talks to the emulator because
//   the page is on localhost (firebase.ts), so any request that escapes to
//   *.googleapis.com fails the test instead of reaching production;
// - the API stubbed (e2e/api.ts);
// - any console error or uncaught exception fails the test, which is the
//   "no console errors" half of the manual check in README > Development.
//
// `phone()` opens another device (its own context, so its own localStorage and
// client id) with the same treatment, for the multi-phone flows.
import { type BrowserContext, type Page, expect, test as base } from "@playwright/test";
import { firebaseConfig } from "../firebase-config.js";
import { type ParseRows, stubApi } from "./api.js";

// firebase.json's emulator port. The emulator keys data by the project id the
// APP connects with, not test:e2e's --project, so clear that one.
//
// This is the emulator's own admin endpoint on this machine. Production
// Firestore has no such route, so the wipe can only ever empty the local
// emulator, whatever project id it names.
const EMULATOR = "http://127.0.0.1:8081";
const PROJECT = firebaseConfig.projectId;

interface Fixtures {
  phone: () => Promise<Page>;
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

export const test = base.extend<Fixtures>({
  // Playwright reads a fixture's dependencies off a destructured first
  // argument, so a fixture with none must still destructure.
  // eslint-disable-next-line no-empty-pattern
  parseRows: async ({}, use) => {
    await use({ current: [] });
  },

  // eslint-disable-next-line no-empty-pattern
  allowConsole: async ({}, use) => {
    await use([]);
  },

  phone: async ({ browser, parseRows, allowConsole }, use) => {
    await clearFirestore();
    const contexts: BrowserContext[] = [];
    const errors: string[] = [];
    await use(async () => {
      const label = `phone ${contexts.length + 1}`;
      // browser.newContext() picks up the project's `use` (viewport, touch).
      const context = await browser.newContext();
      contexts.push(context);
      await stubApi(context, () => parseRows.current);
      await context.route(/^https:\/\/[^/]*googleapis\.com\//, (route) => {
        errors.push(`${label}: blocked a real Google API call: ${route.request().url()}`);
        return route.abort();
      });
      context.on("console", (msg) => {
        if (msg.type() !== "error") return;
        if (allowConsole.some((pattern) => pattern.test(msg.text()))) return;
        errors.push(`${label}: ${msg.text()}`);
      });
      context.on("weberror", (err) => errors.push(`${label}: ${err.error().message}`));
      return context.newPage();
    });
    for (const context of contexts) await context.close();
    expect(errors, "console errors").toEqual([]);
  },
});

export { expect };
