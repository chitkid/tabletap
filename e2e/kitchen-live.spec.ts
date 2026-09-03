import { expect, test, type Page } from '@playwright/test';

const LATENCY_BUDGET_MS = 500;
/**
 * `setOffline` blocks new connections but leaves an established WebSocket open, so the client
 * only learns it is offline when engine.io's heartbeat deadline passes: pingInterval (25 s) plus
 * pingTimeout (20 s) after the last packet, i.e. between 20 and 45 seconds. Measured 45.1 s here.
 * The banner still has to say exactly what it says; only the wait is long.
 */
const OFFLINE_DETECTION_MS = 60_000;

async function guestOrders(page: Page): Promise<{ number: number; placedAt: string }> {
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
  const id = page.url().split('/').pop()!;
  // The API is the clock: placedAt is server time, and the kitchen tab is read on the same host.
  const body = (await page.evaluate(
    async (orderId) => (await fetch(`/api/orders/${orderId}`)).json(),
    id,
  )) as { order: { number: number; placedAt: string } };
  return { number: body.order.number, placedAt: body.order.placedAt };
}

test('a placed order is on the kitchen board within 500 ms and the guest follows it to ready', async ({
  browser,
}) => {
  // The default 30 s does not cover the offline heartbeat above.
  test.setTimeout(OFFLINE_DETECTION_MS + 60_000);
  const kitchenContext = await browser.newContext();
  const guestContext = await browser.newContext();
  const kitchen = await kitchenContext.newPage();
  const guest = await guestContext.newPage();

  await kitchen.goto('/login?demo=kitchen');
  await kitchen.waitForURL('**/kitchen');
  // A connected board says nothing at all: the other status regions (a refused move, the rush
  // message) only appear after a control is used, so the bare role is the stronger assertion.
  const banner = kitchen.getByRole('status');
  await expect(banner).toHaveCount(0, { timeout: 10_000 }); // banner gone: the socket is up

  const { number, placedAt } = await guestOrders(guest);
  const ticket = kitchen.getByRole('heading', { name: `Table 7 · #${number}` });
  await expect(ticket).toBeVisible({ timeout: 5_000 });
  const visibleAt = Date.now();
  expect(visibleAt - Date.parse(placedAt)).toBeLessThan(LATENCY_BUDGET_MS);

  await kitchen.getByRole('button', { name: `Start #${number}` }).click();
  await expect(
    kitchen
      .getByRole('region', { name: 'Cooking' })
      .getByRole('heading', { name: `Table 7 · #${number}` }),
  ).toBeVisible();
  await expect(guest.getByRole('heading', { level: 1 })).toHaveText(
    `Order #${number} is being made.`,
  );
  await kitchen.getByRole('button', { name: `Ready #${number}` }).click();
  await expect(guest.getByRole('heading', { level: 1 })).toHaveText(`Order #${number} is ready.`);

  // Reconnect: the banner appears offline and the board matches the API once back online.
  await kitchenContext.setOffline(true);
  await expect(banner).toHaveText('Reconnecting… the board will catch up.', {
    timeout: OFFLINE_DETECTION_MS,
  });
  await kitchenContext.setOffline(false);
  await expect(banner).toHaveCount(0, { timeout: 15_000 });
  const active = (await kitchen.evaluate(async () =>
    (await fetch('/api/orders?active=1')).json(),
  )) as { orders: unknown[] };
  const boardCount = await kitchen.getByRole('article').count();
  expect(boardCount).toBe(active.orders.length);

  await kitchen.getByRole('button', { name: `Served #${number}` }).click();
  await expect(kitchen.getByRole('heading', { name: `Table 7 · #${number}` })).toHaveCount(0);
  await expect(guest.getByRole('heading', { level: 1 })).toHaveText(
    `Order #${number} was served. Enjoy.`,
  );

  await guestContext.close();
  await kitchenContext.close();
});
