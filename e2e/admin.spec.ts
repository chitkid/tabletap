import { expect, test, type Page } from '@playwright/test';

/**
 * The admin surface end to end: a write the guest surface can see, and a revocation the guest
 * surface obeys. Both go through the browser the operator actually uses — no API shortcuts for
 * the acts under test, only for reading the fixture the printed code came from.
 */

/** The seed's first category, which is where the brief puts the new dish. */
const FIRST_CATEGORY = 'Flatbreads';
/** The demo table every guest spec claims; the one `GET /api/demo/links` hands out. */
const DEMO_TABLE = 7;

/** A table token in a `/t/…` link: three base64url segments, the JWS compact form. */
const TOKEN_IN_LINK = /\/t\/([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)/;

/**
 * The `v` claim out of a table token, read and never verified. The signature is the server's
 * business; this only has to say which code a link is carrying, and the version is the one field
 * a reissue moves.
 *
 * An absent `v` reads as 1, which is ADR 0013's central compatibility decision: every code minted
 * before M5 carries no version and is still the table's first one. Failing on a versionless token
 * would make this helper contradict the rule the feature is built on.
 */
function qrVersionOf(token: string): number {
  const payload = token.split('.')[1];
  expect(payload, `no payload in ${token}`).toBeDefined();
  const claims = JSON.parse(Buffer.from(payload!, 'base64url').toString('utf8')) as { v?: unknown };
  const version = claims.v ?? 1;
  expect(typeof version, `version claim is not a number in ${token}`).toBe('number');
  return version as number;
}

/**
 * Signed in through the credential-free demo route, landing on the admin door rather than the
 * kitchen board that `/login?demo=admin` opens by default. `/admin` is a redirect, so the wait is
 * on the room it opens.
 */
async function signInAsAdmin(page: Page): Promise<void> {
  await page.goto('/login?demo=admin&next=/admin');
  try {
    // Its own deadline, comfortably inside the test's: the page has to still be open for the
    // diagnostic below to read anything off it, and a wait that runs to the test's own timeout is
    // torn down before the catch can look.
    await page.waitForURL('**/admin/dashboard', { timeout: 30_000 });
  } catch (error) {
    // The form's own live region says why when it knows: most often "Too many attempts", because
    // the API allows ten sign-ins a minute from one address and a whole suite run spends five of
    // them. Without this the failure is a bare timeout somewhere further down the test.
    const said = await page
      .getByRole('status')
      .textContent({ timeout: 2_000 })
      .catch(() => null);
    throw new Error(
      `sign-in did not reach the admin dashboard${said === null ? '' : `: ${said.trim()}`}`,
      { cause: error },
    );
  }
}

test('an admin adds a dish and a guest sees it', async ({ browser }) => {
  // Two contexts and a write that has to travel from one to the other, on a stack built for
  // production rather than for speed: more than the default 30 s allows.
  test.setTimeout(90_000);
  const adminContext = await browser.newContext();
  const guestContext = await browser.newContext();
  const admin = await adminContext.newPage();
  const guest = await guestContext.newPage();

  await signInAsAdmin(admin);
  await admin.getByRole('link', { name: 'Menu' }).click();
  await admin.waitForURL('**/admin/menu');
  await expect(admin.getByRole('heading', { level: 1 })).toHaveText('Menu');

  // Unique to the run: the dish is left on the menu afterwards, and a second run must not collide
  // with the first one's row.
  const dish = `Test dish ${Date.now()}`;
  const price = '9.50';
  const shown = '$9.50';

  const category = admin.getByRole('rowgroup', { name: FIRST_CATEGORY });
  // The first press can land before React has hydrated the table, and a click on a button that is
  // painted but not yet wired does nothing. Retry until the row answers by opening an editor. A
  // second press is harmless: opening a draft discards the draft before it.
  await expect(async () => {
    await category.getByRole('button', { name: 'Add dish' }).click();
    await expect(admin.getByRole('textbox', { name: 'Name' })).toBeVisible({ timeout: 1_000 });
  }).toPass();
  await admin.getByRole('textbox', { name: 'Name' }).fill(dish);
  await admin.getByRole('spinbutton', { name: 'Price' }).fill(price);
  await admin.getByRole('button', { name: 'Save' }).click();

  // The editor closes on what the server answered, so a read row carrying the price is the proof
  // the write landed — not merely that the form accepted it.
  const row = category.getByRole('row').filter({ hasText: dish });
  await expect(row).toContainText(shown);
  await expect(admin.getByRole('textbox', { name: 'Name' })).toHaveCount(0);

  // The guest arrives the way a guest does: the landing's QR link, a claim, the menu.
  await guest.goto('/');
  await guest.getByRole('link', { name: `Table ${DEMO_TABLE} as a guest` }).click();
  await guest.waitForURL('**/menu');
  const card = guest
    .getByRole('article')
    .filter({ has: guest.getByRole('heading', { name: dish }) });
  await expect(card).toBeVisible();
  await expect(card).toContainText(shown);

  await guestContext.close();
  await adminContext.close();
});

test('reissuing a QR retires the printed one', async ({ browser, request }) => {
  // A reissue, two guest contexts either side of it, and the wait that puts the shared demo link
  // back the way it was found.
  test.setTimeout(120_000);
  // The link a printed card would carry, read before anything changes. This is the only API call
  // in the file: it is the fixture, not the behaviour under test.
  const links = (await (await request.get('/api/demo/links')).json()) as {
    guest: { url: string; tableNumber: number };
  };
  expect(links.guest.tableNumber).toBe(DEMO_TABLE);
  // The path, not the absolute URL: the browser stays on the origin Playwright was pointed at
  // whatever `WEB_ORIGIN` the API was configured with.
  const printed = new URL(links.guest.url).pathname;

  // The code works right now. Without this the test could pass on a token that was never valid —
  // a refusal after the reissue would prove nothing about the reissue.
  const beforeContext = await browser.newContext();
  const before = await beforeContext.newPage();
  await before.goto(printed);
  await before.waitForURL('**/menu');
  await expect(before.getByText(`Table ${DEMO_TABLE}`)).toBeVisible();
  await beforeContext.close();

  const adminContext = await browser.newContext();
  const admin = await adminContext.newPage();
  await signInAsAdmin(admin);
  await admin.getByRole('link', { name: 'Tables' }).click();
  await admin.waitForURL('**/admin/tables');
  await expect(admin.getByRole('heading', { level: 1 })).toHaveText('Tables');

  const row = admin
    .getByRole('row')
    .filter({ has: admin.getByRole('rowheader', { name: `Table ${DEMO_TABLE}` }) });
  // Hydration again: the confirmation is the answer that the control is live.
  await expect(async () => {
    await row.getByRole('button', { name: 'Reissue QR' }).click();
    await expect(row.getByRole('button', { name: 'Yes, reissue' })).toBeVisible({ timeout: 1_000 });
  }).toPass();
  // The question states the consequence before either answer is offered: that is the whole reason
  // this control asks, so the spec reads the sentence rather than only the button.
  await expect(row).toContainText(
    `Reissue the QR for table ${DEMO_TABLE}? Every printed code for this table stops working immediately.`,
  );
  await row.getByRole('button', { name: 'Yes, reissue' }).click();
  await expect(row.getByRole('status')).toHaveText(
    `Table ${DEMO_TABLE} has a new code. Print the sheet again.`,
  );
  await adminContext.close();

  // The card on the table is now a dead code, and it says so where a guest is looking.
  const afterContext = await browser.newContext();
  const after = await afterContext.newPage();
  await after.goto(printed);
  // Scoped to main: Next.js appends its own empty role="alert" route announcer to the body.
  await expect(after.getByRole('main').getByRole('alert')).toHaveText('This QR code is not valid.');
  await afterContext.close();

  // Put the shared fixture back. The landing renders from the web tier's 30-second memory of
  // `GET /api/demo/links` (apps/web/lib/demo-links.ts), so for up to half a minute after a reissue
  // it can still be handing out the code this test just retired — and every other spec in this
  // suite starts by clicking that link. Waiting for it to come good again is what keeps this test
  // from breaking the ones beside it; the wait is on an observed answer, not on a clock, and each
  // read is what makes the stale entry expire into a fresh one.
  //
  // Read-only on purpose. Claiming the link would prove the same thing and cost more than it is
  // worth: `POST /guest/claim` allows twenty a minute from one address, and a poll that spends
  // that budget would starve the guest specs running beside this one of the claims they need.
  const retired = qrVersionOf(printed.slice('/t/'.length));
  await expect(async () => {
    const landing = await (await request.get('/')).text();
    const token = TOKEN_IN_LINK.exec(landing)?.[1];
    expect(token, 'no guest token on the landing page').toBeDefined();
    expect(
      qrVersionOf(token!),
      'the landing is still handing out the retired code',
    ).toBeGreaterThan(retired);
  }).toPass({ timeout: 45_000, intervals: [1_000] });
});
