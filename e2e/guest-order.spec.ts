import { expect, test, type Page } from '@playwright/test';
import { formatCents } from '../apps/web/lib/money';
import { fill, GUEST, LANDING, ORDER_NUMBER_IN_HEADLINE, plural, STATUS } from './dictionary';

/**
 * The two amounts this file asserts, priced by the API off the seed: two Хачапури по-аджарски at
 * 690 ₽ plus one Морс из клюквы at 260 ₽, and the drink on its own. Put through the product's own
 * `formatCents`, so the grouping, the side the symbol falls on and the U+00A0 before it are the
 * ones the screen has rather than a second opinion about them — `apps/web/lib/money.test.ts` is
 * what pins that shape. Named rather than written inline so a re-priced seed is one edit here, not
 * six scattered literals a reader checks against a dish name and never re-computes.
 */
const BASKET_TOTAL = formatCents(164_000, 'RUB');
const DRINK_TOTAL = formatCents(26_000, 'RUB');
const TABLE = 7;

/** Seed data, which the seed script owns — not interface copy, which the dictionary owns. */
const KHACHAPURI = 'Хачапури по-аджарски';
const MORS = 'Морс из клюквы';

/** The number out of the receipt's own headline: the only place a guest is ever shown it. */
async function orderNumberFrom(page: Page): Promise<number> {
  const headline = await page.getByRole('heading', { level: 1 }).textContent();
  const match = ORDER_NUMBER_IN_HEADLINE.exec(headline ?? '');
  expect(match, `no order number in ${String(headline)}`).not.toBeNull();
  return Number(match![1]);
}

/**
 * The order's *current* status as the badge says it, which is the glossary's guest column. Scoped
 * to the badge and not to a landmark: the progress rail names all five stages, so the bare word
 * matches a rail label too, and what this means is where the order is now.
 */
const badge = (page: Page, status: keyof typeof STATUS.guest) =>
  page.locator('[data-slot="status-badge"]').getByText(STATUS.guest[status], { exact: true });

test('a guest orders from the landing page QR link and pays for it', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: fill(LANDING.guestCta, { table: TABLE }) }).click();
  await page.waitForURL('**/menu');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(LANDING.brand);
  await expect(page.getByText(fill(GUEST.table, { number: TABLE }))).toBeVisible();
  // The first tap can land before React has hydrated the menu, and a click on a button that is
  // painted but not yet wired does nothing. Retry until the card answers by turning into a
  // stepper, then carry on.
  await expect(async () => {
    await page
      .getByRole('button', { name: fill(GUEST.menu.addDish, { name: KHACHAPURI }) })
      .click();
    await expect(
      page.getByRole('button', { name: fill(GUEST.menu.addOneMore, { name: KHACHAPURI }) }),
    ).toBeVisible({ timeout: 1_000 });
  }).toPass();
  await page
    .getByRole('button', { name: fill(GUEST.menu.addOneMore, { name: KHACHAPURI }) })
    .click();
  await page.getByRole('button', { name: fill(GUEST.menu.addDish, { name: MORS }) }).click();
  // The bar's whole line, not the money alone: the count is declined through ICU — «3 позиции», a
  // form a binary rule gets wrong — and either half on its own passes on a basket this is not.
  await expect(page.getByRole('region', { name: GUEST.basket.region })).toContainText(
    `${plural(GUEST.basketItems, 3)} · ${BASKET_TOTAL}`,
  );
  await page.getByRole('button', { name: GUEST.basket.open }).click();
  await page.getByRole('link', { name: GUEST.basket.checkout }).click();
  await page.waitForURL('**/checkout');
  await page.getByLabel(GUEST.checkout.noteLabel).fill('No basil');
  await page.getByRole('button', { name: GUEST.checkout.submit }).click();
  await page.waitForURL(/\/orders\/[0-9a-f-]{36}$/);

  // Placed is not paid: since M4 an order owes money before it is anything to the kitchen, and the
  // first line a guest reads has to say so. The number is read first and the whole sentence
  // asserted for it — a pattern with `\d+` in it passes on any other order's headline too.
  const number = await orderNumberFrom(page);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    fill(GUEST.order.headline.placed, { number }),
  );
  await expect(page.getByText(`2 × ${KHACHAPURI}`)).toBeVisible();
  await expect(page.getByText(`1 × ${MORS}`)).toBeVisible();
  await expect(page.getByText('No basil')).toBeVisible();
  await expect(badge(page, 'placed')).toBeVisible();

  // The receipt keeps a socket open, so `networkidle` never arrives there: retry the tap, the way
  // the menu does above, until the navigation it should have started actually starts.
  await expect(async () => {
    await page.getByRole('button', { name: fill(GUEST.pay.pay, { amount: BASKET_TOTAL }) }).click();
    await page.waitForURL(/\/pay\/[0-9a-f-]{36}$/, { timeout: 2_000 });
  }).toPass();
  // Nothing on the terminal touches the network until a button is pressed, so an idle one has its
  // bundle and has hydrated — the press below is the one that must settle the money.
  await page.waitForLoadState('networkidle');
  // The terminal names the order it is settling, shows the amount the API priced (never one the
  // browser worked out) and keeps its one promise about money.
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    fill(GUEST.pay.terminalHeading, { table: TABLE, number }),
  );
  await expect(page.getByText(BASKET_TOTAL, { exact: true })).toBeVisible();
  await expect(page.getByText(GUEST.pay.disclaimer)).toBeVisible();

  await page.getByRole('button', { name: fill(GUEST.pay.pay, { amount: BASKET_TOTAL }) }).click();
  await page.waitForURL(/\/orders\/[0-9a-f-]{36}\?paid=1$/);
  // The settlement, not the redirect, is what changed the headline: the query string only says
  // which way the guest came back.
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    fill(GUEST.order.headline.paid, { number }),
  );
  await expect(badge(page, 'paid')).toBeVisible();
  await expect(
    page.getByRole('button', { name: fill(GUEST.pay.pay, { amount: BASKET_TOTAL }) }),
  ).toHaveCount(0);
});

test('a declined payment leaves the order waiting and offers another attempt', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: fill(LANDING.guestCta, { table: TABLE }) }).click();
  await page.waitForURL('**/menu');
  await expect(async () => {
    await page.getByRole('button', { name: fill(GUEST.menu.addDish, { name: MORS }) }).click();
    await expect(
      page.getByRole('button', { name: fill(GUEST.menu.addOneMore, { name: MORS }) }),
    ).toBeVisible({ timeout: 1_000 });
  }).toPass();
  await page.getByRole('button', { name: GUEST.basket.open }).click();
  await page.getByRole('link', { name: GUEST.basket.checkout }).click();
  await page.waitForURL('**/checkout');
  await page.getByRole('button', { name: GUEST.checkout.submit }).click();
  await page.waitForURL(/\/orders\/[0-9a-f-]{36}$/);
  const number = await orderNumberFrom(page);

  await expect(async () => {
    await page.getByRole('button', { name: fill(GUEST.pay.pay, { amount: DRINK_TOTAL }) }).click();
    await page.waitForURL(/\/pay\/[0-9a-f-]{36}$/, { timeout: 2_000 });
  }).toPass();
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: GUEST.pay.decline }).click();
  await page.waitForURL(/\/orders\/[0-9a-f-]{36}\?paid=0$/);

  await expect(page.getByText(GUEST.order.paymentDeclined)).toBeVisible();
  // Nothing moved: the order still owes the same money and the way to pay it is still on screen.
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    fill(GUEST.order.headline.placed, { number }),
  );
  await expect(badge(page, 'placed')).toBeVisible();
  await expect(
    page.getByRole('button', { name: fill(GUEST.pay.pay, { amount: DRINK_TOTAL }) }),
  ).toBeVisible();
});

test('an expired QR code explains itself', async ({ page }) => {
  await page.goto('/t/not-a-token');
  // Scoped to main: Next.js appends its own empty role="alert" route announcer to the body.
  // `toHaveText` is whole-string, so this also refuses the sentence for a code that merely expired.
  await expect(page.getByRole('main').getByRole('alert')).toHaveText(GUEST.claim.invalid);
});
