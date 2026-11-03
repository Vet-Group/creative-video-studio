import { expect, test } from '@playwright/test';
import { png, runViaApi, signIn } from './support.test';

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

  // Marks work on a list row and in the detail view; Kết quả finds the unmarked items, and a fresh mark takes one out of that list.
  await item(first).getByRole('button', { name: 'Đạt', exact: true }).click();
  await expect(item(first).locator('.lib-mark')).toHaveText('Đạt');
  const verdict = page.getByLabel('Kết quả');
  await verdict.selectOption('none');
  await expect(page.locator('.lib-row')).toHaveCount(1);
  await item(second).getByRole('button', { name: 'Xem chi tiết' }).click();
  const detail = page.getByRole('dialog');
  await detail.getByRole('button', { name: 'Nổi bật', exact: true }).click();
  await expect(page.getByText('Chưa có clip nào khớp bộ lọc.')).toBeVisible();
  await expect(detail).toHaveCount(0); // the last unmarked item left, so the detail view closed
  await verdict.selectOption('featured');
  await expect(page.locator('.lib-row')).toHaveCount(1);
  await expect(item(second).locator('.lib-mark')).toHaveText('Nổi bật');
  await verdict.selectOption('');
  await expect(page.locator('.lib-row')).toHaveCount(2);

  // The marking guide says why and how to mark, with an example for every fault, and Esc closes it.
  await page.getByRole('button', { name: 'Hướng dẫn chấm điểm' }).click();
  const guide = page.getByRole('dialog', { name: 'Hướng dẫn chấm điểm' });
  await expect(guide.getByRole('heading', { name: 'Chấm để làm gì?' })).toBeVisible();
  await expect(guide.locator('.verdict-guide-faults dd')).toHaveCount(6);
  await page.keyboard.press('Escape');
  await expect(guide).toHaveCount(0);

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
  await page.route(/\/api\/library(\?|$)/, (r) => r.fulfill({ json: { hasMore: false, isAdmin: false, unmarked: 0, creators: [], clips: [] } }));
  await page.reload();
  await expect(page.getByText('Thư viện còn trống')).toBeVisible();
  await expect(page.locator('.library-empty').getByRole('link', { name: 'Tạo video' })).toHaveAttribute('href', '/create');
  await expect(page.locator('.library-empty').getByRole('link', { name: 'Tạo ảnh' })).toHaveAttribute('href', '/image-generation');
});

test('Library detail: how an item was made for anyone, marks by keyboard, ←/→ between items, bulk marks that skip the items of others, the unmarked count and no tray', async ({ page, browser }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const image = async (p: typeof page, prompt: string) => {
    const up = (await (await p.request.post('/api/assets', { multipart: { file: { name: 'recipe.png', mimeType: 'image/png', buffer: png() } } })).json()) as { assets: { id: string }[] };
    const res = await p.request.post('/api/jobs', { data: { feature: 'image', modelId: 'mock-image-e2e', assetIds: [up.assets[0]!.id], ratio: '3:4', prompt, enhance: false, params: { resolution: '1K' } } });
    expect(res.status()).toBe(201);
    return ((await res.json()) as { id: string }).id;
  };
  const done = (p: typeof page, ids: string[]) =>
    expect.poll(async () => ((await (await p.request.get('/api/jobs?mine')).json()) as { jobs: { id: string; status: string }[] }).jobs.filter((j) => ids.includes(j.id) && j.status === 'succeeded').length, { timeout: 60_000 }).toBe(ids.length);
  const other = await (await browser.newContext()).newPage();
  await signIn(other, 'librb');
  const theirs = await image(other, 'words of member B');
  await signIn(page, 'libra');
  const older = await image(page, 'recipe words one');
  const newer = await image(page, 'recipe words two');
  await done(other, [theirs]);
  await done(page, [older, newer]);

  await page.goto('/library');
  await expect(page.getByRole('complementary', { name: 'Job của tôi' })).toHaveCount(0); // the Library already lists every result
  const item = (id: string) => page.getByRole('article', { name: new RegExp(`${id.slice(0, 8)}\\.[a-z0-9]+$`) });
  const detail = page.getByRole('dialog');
  const recipe = detail.getByRole('definition');
  // The label carries no count at 0 (and before the first page arrives, so the first read waits for 2 or more).
  const unmarked = async () => Number((await page.getByLabel('Kết quả').locator('option[value="none"]').textContent())?.match(/^Chưa chấm(?: \((\d+)\))?$/)?.[1] ?? 0);
  await expect.poll(unmarked).toBeGreaterThanOrEqual(2);
  const before = await unmarked();

  // Another member's item: its prompt, model and settings are open to everyone, its marks are not.
  await item(theirs).getByRole('button', { name: 'Xem chi tiết' }).click();
  await expect(detail.getByText('words of member B', { exact: true })).toBeVisible();
  await expect(recipe.filter({ hasText: /^Mock image E2E$/ })).toHaveCount(1);
  await expect(recipe.filter({ hasText: /^E2E Library Recipe B · / })).toHaveCount(1);
  await expect(detail.getByRole('button', { name: 'Đạt', exact: true })).toHaveCount(0);
  await page.keyboard.press('Escape');

  // Own items, newest first: 2 marks the open one featured, → moves to the older one, 1 passes it, 3 opens the fault list.
  await page.getByLabel('Người tạo').selectOption({ label: 'E2E Library Recipe A' });
  await expect(page.getByRole('article')).toHaveCount(2);
  await item(newer).getByRole('button', { name: 'Xem chi tiết' }).click();
  await expect(detail.getByText('recipe words two', { exact: true })).toBeVisible();
  await page.keyboard.press('2');
  await expect(detail.locator('h2 .lib-mark')).toHaveText('Nổi bật');
  await page.keyboard.press('ArrowRight');
  await expect(detail.getByText('recipe words one', { exact: true })).toBeVisible();
  await expect(detail.locator('h2 .lib-mark')).toHaveCount(0);
  await page.keyboard.press('1');
  await expect(detail.locator('h2 .lib-mark')).toHaveText('Đạt');
  await page.keyboard.press('3');
  await expect(detail.getByLabel('Lỗi gặp phải')).toBeFocused();
  await detail.getByLabel('Lỗi gặp phải').selectOption({ label: 'Sai màu' });
  await detail.getByRole('button', { name: 'Xác nhận không đạt' }).click();
  await expect(detail.locator('h2 .lib-mark')).toHaveText('Không đạt · Sai màu');
  await page.locator('body').press('ArrowLeft');
  await expect(detail.getByText('recipe words two', { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(item(newer).getByTitle('Kết quả: Nổi bật', { exact: true })).toBeVisible();
  await expect(item(older).getByTitle('Kết quả: Không đạt · Sai màu', { exact: true })).toBeVisible();
  await expect.poll(unmarked).toBe(before - 2);

  // Bulk: marks only the caller's own items and says how many it left alone.
  await page.getByLabel('Người tạo').selectOption('');
  await page.getByRole('button', { name: 'Chọn', exact: true }).click();
  for (const id of [newer, older, theirs]) await item(id).getByRole('checkbox').check();
  const bulk = page.getByRole('group', { name: 'Chấm nhiều mục' });
  await bulk.getByRole('button', { name: 'Đạt', exact: true }).click();
  await expect(bulk.getByRole('status')).toHaveText('Đã lưu 2 mục, bỏ qua 1 mục không phải của bạn.');
  await expect(item(newer).getByTitle('Kết quả: Nổi bật', { exact: true })).toBeVisible(); // a bulk Pass keeps it featured
  await expect(item(older).getByTitle('Kết quả: Đạt', { exact: true })).toBeVisible();
  await expect(item(theirs).getByTitle(/^Kết quả:/)).toHaveCount(0);
  await bulk.getByLabel('Lỗi cho Không đạt').selectOption({ label: 'Nhấp nháy hoặc giật hình' });
  await bulk.getByRole('button', { name: 'Không đạt', exact: true }).click();
  await expect(item(older).getByTitle('Kết quả: Không đạt · Nhấp nháy hoặc giật hình', { exact: true })).toBeVisible();
  await expect.poll(unmarked).toBe(before - 2); // a changed mark is not a first one

  // Leave nothing behind for the other specs that read the shared Library.
  for (const id of [newer, older]) expect((await page.request.delete(`/api/jobs/${id}`)).ok()).toBe(true);
  expect((await other.request.delete(`/api/jobs/${theirs}`)).ok()).toBe(true);
});
