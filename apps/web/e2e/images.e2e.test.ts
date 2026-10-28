import { expect, test } from '@playwright/test';
import { png, signIn, today } from './support.test';

test('a mock image job made through the API is an image card under "Tất cả ảnh", not under "Tất cả video"', async ({ page }) => {
  await signIn(page, 'member8');

  const upload = await page.request.post('/api/assets', { multipart: { file: { name: 'shirt.png', mimeType: 'image/png', buffer: png() } } });
  expect(upload.ok()).toBe(true);
  const { assets } = (await upload.json()) as { assets: { id: string }[] };
  const created = await page.request.post('/api/jobs', {
    data: { feature: 'image', modelId: 'mock-image-e2e', assetIds: [assets[0]!.id], prompt: 'a red shirt on a hanger', ratio: '3:4', params: { resolution: '1K' } },
  });
  expect(created.status()).toBe(201);

  // The tray shows the resolution where a video shows its duration, and the toast says it is an image. Create's history lists videos only; the image is in the Image Generation history.
  const tray = page.getByRole('complementary', { name: 'Job của tôi' });
  await expect(page.getByRole('region', { name: 'Thông báo' }).getByText('Ảnh đã xong')).toBeVisible({ timeout: 60_000 });
  await expect(tray.getByText('Hoàn tất')).toHaveCount(0);
  await page.getByRole('navigation', { name: 'Điều hướng chính' }).getByRole('link', { name: 'Tạo ảnh' }).click();
  await expect(page).toHaveURL(/\/image-generation$/);
  const history = page.getByRole('tab', { name: 'Lịch sử' });
  await expect(async () => {
    await history.click(); // the first click can land before the page hydrates
    await expect(history).toHaveAttribute('aria-selected', 'true', { timeout: 1_000 });
  }).toPass();
  await expect(tray.getByText('Hoàn tất')).toBeVisible();
  await expect(tray.locator('.job-chips').first().locator('span')).toHaveText(['1K', '3:4']); // the History card's resolution and ratio chips

  await page.getByRole('link', { name: 'Thư viện' }).first().click();
  const chips = page.getByRole('group', { name: 'Loại' });
  await expect(chips.getByRole('button')).toHaveText(['Tất cả', 'Tất cả ảnh', 'Tất cả video', 'Thử đồ', 'Tạo ảnh', 'Tạo video', 'Marketing Studio', 'UGC Thử đồ', 'Nâng cao', 'Ứng dụng']);
  const cards = page.getByRole('article');

  await chips.getByRole('button', { name: 'Tất cả ảnh' }).click();
  await expect(chips.getByRole('button', { name: 'Tất cả ảnh' })).toHaveAttribute('aria-pressed', 'true');
  const card = cards.filter({ hasText: 'E2E Member 8' });
  await expect(card).toHaveCount(1);
  await expect(card).toHaveAccessibleName(/^Ảnh /);
  await expect(card.getByText('Mock image E2E · 3:4 · 1K')).toBeVisible();
  const image = card.getByRole('img');
  await expect(image).toBeVisible();
  await expect.poll(() => image.evaluate((i: HTMLImageElement) => i.naturalWidth)).toBeGreaterThan(0);
  await expect(card.locator('video')).toHaveCount(0);
  await expect(card.getByRole('link', { name: 'Dùng lại' })).toHaveAttribute('href', /^\/image-generation\?reuse=/); // an image reopens Image Generation
  for (const name of ['Tải xuống', 'Đạt', 'Không đạt', 'Xóa']) await expect(card.getByRole('button', { name, exact: true })).toBeVisible();

  // The Library is company-wide, so other specs' clips may be listed; this member's image must be in none of the other kinds.
  for (const name of ['Tất cả video', 'Thử đồ', 'Tạo video', 'Marketing Studio', 'Ứng dụng']) {
    await chips.getByRole('button', { name, exact: true }).click();
    await expect(chips.getByRole('button', { name, exact: true })).toHaveAttribute('aria-pressed', 'true');
    await page.waitForLoadState('networkidle');
    await expect(card).toHaveCount(0);
  }
  await chips.getByRole('button', { name: 'Tạo ảnh' }).click();
  await expect(card).toHaveCount(1);

  // The download is named after the image's own type.
  const [download] = await Promise.all([page.waitForEvent('download'), card.getByRole('button', { name: 'Tải xuống' }).click()]);
  expect(download.suggestedFilename()).toMatch(new RegExp(`^${today()}-e2e-member-8-[0-9a-f]{8}\.png$`));

  await card.getByRole('button', { name: 'Xóa' }).click();
  await expect(page.getByRole('alertdialog', { name: 'Xác nhận xóa' })).toContainText('Xóa ảnh này?');
  await page.getByRole('button', { name: 'Xác nhận xóa' }).click();
  await expect(card).toHaveCount(0);
});
