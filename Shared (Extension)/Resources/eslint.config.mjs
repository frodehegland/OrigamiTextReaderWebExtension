import js from "@eslint/js";
import globals from "globals";

const rules = {
  ...js.configs.recommended.rules,
  "no-unused-vars": ["warn", { argsIgnorePattern: "^_", caughtErrors: "none" }],
};

export default [
  { ignores: ["lib/fflate.min.js", "lib/purify.min.js"] },

  {
    files: [
      "background.js",
      "content/**/*.js",
      "lib/**/*.js",
      "reader/**/*.js",
    ],
    languageOptions: {
      sourceType: "script",
      globals: { ...globals.browser, ...globals.webextensions },
    },
    rules,
  },

  {
    files: ["test/**/*.js"],
    languageOptions: {
      sourceType: "commonjs",
      globals: { ...globals.node, ...globals.browser },
    },
    rules,
  },
];
