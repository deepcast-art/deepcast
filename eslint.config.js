import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', 'playwright-report', 'test-results']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      // An underscore prefix marks a deliberately unused parameter too (e.g. a
      // destructured option kept for API compatibility) — same convention as
      // the variable pattern.
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]', argsIgnorePattern: '^_' }],
      // Hot-reload hygiene, not correctness: three long-standing files export a
      // hook or helper beside a component on purpose (useAuth beside its
      // provider; NetworkGraph's re-exports for the legacy screening). CI lint
      // is a gate since 2026-09-03 (docs/SHIP-PROTOCOL.md), so this stays a
      // warning — visible, never blocking.
      'react-refresh/only-export-components': 'warn',
    },
  },
  {
    // Server-side scripts, Playwright specs AND the Playwright configs run under
    // Node — give them Node globals (process, Buffer, …).
    files: [
      'server/**/*.js',
      'scripts/**/*.js',
      'e2e/**/*.js',
      'verify-flow.js',
      'playwright.config.js',
      'playwright.local.config.js',
    ],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
  },
])
