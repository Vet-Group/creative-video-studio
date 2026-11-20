import { expect, test } from '@playwright/test';
import { runViaApi, signIn } from './support.test';

test('the tab title names the page, changes when a job completes and returns once the notice is dismissed', async ({ page }) => {
  await signIn(page, 'member4');
  await expect(page).toHaveTitle('Tạo video · Creative Video Studio');

  await runViaApi(page);
  await expect(page).toHaveTitle(/^Đã xong · Tạo video · Creative Video Studio$/, { timeout: 60_000 });

  await page.getByRole('button', { name: 'Đóng thông báo' }).click();
  await expect(page).toHaveTitle('Tạo video · Creative Video Studio');

  await page.goto('/try-on');
  await expect(page).toHaveTitle('Thử đồ · Creative Video Studio');
});
