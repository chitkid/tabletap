import { expect, test } from '@playwright/test';

test('kitchen staff signs in through the same-origin API proxy', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill('kitchen@littlefurnace.demo');
  await page.getByLabel('Password').fill('tabletap-demo');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText('Signed in as Theo Baptiste (kitchen)')).toBeVisible();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
});

test('wrong password shows the brand-voice message', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill('kitchen@littlefurnace.demo');
  await page.getByLabel('Password').fill('nope');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('status')).toHaveText("That email and password don't match.");
});
