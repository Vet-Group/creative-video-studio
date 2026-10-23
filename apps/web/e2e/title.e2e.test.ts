import { expect, test } from '@playwright/test';
import { runViaApi, signIn } from './support.test';

test('the tab title changes when a job completes and returns once the notice is dismissed', async ({ page }) => {
  await signIn(page, 'member4');
  await expect(page).toHaveTitle('Creative Video Studio');

  await runViaApi(page);
  await expect(page).toHaveTitle(/Đã xong/, { timeout: 60_000 });

  await page.getByRole('button', { name: 'Đóng thông báo' }).click();
  await expect(page).toHaveTitle('Creative Video Studio');
});
