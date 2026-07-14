import { defineConfig } from "vite";

export default defineConfig({
  // Use relative asset URLs so the built site works under the GitHub Pages
  // subpath (https://ukuleletuesday.github.io/setlister/).
  base: "./",
  server: {
    // Port 3000 matches the existing CORS allowlist in utrequests/config.py.
    port: 3000,
  },
  build: {
    outDir: "dist",
  },
});
