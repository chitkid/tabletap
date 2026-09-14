import { expect, test, type Locator, type Page } from '@playwright/test';
import { ADMIN, fill, GUEST, KITCHEN, LANDING } from './dictionary';

/**
 * The layout guards for the Russian strings, measured rather than asserted about.
 *
 * **This file exists because jsdom does no layout.** Every other guard in this repository can say
 * what classes an element carries; none of them can say that three buttons ended up on two lines,
 * that a confirmation ran 62 px past the card holding it, or that a control changed width when it
 * changed word. Those are the four breaks the Russian strings caused, and the only instrument that
 * can see them is a browser with the strings on screen. So: real geometry, at 375 px and 1280 px,
 * against the dictionary's own words.
 *
 * Every *layout* assertion here is a comparison between two measured numbers or a count of
 * distinct top edges — never a class list. (Two assertions in this file are not layout: the
 * seeded basket total is confirmed with `toContainText('11 510')`, and the parsed order number
 * with `not.toBeNaN()` — both guard the fixture the layout checks then run against, not geometry.)
 * Four checks were each proved by reverting the one fix they guard and watching it go red — R3,
 * R4, R8 and R6 — with the figures in
 * `.superpowers/sdd/2026-09-14-russian-localisation/task-10-report.md`. Two more stand as a net
 * rather than a proof of a fix: the landing's sideways-scroll loop guards Task 4's replacement of
 * the section the audit found already broken in English, and the basket-bar check guards a site
 * this task measured clean and deliberately left alone. Both are worth having; neither has a
 * revert of its own that turns it red.
 *
 * Every *string from the interface* comes from `messages/ru.json` through `./dictionary`, never
 * typed against the screen: a hand-typed «В наличии» drifts from the dictionary by a character and
 * stops asserting anything while still reading as if it did. Seed data — `FIRST_CATEGORY`, the
 * dish names passed to `addDish` — is named directly instead, because it is fixture data the seed
 * script owns, not interface copy the dictionary owns.
 *
 * **Correction, task 11.** An earlier version of this note said `getByRole(…, { name })` matches
 * with an identity normaliser and therefore needs the dictionary's real U+00A0. That is
 * `@testing-library/dom`'s rule, not Playwright's, and it was carried across from the jsdom tests
 * without being checked here. Playwright normalises whitespace on *both* sides of a name or text
 * comparison, U+00A0 included, so a dictionary string goes to a locator as it comes — and only a
 * RegExp escapes that, which is why the two left in this file spell their spaces `\s`. The rule
 * that does apply is stated once, in `./dictionary`.
 */

/** The seed's first category, the same fixture `e2e/admin.spec.ts` works from. */
const FIRST_CATEGORY = 'Из печи';

/** The two the brief names, plus the narrowest phone the guest surface is built for. */
const NARROW = 320;
const PHONE = 375;
const DESKTOP = 1280;

type Box = { left: number; right: number; top: number; width: number; height: number };

async function boxOf(locator: Locator): Promise<Box> {
  return locator.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { left: r.left, right: r.right, top: r.top, width: r.width, height: r.height };
  });
}

/** The right edge of an element's content box: its border box less border and padding. */
async function contentRightOf(locator: Locator): Promise<number> {
  return locator.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return r.right - parseFloat(cs.paddingRight) - parseFloat(cs.borderRightWidth);
  });
}

/** How many lines a set of elements occupies: one distinct top edge per line. */
async function lineCount(locator: Locator): Promise<number> {
  const tops = await locator.evaluateAll((els) =>
    els.map((el) => Math.round(el.getBoundingClientRect().top)),
  );
  return new Set(tops).size;
}

/** How far the document can be scrolled sideways. Zero, on every page, at every width. */
async function sidewaysScroll(page: Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
}

async function guestMenu(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByRole('link', { name: fill(LANDING.guestCta, { table: 7 }) }).click();
  await page.waitForURL('**/menu');
  await page.getByRole('article').first().waitFor();
}

/**
 * Adds `times` portions of one dish. The first press is «Добавить», every one after it is the
 * stepper's own control — and the press is retried until the card answers, because the first tap
 * can land on a button that is painted but not yet hydrated.
 */
async function addDish(page: Page, name: string, times: number): Promise<void> {
  const more = page.getByRole('button', { name: fill(GUEST.menu.addOneMore, { name }) }).first();
  for (let i = 0; i < times; i++) {
    const control =
      i === 0
        ? page.getByRole('button', { name: fill(GUEST.menu.addDish, { name }) }).first()
        : more;
    await expect(async () => {
      await control.click({ timeout: 2_000 });
      await more.waitFor({ state: 'visible', timeout: 2_000 });
    }).toPass({ timeout: 30_000 });
  }
}

test('the guest surface holds every row it puts side by side', async ({ page }) => {
  test.setTimeout(120_000);

  // The landing. This is the one Priority 5 finding the audit recorded as already broken in
  // English — three `sm:grid-cols-3` cards whose `w-full` nowrap CTAs widened their own columns
  // between 640 and 768 px. Task 4 replaced that section outright, so the check is that the
  // replacement does not scroll sideways anywhere, rather than a fix of its own.
  await page.goto('/');
  for (const width of [NARROW, PHONE, 640, 700, 767, DESKTOP]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await sidewaysScroll(page), `landing at ${width}px`).toBe(0);
  }

  // The basket bar over the menu it covers. `menu-screen.tsx` reserves a fixed `pb-28`, so the
  // measurement that matters is not whether the bar wrapped but whether anything ended up behind
  // it. A five-figure total in a ten-portion basket is the widest line the bar can be asked to
  // hold: «10 позиций · 11 510 ₽».
  await page.setViewportSize({ width: PHONE, height: 900 });
  await guestMenu(page);
  await addDish(page, 'Рагу из телятины с айвой', 9);
  await addDish(page, 'Плов с бараниной', 1);
  const bar = page.getByRole('region', { name: GUEST.basket.region });
  await expect(bar).toContainText('11 510');
  for (const width of [NARROW, PHONE, DESKTOP]) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    const lastCard = page.getByRole('article').last();
    expect(
      (await boxOf(lastCard)).top + (await boxOf(lastCard)).height,
      `the bar covers the last dish at ${width}px`,
    ).toBeLessThanOrEqual((await boxOf(bar)).top);
  }

  // The terminal. Pay and Decline are one row inside a `max-w-sm` card. `grid-cols-2` is
  // `repeat(2, minmax(0, 1fr))` — its minimum is 0, so it never widened to push the card open.
  // What outgrew its box was the label, inside its own button's content box: `shrink-0
  // whitespace-nowrap` on the base button means a label that needs more room than that box has
  // just overflows it in place. At 375 px the five-figure total needed only 1.22 px per side more
  // than its button had — real, but into the button's own padding, nothing clipped, no visible
  // break. 320 px carries the visible one, where the same label runs past the button's painted
  // edge.
  await page.setViewportSize({ width: PHONE, height: 900 });
  await page.getByRole('button', { name: GUEST.basket.open }).click();
  await page.getByRole('link', { name: GUEST.basket.checkout }).click();
  await page.waitForURL('**/checkout');
  await expect(async () => {
    await page.getByRole('button', { name: GUEST.checkout.submit }).click({ timeout: 2_000 });
    await page.waitForURL(/\/orders\/[0-9a-f-]{36}$/, { timeout: 5_000 });
  }).toPass({ timeout: 60_000 });
  await expect(async () => {
    await page.getByRole('button', { name: /Оплатить/ }).click({ timeout: 2_000 });
    await page.waitForURL('**/pay/**', { timeout: 5_000 });
  }).toPass({ timeout: 60_000 });

  const pay = page.getByRole('button', { name: /Оплатить/ });
  const decline = page.getByRole('button', { name: GUEST.pay.decline });
  for (const width of [NARROW, PHONE, DESKTOP]) {
    await page.setViewportSize({ width, height: 900 });
    for (const button of [pay, decline]) {
      // Sub-pixel, on purpose. `scrollWidth - clientWidth` rounds to whole pixels, and a grid
      // column 2.44 px too narrow for «Оплатить 11 510 ₽» reports zero through it — the exact
      // case this row is here to catch. A Range measures the drawn text against the button's own
      // content box and rounds nothing away.
      const fit = await button.evaluate((el) => {
        const range = document.createRange();
        range.selectNodeContents(el);
        const style = getComputedStyle(el);
        const inset = ['paddingLeft', 'paddingRight', 'borderLeftWidth', 'borderRightWidth']
          .map((side) => parseFloat(style[side as 'paddingLeft']))
          .reduce((total, side) => total + side, 0);
        return {
          label: range.getBoundingClientRect().width,
          inner: el.getBoundingClientRect().width - inset,
        };
      });
      expect(fit.label, `a label ran past its content box at ${width}px`).toBeLessThanOrEqual(
        fit.inner + 0.02,
      );
    }
    expect(await sidewaysScroll(page), `the terminal at ${width}px`).toBe(0);
  }
});

test('the kitchen ticket keeps its cancel confirmation inside the card', async ({ browser }) => {
  test.setTimeout(120_000);
  const guestContext = await browser.newContext();
  const guest = await guestContext.newPage();
  await guestMenu(guest);
  await addDish(guest, 'Морс из клюквы', 1);
  await guest.getByRole('button', { name: GUEST.basket.open }).click();
  await guest.getByRole('link', { name: GUEST.basket.checkout }).click();
  await guest.waitForURL('**/checkout');
  await expect(async () => {
    await guest.getByRole('button', { name: GUEST.checkout.submit }).click({ timeout: 2_000 });
    await guest.waitForURL(/\/orders\/[0-9a-f-]{36}$/, { timeout: 5_000 });
  }).toPass({ timeout: 60_000 });
  const headline = await guest.getByRole('heading', { level: 1 }).textContent();
  const number = Number(/№\s(\d+)/.exec(headline ?? '')?.[1]);
  expect(number, `no order number in ${String(headline)}`).not.toBeNaN();
  // Paid, because an unpaid order is not the kitchen's work and never reaches the board.
  await expect(async () => {
    await guest.getByRole('button', { name: /Оплатить/ }).click({ timeout: 2_000 });
    await guest.waitForURL('**/pay/**', { timeout: 5_000 });
  }).toPass({ timeout: 60_000 });
  await expect(async () => {
    await guest.getByRole('button', { name: /Оплатить/ }).click({ timeout: 2_000 });
    await guest.waitForURL(/\?paid=1$/, { timeout: 8_000 });
  }).toPass({ timeout: 60_000 });

  const page = await (await browser.newContext()).newPage();
  await page.goto('/login?demo=kitchen');
  await page.waitForURL('**/kitchen');
  const card = page
    .getByRole('article')
    .filter({ has: page.getByRole('heading', { name: new RegExp(`№\\s${number}$`) }) });
  await card.waitFor({ timeout: 30_000 });
  await card.getByRole('button', { name: fill(KITCHEN.ticket.cancel, { number }) }).click();
  const group = page.getByRole('group', {
    name: fill(KITCHEN.ticket.confirm, { number }),
  });
  await group.waitFor();

  for (const width of [PHONE, DESKTOP]) {
    await page.setViewportSize({ width, height: 900 });
    // The question and its two answers inside the card that asked, with nothing hanging off the
    // right of it. Before `flex-wrap` the three were one unbreakable line 370.5 px long.
    expect(
      (await boxOf(group)).right,
      `the confirmation hangs off the ticket at ${width}px`,
    ).toBeLessThanOrEqual(await contentRightOf(card));
    expect(await sidewaysScroll(page), `the board at ${width}px`).toBe(0);
    // The question takes a line of its own, so the two answers are never squeezed beside it.
    expect(await lineCount(group.locator(':scope > *')), `the confirmation at ${width}px`).toBe(2);
  }
});

test('the admin row keeps its controls on one line and its switch one width', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/login?demo=admin&next=/admin');
  await page.waitForURL('**/admin/dashboard', { timeout: 40_000 });

  await page.goto('/admin/tables');
  const row = page
    .getByRole('row')
    .filter({ has: page.getByRole('button', { name: ADMIN.qr.reissue }) })
    .first();
  const controls = row.getByRole('button');
  for (const width of [PHONE, DESKTOP]) {
    await page.setViewportSize({ width, height: 900 });
    // «Изменить» + «Отключить» + «Перевыпустить QR-код» need 416.18 px; `min-w-80` left them 296
    // and the third sat under the other two, in every row, at both widths.
    expect(await lineCount(controls), `the table row's controls at ${width}px`).toBe(1);
  }

  await page.getByRole('button', { name: ADMIN.qr.reissue }).first().click();
  const yes = page.getByRole('button', { name: ADMIN.qr.confirm }).first();
  await yes.waitFor();
  for (const width of [PHONE, DESKTOP]) {
    await page.setViewportSize({ width, height: 900 });
    expect((await boxOf(yes)).top, `the reissue answers at ${width}px`).toBe(
      (await boxOf(page.getByRole('button', { name: ADMIN.qr.keep }).first())).top,
    );
  }
  await page.getByRole('button', { name: ADMIN.qr.keep }).first().click();

  await page.goto('/admin/menu');

  // The category editor's caption became visible, and `ROW_LINE` says that costs the row no
  // height: "a table whose lines change size when a cell becomes an input jumps under the hand
  // that pressed Edit". The caption sits beside the input rather than above it for that reason,
  // so the open row has to measure exactly what the closed one did — at the *same* width, since a
  // `closedHeight` taken once and reused for every width would still pass if the closed row's own
  // height ever differed by width and the open row grew to match it rather than its own closed
  // baseline. Open, measure, close again inside the loop so each width checks itself.
  const closedRow = page.getByRole('row').filter({ hasText: FIRST_CATEGORY }).first();
  for (const width of [PHONE, DESKTOP]) {
    await page.setViewportSize({ width, height: 900 });
    const closedHeight = (await boxOf(closedRow)).height;
    await closedRow.getByRole('button', { name: ADMIN.actions.edit }).click();
    const categoryName = page.getByLabel(ADMIN.menu.categoryName);
    await categoryName.waitFor();
    const opened = page.getByRole('row').filter({ has: page.getByLabel(ADMIN.menu.categoryName) });
    expect((await boxOf(opened)).height, `the open category row at ${width}px`).toBe(closedHeight);
    await page.getByRole('button', { name: ADMIN.actions.cancel }).first().click();
    await categoryName.waitFor({ state: 'detached' });
  }

  await page.getByRole('button', { name: ADMIN.actions.edit }).nth(1).click();
  const toggle = page.getByRole('switch', { name: ADMIN.menu.available });
  await toggle.waitFor();
  for (const width of [PHONE, DESKTOP]) {
    await page.setViewportSize({ width, height: 900 });
    // The reservation, measured: «Закончилось» is 15.43 px wider than «В наличии», and the
    // `outline` variant carries 2 px of border the `secondary` one does not. Both are reserved,
    // so pressing the switch moves nothing — not the control, and not the column holding it.
    const before = await boxOf(toggle);
    await toggle.click();
    const after = await boxOf(toggle);
    expect(after.width, `the switch changed width at ${width}px`).toBe(before.width);
    await toggle.click();
  }
  await page.getByRole('button', { name: ADMIN.actions.cancel }).first().click();
});
