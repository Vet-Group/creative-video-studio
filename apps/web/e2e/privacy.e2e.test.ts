import { expect, test } from '@playwright/test';

test('the privacy page is public, with no session, and names the data it reads and the support contact', async ({ page }) => {
  const res = await page.goto('/privacy');
  expect(res?.status()).toBe(200);
  await expect(page).toHaveURL(/\/privacy$/);
  await expect(page.getByRole('heading', { name: 'Chính sách quyền riêng tư' })).toBeVisible();
  await expect(page.getByText('openid, email, profile')).toBeVisible();
  await expect(page.getByRole('link', { name: 'support@e2e.test' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'English summary' })).toBeVisible();
});
