import { expect, test } from '@playwright/test';

test('a guest orders from the landing page QR link', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Table 7 as a guest' }).click();
  await page.waitForURL('**/menu');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Little Furnace');
  await expect(page.getByText('Table 7')).toBeVisible();
  await page.getByRole('button', { name: 'Add Margherita Flatbread' }).click();
  await page.getByRole('button', { name: 'Add one more Margherita Flatbread' }).click();
  await page.getByRole('button', { name: 'Add House Lemonade' }).click();
  await expect(page.getByRole('region', { name: 'Basket' })).toContainText('3 items · $28.00');
  await page.getByRole('button', { name: 'View basket' }).click();
  await page.getByRole('link', { name: 'Go to checkout' }).click();
  await page.waitForURL('**/checkout');
  await page.getByLabel('Note for the kitchen').fill('No basil');
  await page.getByRole('button', { name: 'Place order' }).click();
  await page.waitForURL(/\/orders\/[0-9a-f-]{36}$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    /^Order #\d+ sent to the kitchen\.$/,
  );
  await expect(page.getByText('2 × Margherita Flatbread')).toBeVisible();
  await expect(page.getByText('1 × House Lemonade')).toBeVisible();
  await expect(page.getByText('No basil')).toBeVisible();
  await expect(page.getByText('Placed')).toBeVisible();
});

test('an expired QR code explains itself', async ({ page }) => {
  await page.goto('/t/not-a-token');
  await expect(page.getByRole('alert')).toHaveText('This QR code is not valid.');
});
