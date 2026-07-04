import { defineConfig, globalIgnores } from "eslint/config";
import { FlatCompat } from "@eslint/eslintrc";

// eslint-config-next's subpath exports (core-web-vitals.js, typescript.js)
// are still legacy eslintrc-shaped shareable configs (`{ extends: [...] }`),
// not flat-config arrays, so they can't be imported and spread directly into
// a flat config. FlatCompat bridges the legacy "extends" shape into flat
// config the same way `next/core-web-vitals` works in eslintrc-based setups.
const compat = new FlatCompat({ baseDirectory: import.meta.dirname });

const eslintConfig = defineConfig([
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "scripts/**",
  ]),
]);

export default eslintConfig;
