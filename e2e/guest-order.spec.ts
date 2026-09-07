import { expect, test, type Page } from '@playwright/test';

/** The number out of the receipt's own headline: the only place a guest is ever shown it. */
async function orderNumberFrom(page: Page): Promise<number> {
  const headline = await page.getByRole('heading', { level: 1 }).textContent();
  const match = /#(\d+)/.exec(headline ?? '');
  expect(match, `no order number in ${String(headline)}`).not.toBeNull();
  return Number(match![1]);
}

test('a guest orders from the landing page QR link and pays for it', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Table 7 as a guest' }).click();
  await page.waitForURL('**/menu');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Little Furnace');
  await expect(page.getByText('Table 7')).toBeVisible();
  // The first tap can land before React has hydrated the menu, and a click on a button that is
  // painted but not yet wired does nothing. Retry until the card answers by turning into a
  // stepper, then carry on.
  await expect(async () => {
    await page.getByRole('button', { name: 'Add Margherita Flatbread' }).click();
    await expect(
      page.getByRole('button', { name: 'Add one more Margherita Flatbread' }),
    ).toBeVisible({ timeout: 1_000 });
  }).toPass();
  await page.getByRole('button', { name: 'Add one more Margherita Flatbread' }).click();
  await page.getByRole('button', { name: 'Add House Lemonade' }).click();
  await expect(page.getByRole('region', { name: 'Basket' })).toContainText('3 items · $28.00');
  await page.getByRole('button', { name: 'View basket' }).click();
  await page.getByRole('link', { name: 'Go to checkout' }).click();
  await page.waitForURL('**/checkout');
  await page.getByLabel('Note for the kitchen').fill('No basil');
  await page.getByRole('button', { name: 'Place order' }).click();
  await page.waitForURL(/\/orders\/[0-9a-f-]{36}$/);

  // Placed is not paid: since M4 an order owes money before it is anything to the kitchen, and
  // the first line a guest reads has to say so.
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    /^Order #\d+ is waiting for payment\.$/,
  );
  const number = await orderNumberFrom(page);
  await expect(page.getByText('2 × Margherita Flatbread')).toBeVisible();
  await expect(page.getByText('1 × House Lemonade')).toBeVisible();
  await expect(page.getByText('No basil')).toBeVisible();
  // Scoped to the badge, not to a landmark: the progress rail names all five stages, so the bare
  // word matches its label too. What this line means is the order's *current* status, and the
  // badge is the thing that carries it wherever on the page the rail ends up living.
  await expect(
    page.locator('[data-slot="status-badge"]').getByText('Placed', { exact: true }),
  ).toBeVisible();

  // The receipt keeps a socket open, so `networkidle` never arrives there: retry the tap, the way
  // the menu does above, until the navigation it should have started actually starts.
  await expect(async () => {
    await page.getByRole('button', { name: 'Pay $28.00' }).click();
    await page.waitForURL(/\/pay\/[0-9a-f-]{36}$/, { timeout: 2_000 });
  }).toPass();
  // Nothing on the terminal touches the network until a button is pressed, so an idle one has its
  // bundle and has hydrated — the press below is the one that must settle the money.
  await page.waitForLoadState('networkidle');
  // The terminal names the order it is settling, shows the amount the API priced (never one the
  // browser worked out) and says out loud that none of it is real.
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(`Table 7 · Order #${number}`);
  await expect(page.getByText('$28.00', { exact: true })).toBeVisible();
  await expect(page.getByText('This is a demo. No card, no money.')).toBeVisible();

  await page.getByRole('button', { name: 'Pay $28.00' }).click();
  await page.waitForURL(/\/orders\/[0-9a-f-]{36}\?paid=1$/);
  // The settlement, not the redirect, is what changed the headline: the query string only says
  // which way the guest came back.
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    `Order #${number} sent to the kitchen.`,
  );
  await expect(
    page.locator('[data-slot="status-badge"]').getByText('Paid', { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: /^Pay/ })).toHaveCount(0);
});

test('a declined payment leaves the order waiting and offers another attempt', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Table 7 as a guest' }).click();
  await page.waitForURL('**/menu');
  await expect(async () => {
    await page.getByRole('button', { name: 'Add House Lemonade' }).click();
    await expect(page.getByRole('button', { name: 'Add one more House Lemonade' })).toBeVisible({
      timeout: 1_000,
    });
  }).toPass();
  await page.getByRole('button', { name: 'View basket' }).click();
  await page.getByRole('link', { name: 'Go to checkout' }).click();
  await page.waitForURL('**/checkout');
  await page.getByRole('button', { name: 'Place order' }).click();
  await page.waitForURL(/\/orders\/[0-9a-f-]{36}$/);
  const number = await orderNumberFrom(page);

  await expect(async () => {
    await page.getByRole('button', { name: 'Pay $4.00' }).click();
    await page.waitForURL(/\/pay\/[0-9a-f-]{36}$/, { timeout: 2_000 });
  }).toPass();
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: 'Decline' }).click();
  await page.waitForURL(/\/orders\/[0-9a-f-]{36}\?paid=0$/);

  await expect(page.getByText('Payment declined. Try again.')).toBeVisible();
  // Nothing moved: the order still owes the same money and the way to pay it is still on screen.
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    `Order #${number} is waiting for payment.`,
  );
  await expect(
    page.locator('[data-slot="status-badge"]').getByText('Placed', { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Pay $4.00' })).toBeVisible();
});

test('an expired QR code explains itself', async ({ page }) => {
  await page.goto('/t/not-a-token');
  // Scoped to main: Next.js appends its own empty role="alert" route announcer to the body.
  await expect(page.getByRole('main').getByRole('alert')).toHaveText('This QR code is not valid.');
});
