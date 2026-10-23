import { expect, test } from '@playwright/test';
import { runViaApi, signIn } from './support.test';

test('Library tools: favourites only, oldest first, the size slider and the empty state', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signIn(page, 'member4');
  // Marks left by an earlier run on the same database would break "empty at first".
  const left = (await (await page.request.get('/api/library?favorites=1')).json()) as { clips: { id: string }[] };
  for (const c of left.clips) await page.request.put(`/api/jobs/${c.id}/favorite`, { data: { favorite: false } });
  const first = await runViaApi(page);
  const second = await runViaApi(page);
  await page.goto('/library');
  const mine = page.getByRole('article').filter({ hasText: 'E2E Member 4' });
  // A card's name holds its download name, which ends in the first 8 characters of the job id.
  const card = (id: string) => page.getByRole('article', { name: new RegExp(`${id.slice(0, 8)}\\.mp4$`) });
  await expect(page.getByText('Clip đã xong')).toHaveCount(2, { timeout: 60_000 }); // the Library does not refresh itself
  await page.reload();
  await expect(card(first)).toBeVisible();
  await expect(card(second)).toBeVisible();
  await expect(page.getByText('Mọi thứ công ty đã tạo, ở cùng một chỗ.')).toBeVisible();

  // Favourites only: empty at first, with the way back to creating.
  const favoritesOnly = page.getByLabel('Chỉ mục yêu thích');
  await favoritesOnly.check();
  await expect(page.getByText('Chưa có clip nào khớp bộ lọc.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Bắt đầu tạo' })).toHaveAttribute('href', '/explore');
  await favoritesOnly.uncheck();

  // Mark the second job; it alone stays under Favourites only, and the mark survives a reload.
  await card(second).getByRole('button', { name: 'Yêu thích' }).click();
  await expect(card(second).getByRole('button', { name: 'Yêu thích' })).toHaveAttribute('aria-pressed', 'true');
  await favoritesOnly.check();
  await expect(page.getByRole('article')).toHaveCount(1);
  await expect(card(second)).toBeVisible();
  await page.reload();
  await expect(card(second).getByRole('button', { name: 'Yêu thích' })).toHaveAttribute('aria-pressed', 'true');
  await expect(card(first).getByRole('button', { name: 'Yêu thích' })).toHaveAttribute('aria-pressed', 'false');

  // Newest first by default; Oldest first swaps the two.
  const position = async (id: string) => (await mine.evaluateAll((cards) => cards.map((c) => c.getAttribute('aria-label') ?? ''))).findIndex((l) => l.endsWith(`${id.slice(0, 8)}.mp4`));
  expect(await position(second)).toBeLessThan(await position(first));
  await page.getByLabel('Sắp xếp').selectOption('oldest');
  await expect.poll(async () => (await position(first)) < (await position(second))).toBe(true);

  // Unmarking under Favourites only takes the card out of the list.
  await favoritesOnly.check();
  await card(second).getByRole('button', { name: 'Yêu thích' }).click();
  await expect(page.getByText('Chưa có clip nào khớp bộ lọc.')).toBeVisible();
  await favoritesOnly.uncheck();

  // The slider starts in the middle, changes the card width and is remembered.
  const width = async () => (await card(first).boundingBox())!.width;
  const slider = page.getByLabel('Cỡ ô');
  await expect(slider).toHaveValue('1');
  await slider.fill('2');
  const large = await width();
  await slider.fill('0');
  await expect.poll(width).toBeLessThan(large);
  await page.reload();
  await expect(page.getByLabel('Cỡ ô')).toHaveValue('0');
});
