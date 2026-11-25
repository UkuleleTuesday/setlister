import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

// Rest-sibling destructuring is how we drop fields from a row:
// `({ uid, source, ...rest }) => rest`.
const unusedVars = ["error", { ignoreRestSiblings: true }];

export default tseslint.config(
  { ignores: ["dist/"] },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    // typescript-eslint's version covers .js and .ts alike. The base rule is
    // off everywhere: it misreads TS (flags parameter names in function
    // types) and would report every JS hit twice.
    rules: {
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": unusedVars,
    },
  },
  {
    files: ["*.{js,ts}"],
    languageOptions: { globals: globals.browser },
  },
  {
    // Config files run under Node, not in the page.
    files: ["eslint.config.js", "vite.config.js", "playwright.config.ts"],
    languageOptions: { globals: globals.node },
  },
  {
    files: ["e2e/**/*.ts"],
    languageOptions: { globals: globals.node },
  },
  {
    files: ["tests/**/*.{js,ts}"],
    languageOptions: { globals: { ...globals.node, ...globals.vitest } },
  },
);
