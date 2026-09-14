import { expect, test } from '@playwright/test';
import { KITCHEN, LOGIN } from './dictionary';

test('kitchen staff signs in through the same-origin API proxy and lands on the board', async ({
  page,
}) => {
  await page.goto('/login');
  await page.getByLabel(LOGIN.email).fill('kitchen@littlefurnace.demo');
  await page.getByLabel(LOGIN.password).fill('tabletap-demo');
  await page.getByRole('button', { name: LOGIN.submit }).click();
  await page.waitForURL('**/kitchen');
  await expect(page.getByRole('heading', { name: KITCHEN.heading })).toBeVisible();
  await expect(page.getByText('Тимофей Басов')).toBeVisible();
  await page.getByRole('button', { name: KITCHEN.signOut }).click();
  await page.waitForURL('**/login');
  await expect(page.getByRole('button', { name: LOGIN.submit })).toBeVisible();
});

test('wrong password says so in the contract’s words, not better-auth’s', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel(LOGIN.email).fill('kitchen@littlefurnace.demo');
  await page.getByLabel(LOGIN.password).fill('nope');
  await page.getByRole('button', { name: LOGIN.submit }).click();
  // `toHaveText` is whole-string, so this also refuses better-auth's own English answer reaching
  // the screen: the form reads the HTTP status and says the rest itself.
  await expect(page.getByRole('status')).toHaveText(LOGIN.wrongCredentials);
});
