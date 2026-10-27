import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "dist",
      "coverage",
      "release",
      "android/app/build",
      "ios/build",
      "node_modules",
      "marketing",
    ],
  },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // React Compiler extras in eslint-plugin-react-hooks 7.1+ conflict with common patterns
      // (effects resetting UI, react-hook-form watch(), etc.). Disabled so strict CI
      // (`eslint --max-warnings 0`) stays green until targeted refactors land.
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/immutability": "off",
      "react-hooks/preserve-manual-memoization": "off",
      "react-hooks/static-components": "off",
      "react-hooks/incompatible-library": "off",
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
  {
    // Production code should use DataProvider. Keep direct Dexie access in its
    // implementation only; tests and benchmarks may use Dexie for setup/assertions.
    files: ["src/**/*.{ts,tsx}"],
    ignores: [
      "src/lib/dexieDB.ts",
      "src/providers/LocalDataProvider.ts",
      "src/**/*.test.ts",
      "src/**/*.test.tsx",
      "src/benchmarks/**",
    ],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "ImportDeclaration[source.value=/dexieDB/]",
          message:
            "Use DataProvider instead of importing Dexie in production code.",
        },
        {
          selector: "ImportExpression[source.value=/dexieDB/]",
          message:
            "Use DataProvider instead of dynamically importing Dexie in production code.",
        },
        {
          selector:
            "CallExpression[callee.name='require'][arguments.0.value=/dexieDB/]",
          message:
            "Use DataProvider instead of requiring Dexie in production code.",
        },
      ],
    },
  },
);
