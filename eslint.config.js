import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
      '**/migrations/**',
      'scripts/**',
      '**/*.cjs',
      '**/.claude/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { languageOptions: { globals: { ...globals.node } } },
  { rules: { '@typescript-eslint/consistent-type-imports': 'error' } },
  /**
   * The one type-aware rule in this repository, scoped to the end-to-end suite.
   *
   * A Playwright web-first assertion — `expect(locator).toBeVisible()`, `toHaveText`,
   * `toContainText`, `toHaveCount`, `toPass` — is async, and missing its `await` is *the* canonical
   * way a Playwright spec stops asserting: the expectation is never evaluated and the test passes
   * whatever the page does. Bringing `e2e/` under lint and typecheck was this milestone's headline
   * e2e work, and neither leg could see it. `tseslint.configs.recommended` has no type information,
   * so `no-floating-promises` was off everywhere; and a floating promise is perfectly type-valid,
   * so `tsc --noEmit -p tsconfig.e2e.json` cannot see one either. Measured: two deliberately false
   * un-awaited assertions planted in `e2e/staff-login.spec.ts` — one for text that exists nowhere
   * on the page, one asserting an English heading — left `lint` 6/6 and `typecheck` 6/6 green.
   *
   * Type-aware linting is not turned on repository-wide here. It needs a `project` per package and
   * costs a full program build on every lint run; this is one rule over 22 files, against the one
   * defect class that is specific to them, and `tsconfig.e2e.json` already exists to be pointed at.
   */
  {
    files: ['e2e/**/*.ts', 'playwright.config.ts'],
    languageOptions: {
      parserOptions: { project: './tsconfig.e2e.json', tsconfigRootDir: import.meta.dirname },
    },
    rules: { '@typescript-eslint/no-floating-promises': 'error' },
  },
);
