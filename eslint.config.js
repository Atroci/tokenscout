// Flat ESLint config. Minimal, type-aware lint for a zero-runtime-dep TS lib.
import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["**/dist/", "**/node_modules/", "_upstreams/"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      eqeqeq: ["error", "smart"],
      "no-console": "warn",
    },
  },
  {
    // Example scripts are meant to be run and print their output.
    files: ["**/examples/**/*.ts"],
    rules: { "no-console": "off" },
  },
);
