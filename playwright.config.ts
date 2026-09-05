import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  /**
   * One worker, stated rather than inherited. The default is half the machine's logical cores,
   * and `fullyParallel` being off only serialises tests *within* a file - files still run beside
   * each other. Every spec in this suite works the same shared fixture: the demo restaurant, and
   * table 7 in particular. `e2e/guest-order.spec.ts` and `e2e/kitchen-live.spec.ts` both open
   * "Table 7 as a guest" from the landing, and `e2e/admin.spec.ts` retires that table's code for
   * about thirty seconds while the web tier's memory of `GET /api/demo/links` expires
   * (apps/web/lib/demo-links.ts). On four cores or more those specs read the retired link and
   * fail, and `retries: 1` hides it rather than fixing it.
   *
   * The obvious alternative - give the reissue test a table no other spec claims - has nowhere to
   * get a signed link from: `GET /api/demo/links` hands out table 7 and nothing else does, and the
   * only other source of a token is the printed PDF.
   *
   * The suite also spends five of the ten sign-ins a minute the API allows one address, which one
   * worker keeps predictable as well.
   */
  workers: 1,
  use: { baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000', trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
