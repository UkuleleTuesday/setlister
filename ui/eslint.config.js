import js from "@eslint/js";
import svelte from "eslint-plugin-svelte";
import globals from "globals";
import tseslint from "typescript-eslint";

// Rest-sibling destructuring is how we drop fields: `({ uid, ...rest }) => rest`.
const unusedVars = ["error", { ignoreRestSiblings: true }];

export default tseslint.config(
  { ignores: ["dist/"] },
  js.configs.recommended,
  tseslint.configs.recommended,
  svelte.configs.recommended,
  {
    files: ["**/*.svelte", "**/*.svelte.ts"],
    languageOptions: { parserOptions: { parser: tseslint.parser } },
  },
  {
    // The base rule misreads TS (flags parameter names in function types) and
    // would double-report JS, which typescript-eslint's version covers too.
    rules: {
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": unusedVars,
    },
  },
  {
    files: ["*.{js,ts,svelte}"],
    languageOptions: { globals: globals.browser },
  },
  {
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
