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
  await expect(page.getByText('Clip đã xong')).toHaveCount(2, { timeout: 60_000 });
  await expect(card(first)).toBeVisible(); // the Library reloads itself when the tray hears a job finished
  await expect(card(second)).toBeVisible();
  await expect(page.getByText('Mọi thứ công ty đã tạo, ở cùng một chỗ.')).toBeVisible();

  // Favourites only: empty at first, with the way back to every item.
  const favoritesOnly = page.getByLabel('Chỉ mục yêu thích');
  await favoritesOnly.check();
  await expect(page.getByText('Chưa có clip nào khớp bộ lọc.')).toBeVisible();
  await expect(page.locator('.library-empty').getByRole('button', { name: 'Xoá lọc' })).toBeVisible();
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

  // Newest first by default; Oldest first swaps the two. Only this member's clips, so the other tests' clips never push these two off the oldest 24.
  await page.getByLabel('Người tạo').selectOption({ label: 'E2E Member 4' });
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

test('Library views: grid or list remembered, a selection bar with the zip, search, both empty states, and a phone that never scrolls sideways', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page, 'libv');
  const first = await runViaApi(page);
  const second = await runViaApi(page);
  const done = async () => ((await (await page.request.get('/api/jobs?mine')).json()) as { jobs: { status: string }[] }).jobs.filter((j) => j.status === 'succeeded').length;
  await expect.poll(done, { timeout: 60_000 }).toBe(2);
  await page.goto('/library');
  const item = (id: string) => page.getByRole('article', { name: new RegExp(`${id.slice(0, 8)}\\.mp4$`) });
  const mineOnly = () => page.getByLabel('Người tạo').selectOption({ label: 'E2E Library View' });
  await mineOnly();
  await expect(page.getByRole('article')).toHaveCount(2);
  await expect(page.getByText('1 bộ lọc', { exact: true })).toBeVisible();

  // List rows keep the item names and actions; the card size belongs to the grid; the choice outlives a reload.
  const listView = page.getByRole('button', { name: 'Danh sách', exact: true });
  await listView.click();
  await expect(listView).toHaveAttribute('aria-pressed', 'true');
  await expect(item(first).getByRole('button', { name: 'Tải xuống' })).toBeVisible();
  await expect(page.locator('.lib-row')).toHaveCount(2);
  await expect(page.getByLabel('Cỡ ô')).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Danh sách', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await mineOnly();
  await expect(page.locator('.lib-row')).toHaveCount(2);

  // Picking a checkbox from the keyboard starts the selection; the bar counts, offers the zip, and Esc ends it.
  const bar = page.getByRole('group', { name: 'Tải nhiều mục' });
  const checks = page.getByRole('checkbox', { name: /^Chọn \d{8}-e2e-library-view-/ });
  await expect(bar).toHaveCount(0);
  await checks.nth(0).focus();
  await page.keyboard.press('Space');
  await expect(bar).toContainText('Đã chọn 1');
  await expect(page.getByRole('button', { name: 'Chọn', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await checks.nth(1).check();
  await expect(bar).toContainText('Đã chọn 2');
  await expect(bar.getByRole('button', { name: 'Tải xuống .zip' })).toBeEnabled();
  await page.keyboard.press('Escape');
  await expect(bar).toHaveCount(0);
  await expect(checks.nth(0)).not.toBeChecked();
  // Chọn opens an empty selection; Bỏ chọn closes it.
  await page.getByRole('button', { name: 'Chọn', exact: true }).click();
  await expect(bar).toContainText('Đã chọn 0');
  await expect(bar.getByRole('button', { name: 'Tải xuống .zip' })).toBeDisabled();
  await checks.nth(1).check();
  await expect(bar).toContainText('Đã chọn 1');
  await bar.getByRole('button', { name: 'Bỏ chọn' }).click();
  await expect(bar).toHaveCount(0);

  // Search reads the model name; words that match nothing show the filtered-empty state, whose Xoá lọc clears every filter.
  const search = page.getByLabel('Tìm kiếm');
  await search.fill('mock e2e');
  await expect(page.getByText('2 bộ lọc', { exact: true })).toBeVisible();
  await expect(page.locator('.lib-row')).toHaveCount(2);
  await search.fill('no such words anywhere');
  await expect(page.getByText('Chưa có clip nào khớp bộ lọc.')).toBeVisible();
  await page.locator('.library-empty').getByRole('button', { name: 'Xoá lọc' }).click();
  await expect(search).toHaveValue('');
  await expect(page.getByLabel('Người tạo')).toHaveValue('');
  await expect(page.getByText(/^\d bộ lọc$/)).toHaveCount(0);
  await expect(item(second)).toBeVisible();

  // A phone: neither view pushes the page sideways, and Chọn brings the checkboxes and the bar.
  await page.setViewportSize({ width: 390, height: 844 });
  const fits = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  for (const view of ['Danh sách', 'Lưới']) {
    await page.getByRole('button', { name: view, exact: true }).click();
    await expect(page.getByRole('button', { name: view, exact: true })).toHaveAttribute('aria-pressed', 'true');
    expect(await fits()).toBe(true);
    // Out of selection mode a row keeps no gutter for its checkbox: the thumbnail starts at the row's padding.
    if (view === 'Danh sách') expect((await item(first).locator('.lib-thumb').boundingBox())!.x - (await item(first).boundingBox())!.x).toBeLessThanOrEqual(13);
  }
  await page.getByRole('button', { name: 'Chọn', exact: true }).click();
  await item(first).getByRole('checkbox').check();
  await expect(bar).toContainText('Đã chọn 1');
  await expect(bar).toBeInViewport();
  expect(await fits()).toBe(true);

  // No items at all: the first-use state leads to Create video and Image Generation.
  await page.route(/\/api\/library(\?|$)/, (r) => r.fulfill({ json: { hasMore: false, isAdmin: false, creators: [], clips: [] } }));
  await page.reload();
  await expect(page.getByText('Thư viện còn trống')).toBeVisible();
  await expect(page.locator('.library-empty').getByRole('link', { name: 'Tạo video' })).toHaveAttribute('href', '/create');
  await expect(page.locator('.library-empty').getByRole('link', { name: 'Tạo ảnh' })).toHaveAttribute('href', '/image-generation');
});
