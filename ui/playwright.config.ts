// Mobile smoke suite (#161): the real built app, on a phone-sized touch screen,
// against the Firestore emulator. Run it with `npm run test:e2e`, which starts
// the emulator around it; README > Development has the details.
import { defineConfig } from "@playwright/test";

const PORT = 4173;

export default defineConfig({
  testDir: "e2e",
  // The tests share one emulator database and wipe it before each test (see
  // e2e/fixtures.ts), so they can't run side by side.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? [["list"], ["github"]] : "list",
  use: {
    // localhost, not a LAN address: firebase.ts and getApiBase() in app.js
    // switch to the emulator and the local API only on localhost.
    baseURL: `http://localhost:${PORT}`,
    trace: "off",
  },
  projects: [
    {
      // One project, and it is a phone: the app is mobile-first (AGENTS.md),
      // so a desktop pass would mostly prove things nobody uses.
      name: "phone",
      use: {
        browserName: "chromium",
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: 1,
      },
    },
  ],
  webServer: {
    // The production bundle, as GitHub Pages serves it, not the dev server.
    command: `npm run build && npx vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
