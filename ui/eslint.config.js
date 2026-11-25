import js from "@eslint/js";
import globals from "globals";

export default [
  { ignores: ["dist/"] },
  js.configs.recommended,
  {
    rules: {
      // `({ a, b, ...rest }) => rest` is how we drop fields from a row.
      "no-unused-vars": ["error", { ignoreRestSiblings: true }],
    },
  },
  {
    files: ["*.js"],
    languageOptions: { globals: globals.browser },
  },
  {
    // Config files run under Node, not in the page.
    files: ["eslint.config.js", "vite.config.js"],
    languageOptions: { globals: globals.node },
  },
  {
    files: ["tests/**/*.js"],
    languageOptions: { globals: { ...globals.node, ...globals.vitest } },
  },
];
