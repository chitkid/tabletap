import { expect, test } from '@playwright/test';

test('kitchen staff signs in through the same-origin API proxy and lands on the board', async ({
  page,
}) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill('kitchen@littlefurnace.demo');
  await page.getByLabel('Password').fill('tabletap-demo');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('**/kitchen');
  await expect(page.getByRole('heading', { name: 'Kitchen' })).toBeVisible();
  await expect(page.getByText('Тимофей Басов')).toBeVisible();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.waitForURL('**/login');
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
});

test('wrong password shows the brand-voice message', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill('kitchen@littlefurnace.demo');
  await page.getByLabel('Password').fill('nope');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('status')).toHaveText("That email and password don't match.");
});
