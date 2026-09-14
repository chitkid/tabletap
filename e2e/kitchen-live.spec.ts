import { expect, test, type Page } from '@playwright/test';
import { formatCents } from '../apps/web/lib/money';
import { fill, GUEST, KITCHEN, LANDING, ORDER_NUMBER_IN_HEADLINE } from './dictionary';

const LATENCY_BUDGET_MS = 500;
/**
 * `setOffline` blocks new connections but leaves an established WebSocket open, so the board finds
 * out one of two ways: the browser's own `offline` event, which it listens for, or engine.io's
 * heartbeat deadline — now a 10 s interval plus a 5 s timeout rather than the 25 + 20 defaults
 * that used to make this take 45 seconds. Either path is comfortably inside this budget.
 */
const OFFLINE_DETECTION_MS = 20_000;
/**
 * What the board draws (ADR 0010). `active=1` still counts an order that is `placed` and unpaid —
 * the guest's problem, not the kitchen's — and the board holds it without ever giving it a column.
 */
const BOARD_STATUSES = ['paid', 'cooking', 'ready'];
/**
 * One Морс из клюквы at 260 ₽, so the amount on the button and on the terminal is this one — the
 * API prices it off the seed, and `formatCents` is the product's own last step, so the string here
 * is the string on screen rather than a guess at its grouping and its U+00A0.
 */
const DRINK_TOTAL = formatCents(26_000, 'RUB');
const PAY = fill(GUEST.pay.pay, { amount: DRINK_TOTAL });
const TABLE = 7;
/** Seed data, which the seed script owns — not interface copy, which the dictionary owns. */
const MORS = 'Морс из клюквы';

/** The guest flow as far as the receipt: an order that exists, owes money and is nobody's ticket. */
async function guestOrders(page: Page): Promise<{ id: string; number: number }> {
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
  const id = page.url().split('/').pop()!;
  const headline = await page.getByRole('heading', { level: 1 }).textContent();
  const number = Number(ORDER_NUMBER_IN_HEADLINE.exec(headline ?? '')?.[1]);
  expect(number, `no order number in ${String(headline)}`).not.toBeNaN();
  return { id, number };
}

/** Reads the server's own clock: `paidAt` is stamped by `settlePayment`, never by the browser. */
async function paidAtOf(page: Page, id: string): Promise<string> {
  const body = (await page.evaluate(
    async (orderId) => (await fetch(`/api/orders/${orderId}`)).json(),
    id,
  )) as { order: { paidAt: string | null } };
  expect(body.order.paidAt).not.toBeNull();
  return body.order.paidAt!;
}

test('a paid order is on the kitchen board within 500 ms and the guest follows it to ready', async ({
  browser,
}) => {
  // Two contexts, an order placed and paid through the whole guest flow, three bumps and a
  // reconnect: more than the default 30 s allows, even now that the offline wait is short.
  test.setTimeout(90_000);
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

  const { id, number } = await guestOrders(guest);
  const ticketName = fill(KITCHEN.ticket.heading, { table: TABLE, number });
  const ticket = kitchen.getByRole('heading', { name: ticketName });
  // The order is placed, the socket has had the whole guest round trip to deliver it, and the
  // pass has still never seen it: an unpaid order is not work the kitchen may start.
  await expect(ticket).toHaveCount(0);

  // The receipt keeps a socket open, so `networkidle` never arrives there: retry the tap, the way
  // the menu does, until the navigation it should have started actually starts.
  await expect(async () => {
    await guest.getByRole('button', { name: PAY }).click();
    await guest.waitForURL(/\/pay\/[0-9a-f-]{36}$/, { timeout: 2_000 });
  }).toPass();
  // Nothing on the terminal touches the network until a button is pressed, so an idle one has its
  // bundle and has hydrated. The measured tap has to land first time: a retry loop would move the
  // start of the measurement off the press it is measuring from.
  await guest.waitForLoadState('networkidle');
  // The clock starts on the press, not on the trip back: the guest's own page is still being
  // rendered while the ticket is already crossing to the board.
  await guest.getByRole('button', { name: PAY }).click();
  await expect(ticket).toBeVisible({ timeout: 5_000 });
  const visibleAt = Date.now();
  await guest.waitForURL(/\/orders\/[0-9a-f-]{36}\?paid=1$/);
  const paidAt = await paidAtOf(guest, id);
  const latencyMs = visibleAt - Date.parse(paidAt);
  // Both numbers this spec exists to measure, in the run's own output: a budget that passes at
  // 480 ms is worth knowing about before it stops passing.
  console.log(`payment to kitchen: ${latencyMs} ms`);
  expect(latencyMs).toBeLessThan(LATENCY_BUDGET_MS);
  await expect(guest.getByRole('heading', { level: 1 })).toHaveText(
    fill(GUEST.order.headline.paid, { number }),
  );

  /**
   * The bump verbs are keyed by the status the ticket is in, not the one it is going to:
   * `bump.paid` is «Готовить», `bump.cooking` is «Отдать», `bump.ready` is «Подать». Read that way
   * here so the spec cannot drift from `kitchen.ticket.bump` by a press.
   */
  await kitchen.getByRole('button', { name: fill(KITCHEN.ticket.bump.paid, { number }) }).click();
  await expect(
    kitchen
      .getByRole('region', { name: KITCHEN.columns.cooking })
      .getByRole('heading', { name: ticketName }),
  ).toBeVisible();
  await expect(guest.getByRole('heading', { level: 1 })).toHaveText(
    fill(GUEST.order.headline.cooking, { number }),
  );
  await kitchen
    .getByRole('button', { name: fill(KITCHEN.ticket.bump.cooking, { number }) })
    .click();
  // The guest's own column of the glossary: «готов — сейчас принесут», never the board's «Готов».
  await expect(guest.getByRole('heading', { level: 1 })).toHaveText(
    fill(GUEST.order.headline.ready, { number }),
  );

  // Reconnect: the banner appears offline and the board matches the API once back online.
  const wentOffline = Date.now();
  await kitchenContext.setOffline(true);
  await expect(banner).toHaveText(KITCHEN.connection.offline, {
    timeout: OFFLINE_DETECTION_MS,
  });
  console.log(`offline banner: ${Date.now() - wentOffline} ms`);
  await kitchenContext.setOffline(false);
  await expect(banner).toHaveCount(0, { timeout: 15_000 });
  const active = (await kitchen.evaluate(async () =>
    (await fetch('/api/orders?active=1')).json(),
  )) as { orders: { status: string }[] };
  const boardCount = await kitchen.getByRole('article').count();
  expect(boardCount).toBe(active.orders.filter((o) => BOARD_STATUSES.includes(o.status)).length);

  await kitchen.getByRole('button', { name: fill(KITCHEN.ticket.bump.ready, { number }) }).click();
  await expect(kitchen.getByRole('heading', { name: ticketName })).toHaveCount(0);
  await expect(guest.getByRole('heading', { level: 1 })).toHaveText(
    fill(GUEST.order.headline.served, { number }),
  );

  await guestContext.close();
  await kitchenContext.close();
});
