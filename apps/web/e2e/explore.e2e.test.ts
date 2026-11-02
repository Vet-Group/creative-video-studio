import { expect, test } from '@playwright/test';
import { runViaApi, signIn } from './support.test';

test('Explore greets the member by given name and lists a job they start under Continue, without pushing a phone page sideways', async ({ page }) => {
  await signIn(page, 'explorea');
  await page.goto('/explore');
  // E2E Explore Lan: Vietnamese names put the given name last.
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/^Chào buổi (sáng|chiều|tối), Lan$/);
  const status = page.locator('.explore-status');
  const [, left, cap] = (await status.textContent())!.match(/^Hôm nay bạn còn (\d+)\/(\d+) clip video$/)!;
  await expect(page.getByText('Bạn chưa tạo clip hay ảnh nào', { exact: false })).toBeVisible();
  await expect(page.getByRole('list', { name: 'Việc gần đây' })).toHaveCount(0);

  await runViaApi(page);
  await page.reload();
  const recent = page.getByRole('list', { name: 'Việc gần đây' }).getByRole('link');
  await expect(recent).toHaveCount(1);
  await expect(recent).toHaveAttribute('href', '/create');
  await expect(recent).toContainText('Tạo video');
  await expect(page.getByText('Bạn chưa tạo clip hay ảnh nào', { exact: false })).toHaveCount(0);

  // The mock clip takes a few seconds; once done the card shows its poster and the day's count includes it.
  await expect.poll(async () => (await page.reload(), await recent.getAttribute('data-status')), { timeout: 60_000 }).toBe('succeeded');
  await expect(recent.locator('img')).toHaveAttribute('src', /^\/api\/assets\/[^/]+\/content$/);
  await expect(status).toHaveText(`Hôm nay bạn còn ${Number(left) - 1}/${cap} clip video`);

  await recent.click();
  await expect(page).toHaveURL(/\/create$/);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/explore');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
