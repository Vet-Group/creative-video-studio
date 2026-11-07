import { expect, test } from '@playwright/test';
import { runViaApi, signIn } from './support.test';

test('the Library date presets: today, the last 7 or 30 days, or one day picked on the calendar', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page, 'libx');
  const id = await runViaApi(page);
  await expect.poll(async () => ((await (await page.request.get('/api/jobs?mine')).json()) as { jobs: { id: string; status: string }[] }).jobs.find((j) => j.id === id)?.status, { timeout: 60_000 }).toBe('succeeded');
  await page.goto('/library');
  await page.getByLabel('Người tạo').selectOption({ label: 'E2E Library Extras' });
  const mine = page.getByRole('article');
  await expect(mine).toHaveCount(1);
  const day = page.getByRole('combobox', { name: 'Ngày', exact: true });
  expect(await day.locator('option').allTextContents()).toEqual(['Mọi ngày', 'Hôm nay', '7 ngày qua', '30 ngày qua', 'Chọn một ngày…']);
  for (const preset of ['Hôm nay', '7 ngày qua', '30 ngày qua']) {
    await day.selectOption({ label: preset });
    await expect(mine).toHaveCount(1);
  }
  await expect(page.getByText('2 bộ lọc', { exact: true })).toBeVisible();
  // One day: the calendar field shows, and a day before the item leaves the list empty.
  await expect(page.getByLabel('Ngày cụ thể')).toHaveCount(0);
  await day.selectOption({ label: 'Chọn một ngày…' });
  const calendar = page.getByLabel('Ngày cụ thể');
  await calendar.fill('2026-01-01');
  await expect(page.getByText('Chưa có kết quả nào khớp bộ lọc.')).toBeVisible();
  await expect(day.locator('option:checked')).toHaveText('01/01/2026'); // the picked day shows in the preset field itself
  await page.locator('.library-empty').getByRole('button', { name: 'Xoá lọc' }).click();
  await expect(day).toHaveValue('');
  await expect(calendar).toHaveCount(0);
});

test('the Library loads more as the end comes near, and coming back keeps the items and the place', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page, 'libx');
  // Fifty fake items in pages of 24, so the scrolling does not depend on how many clips the other specs left.
  const clip = (i: number) => ({
    id: `fake-${i}`, creator: { id: 'u', name: 'E2E Fake' }, createdAt: '2026-11-03T03:00:00.000Z', modelId: 'mock-e2e', modelLabel: `Fake ${i}`, ratio: '9:16', durationSec: 5,
    feature: 'video', mediaType: 'image', resolution: '1K', isMock: true, videoAssetId: 'none', posterAssetId: null, storeId: null, costUsd: '0.0000', costFinal: true, verdict: null,
    favorite: false, prompt: null, canEdit: false, downloadName: `fake-${i}.png`,
  });
  await page.route(/\/api\/library(\?|$)/, async (r) => {
    const offset = Number(new URL(r.request().url()).searchParams.get('offset') ?? 0);
    const items = Array.from({ length: 50 }, (_, i) => clip(i)).slice(offset, offset + 24);
    await r.fulfill({ json: { hasMore: offset + 24 < 50, isAdmin: false, unmarked: 0, creators: [], clips: items } });
  });
  await page.goto('/library');
  const cards = page.getByRole('article');
  await expect(cards).toHaveCount(24);
  await page.getByRole('button', { name: 'Tải thêm' }).scrollIntoViewIfNeeded();
  await expect(cards).toHaveCount(48);
  await page.getByRole('button', { name: 'Tải thêm' }).scrollIntoViewIfNeeded();
  await expect(cards).toHaveCount(50);
  await expect(page.getByRole('button', { name: 'Tải thêm' })).toHaveCount(0);
  await page.getByRole('article', { name: /fake-30\.png$/ }).scrollIntoViewIfNeeded();
  const y = await page.evaluate(() => window.scrollY);
  expect(y).toBeGreaterThan(1000);

  await page.getByRole('navigation', { name: 'Điều hướng chính' }).getByRole('link', { name: 'Khám phá' }).click();
  await expect(page).toHaveURL(/\/explore$/);
  await page.goBack();
  await expect(cards).toHaveCount(50);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(y - 200);
});

test('a first visit to Explore shows the three steps, which open the guide and stay closed once closed', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page, 'welc', { welcome: true });
  await page.goto('/explore');
  const card = page.getByRole('region', { name: 'Bắt đầu trong 3 bước' });
  await expect(card.getByRole('listitem')).toHaveCount(3);
  const firstLine = page.getByText('Bạn chưa tạo clip hay ảnh nào');
  await expect(firstLine).toBeHidden(); // the card already says it
  await card.getByRole('button', { name: 'Chọn công cụ nào?' }).click();
  await expect(page.getByRole('dialog', { name: 'Chọn công cụ nào?' })).toBeVisible();
  await page.keyboard.press('Escape');
  await card.getByRole('button', { name: 'Đã hiểu, ẩn hướng dẫn' }).click();
  await expect(card).toHaveCount(0);
  await expect(firstLine).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Bắt đầu trong 3 bước' })).toHaveCount(0);
});
