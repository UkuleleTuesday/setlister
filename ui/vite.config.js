import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [svelte()],
  // Relative URLs so the build works under the GitHub Pages subpath.
  base: "./",
  server: {
    // Port 3000 matches the CORS allowlist in utrequests/config.py.
    port: 3000,
  },
  build: {
    outDir: "dist",
  },
  test: {
    // e2e/ is Playwright's.
    include: ["tests/**/*.test.ts"],
  },
});
