import { expect, type Page, test } from '@playwright/test';
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
  // A card's name is its feature, model and time, so cards are found by the job id they carry.
  const card = (id: string) => page.locator(`article[data-clip-id="${id}"]`);
  await expect(page.getByText('Clip đã xong')).toHaveCount(2, { timeout: 60_000 });
  await expect(card(first)).toBeVisible(); // the Library reloads itself when the tray hears a job finished
  await expect(card(second)).toBeVisible();
  await expect(page.getByText('Mọi thứ công ty đã tạo, ở cùng một chỗ.')).toBeVisible();

  // Favourites only: empty at first, with the way back to every item.
  const favoritesOnly = page.getByLabel('Chỉ mục yêu thích');
  await favoritesOnly.check();
  await expect(page.getByText('Chưa có kết quả nào khớp bộ lọc.')).toBeVisible();
  await expect(page.locator('.library-empty').getByRole('button', { name: 'Xoá lọc' })).toBeVisible();
  await favoritesOnly.uncheck();

  // Mark the second job; it alone stays under Favourites only, and the mark survives a reload.
  await card(second).getByRole('button', { name: 'Yêu thích' }).click();
  await expect(card(second).getByRole('button', { name: 'Yêu thích' })).toHaveAttribute('aria-pressed', 'true');
  await favoritesOnly.check();
  await expect(page.getByRole('article')).toHaveCount(1);
  await expect(card(second)).toBeVisible();
  await page.reload();
  // The favourites-only view lives in the address, so the reload keeps it: the second clip alone stays, still marked.
  await expect(page.getByRole('article')).toHaveCount(1);
  await expect(card(second).getByRole('button', { name: 'Yêu thích' })).toHaveAttribute('aria-pressed', 'true');
  await favoritesOnly.uncheck();
  await expect(card(first).getByRole('button', { name: 'Yêu thích' })).toHaveAttribute('aria-pressed', 'false');

  // Newest first by default; Oldest first swaps the two. Only this member's clips, so the other tests' clips never push these two off the oldest 24.
  await page.getByLabel('Người tạo').selectOption({ label: 'E2E Member 4' });
  const position = async (id: string) => (await mine.evaluateAll((cards) => cards.map((c) => c.getAttribute('data-clip-id') ?? ''))).indexOf(id);
  expect(await position(second)).toBeLessThan(await position(first));

  // The copy-link button is always there; the creator filter shows as a removable chip, and clicking it clears just that filter.
  await expect(page.getByRole('button', { name: 'Sao chép liên kết khung xem' })).toBeVisible();
  const creatorChip = page.locator('.library-active').getByRole('button', { name: /Người tạo:/ });
  await expect(creatorChip).toBeVisible();
  await creatorChip.click();
  await expect(page.getByLabel('Người tạo')).toHaveValue('');
  await expect(page.locator('.library-active').getByRole('button', { name: /Người tạo:/ })).toHaveCount(0);
  await page.getByLabel('Người tạo').selectOption({ label: 'E2E Member 4' }); // restore for the rest of the test

  await page.getByLabel('Sắp xếp').selectOption('oldest');
  await expect.poll(async () => (await position(first)) < (await position(second))).toBe(true);

  // Unmarking under Favourites only takes the card out of the list.
  await favoritesOnly.check();
  await card(second).getByRole('button', { name: 'Yêu thích' }).click();
  await expect(page.getByText('Chưa có kết quả nào khớp bộ lọc.')).toBeVisible();
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
  const item = (id: string) => page.locator(`article[data-clip-id="${id}"]`);
  const mineOnly = () => page.getByLabel('Người tạo').selectOption({ label: 'E2E Library View' });
  await mineOnly();
  await expect(page.getByRole('article')).toHaveCount(2);
  await expect(page.locator('.library-active .library-chip')).toHaveCount(1); // the creator filter, as a removable chip
  // The type pills wrap rather than cut the last one at the edge (the Apps pill was, at 1440 px).
  const kinds = page.getByRole('group', { name: 'Loại', exact: true });
  expect(await kinds.evaluate((e) => e.scrollWidth <= e.clientWidth)).toBe(true);
  await expect(kinds.getByRole('button', { name: 'Ứng dụng' })).toBeInViewport({ ratio: 1 });

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
  // The picture is the row's way into the detail (no eye button beside the other actions), its checkbox sits in the picture's top-left corner, and a video shows its length on it.
  await expect(item(first).getByRole('button', { name: 'Xem chi tiết' })).toHaveCount(1);
  await expect(item(first).locator('.lib-thumb').getByRole('button', { name: 'Xem chi tiết' })).toHaveCount(1);
  const thumb = (await item(first).locator('.lib-thumb').boundingBox())!;
  const corner = (await item(first).locator('.zip-check').boundingBox())!;
  expect({ x: Math.round(corner.x - thumb.x), y: Math.round(corner.y - thumb.y) }).toEqual({ x: 2, y: 2 });
  await expect(item(first).locator('.lib-thumb-len')).toHaveText(/^\d+s$/);

  // Marks work on a list row and in the detail view; Kết quả finds the unmarked items, and a fresh mark takes one out of that list.
  await item(first).getByRole('button', { name: 'Đạt', exact: true }).click();
  await expect(item(first).locator('.lib-mark')).toHaveText('Đạt');
  const verdict = page.getByLabel('Kết quả');
  await verdict.selectOption('none');
  await expect(page.locator('.lib-row')).toHaveCount(1);
  await item(second).getByRole('button', { name: 'Xem chi tiết' }).click();
  const detail = page.getByRole('dialog');
  await detail.getByRole('button', { name: 'Nổi bật', exact: true }).click();
  await expect(page.getByText('Chưa có kết quả nào khớp bộ lọc.')).toBeVisible();
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
  const checks = page.getByRole('checkbox', { name: /^Chọn Tạo video · Mock E2E · \d\d:\d\d / }); // named like its card (what, model, time), not by its file name
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
  // While picking, a click on the picture picks or drops its item instead of opening it.
  await item(first).locator('.lib-thumb .lib-open').click();
  await expect(bar).toContainText('Đã chọn 1');
  await expect(item(first).getByRole('checkbox')).toBeChecked();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await item(first).locator('.lib-thumb .lib-open').click();
  await expect(bar).toContainText('Đã chọn 0');
  await checks.nth(1).check();
  await expect(bar).toContainText('Đã chọn 1');
  await bar.getByRole('button', { name: 'Bỏ chọn' }).click();
  await expect(bar).toHaveCount(0);

  // Search reads the model name; words that match nothing show the filtered-empty state, whose Xoá lọc clears every filter.
  const search = page.getByLabel('Tìm kiếm');
  await search.fill('mock e2e');
  await expect(page.locator('.library-active .library-chip')).toHaveCount(2); // the creator filter and the search term, each a removable chip
  await expect(page.locator('.lib-row')).toHaveCount(2);
  await search.fill('no such words anywhere');
  await expect(page.getByText('Chưa có kết quả nào khớp bộ lọc.')).toBeVisible();
  await page.locator('.library-empty').getByRole('button', { name: 'Xoá lọc' }).click();
  await expect(search).toHaveValue('');
  await expect(page.getByLabel('Người tạo')).toHaveValue('');
  await expect(page.getByText(/^\d bộ lọc$/)).toHaveCount(0);
  await expect(item(second)).toBeVisible();

  // The chips on a card's picture show their whole words beside the length: a type chip such as Marketing Studio is added to this video card to read it, at 1440 and on a phone.
  const clippedChips = () =>
    item(first).locator('.lib-chips').evaluate((row) => {
      row.insertAdjacentHTML('afterbegin', '<span class="lib-chip">Marketing Studio</span>');
      return [...row.children].filter((c) => c.scrollWidth > c.clientWidth).map((c) => c.textContent);
    });
  await page.getByRole('button', { name: 'Lưới', exact: true }).click();
  expect(await clippedChips()).toEqual([]);

  // A phone: neither view pushes the page sideways, and Chọn brings the checkboxes and the bar.
  await page.setViewportSize({ width: 390, height: 844 });
  const fits = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  for (const view of ['Danh sách', 'Lưới']) {
    await page.getByRole('button', { name: view, exact: true }).click();
    await expect(page.getByRole('button', { name: view, exact: true })).toHaveAttribute('aria-pressed', 'true');
    expect(await fits()).toBe(true);
    // Out of selection mode a row keeps no gutter for its checkbox: the thumbnail starts at the row's padding.
    if (view === 'Lưới') expect(await clippedChips()).toEqual([]);
    if (view === 'Danh sách') expect((await item(first).locator('.lib-thumb').boundingBox())!.x - (await item(first).boundingBox())!.x).toBeLessThanOrEqual(13);
  }
  await page.getByRole('button', { name: 'Chọn', exact: true }).click();
  await item(first).getByRole('checkbox').check();
  await expect(bar).toContainText('Đã chọn 1');
  await expect(bar).toBeInViewport();
  expect(await fits()).toBe(true);

  // No items at all: the first-use state leads to Create video and Image Generation.
  await page.route(/\/api\/library(\?|$)/, (r) => r.fulfill({ json: { hasMore: false, isAdmin: false, unmarked: 0, creators: [], stores: [], ratios: [], clips: [] } }));
  await page.reload();
  await expect(page.getByText('Thư viện còn trống')).toBeVisible();
  await expect(page.locator('.library-empty').getByRole('link', { name: 'Tạo video' })).toHaveAttribute('href', '/create');
  await expect(page.locator('.library-empty').getByRole('link', { name: 'Tạo ảnh' })).toHaveAttribute('href', '/image-generation');
});

test('Shift with a click picks every item between it and the item clicked before, and drops them the same way', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page, 'librange');
  const ids = [await runViaApi(page), await runViaApi(page), await runViaApi(page)];
  await expect.poll(async () => ((await (await page.request.get('/api/jobs?mine')).json()) as { jobs: { status: string }[] }).jobs.filter((j) => j.status === 'succeeded').length, { timeout: 60_000 }).toBe(3);
  try {
    await page.goto('/library');
    await page.getByLabel('Người tạo').selectOption({ label: 'E2E Library Range' });
    await expect(page.getByRole('article')).toHaveCount(3);
    const boxes = page.getByRole('article').getByRole('checkbox');
    const bar = page.getByRole('group', { name: 'Tải nhiều mục' });
    await boxes.nth(0).check();
    await boxes.nth(2).click({ modifiers: ['Shift'] });
    await expect(bar).toContainText('Đã chọn 3');
    for (let i = 0; i < 3; i++) await expect(boxes.nth(i)).toBeChecked();
    // Unchecking with Shift drops the span from the last click (the third) back to the second, and leaves the first.
    await boxes.nth(1).click({ modifiers: ['Shift'] });
    await expect(bar).toContainText('Đã chọn 1');
    await expect(boxes.nth(0)).toBeChecked();
    await expect(boxes.nth(2)).not.toBeChecked();
  } finally {
    for (const id of ids) expect((await page.request.delete(`/api/jobs/${id}`)).ok()).toBe(true);
  }
});

test('Library days: a heading per day whose checkbox picks every item of that day, in both orders and both views', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page, 'libd');
  const first = await runViaApi(page);
  const second = await runViaApi(page);
  await expect.poll(async () => ((await (await page.request.get('/api/jobs?mine')).json()) as { jobs: { status: string }[] }).jobs.filter((j) => j.status === 'succeeded').length, { timeout: 60_000 }).toBe(2);
  await page.goto('/library');
  await page.getByLabel('Người tạo').selectOption({ label: 'E2E Library Days' });
  await expect(page.getByRole('article')).toHaveCount(2);
  const item = (id: string) => page.locator(`article[data-clip-id="${id}"]`);

  // Today's two items sit under one "Hôm nay" heading with their count.
  const heading = page.getByRole('heading', { level: 2, name: 'Hôm nay', exact: true });
  await expect(heading).toHaveCount(1);
  const today = page.locator('.lib-day-group').filter({ has: heading });
  await expect(today.locator('.lib-day-count')).toHaveText('2 mục');
  await expect(today.getByRole('article')).toHaveCount(2);

  // The day's checkbox turns on the Chọn selection with both items, shows mixed once one is dropped, picks both again, and drops both.
  const day = page.getByRole('checkbox', { name: 'Chọn tất cả 2 mục ngày Hôm nay', exact: true });
  const bar = page.getByRole('group', { name: 'Tải nhiều mục' });
  await day.check();
  await expect(bar).toContainText('Đã chọn 2');
  await expect(page.getByRole('button', { name: 'Chọn', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(item(first).getByRole('checkbox')).toBeChecked();
  await expect(item(second).getByRole('checkbox')).toBeChecked();
  await item(first).getByRole('checkbox').uncheck();
  await expect(bar).toContainText('Đã chọn 1');
  await expect(day).toBeChecked({ indeterminate: true });
  await day.click();
  await expect(bar).toContainText('Đã chọn 2');
  await expect(day).toBeChecked();
  await day.uncheck();
  await expect(bar).toContainText('Đã chọn 0');
  await expect(item(second).getByRole('checkbox')).not.toBeChecked();
  await bar.getByRole('button', { name: 'Bỏ chọn' }).click();
  await expect(bar).toHaveCount(0);

  // Oldest first and the list view keep the heading over the same two items.
  await page.getByLabel('Sắp xếp').selectOption('oldest');
  await expect(page).toHaveURL(/sort=oldest/);
  await expect(heading).toHaveCount(1);
  await page.getByRole('button', { name: 'Danh sách', exact: true }).click();
  await expect(today.locator('.lib-row')).toHaveCount(2);
  await expect(day).toBeVisible();
  await page.getByRole('button', { name: 'Lưới', exact: true }).click();
});

test.describe('touch phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("the Library day's checkbox takes a 44 px tap and starts the selection", async ({ page }) => {
    await signIn(page, 'libd');
    await runViaApi(page);
    await expect.poll(async () => ((await (await page.request.get('/api/jobs?mine')).json()) as { jobs: { status: string }[] }).jobs.every((j) => j.status === 'succeeded'), { timeout: 60_000 }).toBe(true);
    await page.goto('/library');
    // The type pills scroll under a fade that cuts into the last one on screen, and the filters open in a sheet from one button that counts the ones set.
    const kinds = page.getByRole('group', { name: 'Loại', exact: true });
    await expect(kinds).toHaveCSS('mask-image', /linear-gradient/);
    expect(await kinds.evaluate((e) => e.scrollWidth > e.clientWidth)).toBe(true);
    const filters = page.getByRole('button', { name: /^Bộ lọc/ });
    await expect(filters).toHaveText('Bộ lọc');
    await expect(page.getByLabel('Người tạo')).toHaveCount(0);
    await filters.click();
    const sheet = page.getByRole('dialog', { name: 'Bộ lọc' });
    await sheet.getByLabel('Người tạo').selectOption({ label: 'E2E Library Days' });
    await sheet.getByRole('button', { name: 'Xong' }).click();
    await expect(sheet).toBeHidden();
    await expect(filters).toHaveText('Bộ lọc (1)');
    await expect(page.locator('.library-active .library-chip')).toContainText('Người tạo: E2E Library Days');
    const day = page.getByRole('checkbox', { name: /^Chọn tất cả \d+ mục ngày Hôm nay$/ });
    const hit = (await page.locator('.lib-day-check').filter({ has: day }).boundingBox())!;
    expect(Math.min(hit.width, hit.height)).toBeGreaterThanOrEqual(44);
    expect(hit.x).toBeGreaterThanOrEqual(0);
    await day.tap();
    await expect(page.getByRole('group', { name: 'Tải nhiều mục' })).toContainText(/Đã chọn [1-9]/);
    await expect(page.locator('.library')).toHaveAttribute('data-selecting', 'true');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
});

test('Library detail: how an item was made for anyone, marks by keyboard, ←/→ between items, bulk marks that skip the items of others, the unmarked count and no tray', async ({ page, browser }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  // Free-prompt clips on the mock video model, which the other Library specs already mark Pass: a mark stays after its job is deleted and moves the Recommended badge.
  const clip = async (p: typeof page, prompt: string) => {
    const up = (await (await p.request.post('/api/assets', { multipart: { file: { name: 'recipe.png', mimeType: 'image/png', buffer: png() } } })).json()) as { assets: { id: string }[] };
    const res = await p.request.post('/api/jobs', { data: { assetIds: [up.assets[0]!.id], modelId: 'mock-e2e', prompt, enhance: false, ratio: '9:16', durationSec: 5 } });
    expect(res.status()).toBe(201);
    return ((await res.json()) as { id: string }).id;
  };
  const done = (p: typeof page, ids: string[]) =>
    expect.poll(async () => ((await (await p.request.get('/api/jobs?mine')).json()) as { jobs: { id: string; status: string }[] }).jobs.filter((j) => ids.includes(j.id) && j.status === 'succeeded').length, { timeout: 60_000 }).toBe(ids.length);
  const other = await (await browser.newContext()).newPage();
  await signIn(other, 'librb');
  const theirs = await clip(other, 'words of **member B**');
  await signIn(page, 'libra');
  const older = await clip(page, 'recipe words one');
  const newer = await clip(page, 'recipe words two');
  await done(other, [theirs]);
  await done(page, [older, newer]);

  await page.goto('/library');
  await expect(page.getByRole('complementary', { name: 'Lượt tạo của tôi' })).toHaveCount(0); // the Library already lists every result
  const item = (id: string) => page.locator(`article[data-clip-id="${id}"]`);
  const detail = page.getByRole('dialog');
  const recipe = detail.getByRole('definition');
  // The label carries no count at 0 (and before the first page arrives, so the first read waits for 2 or more).
  const unmarked = async () => Number((await page.getByLabel('Kết quả').locator('option[value="none"]').textContent())?.match(/^Chưa chấm(?: \((\d+)\))?$/)?.[1] ?? 0);
  await expect.poll(unmarked).toBeGreaterThanOrEqual(2);
  const before = await unmarked();

  // Another member's item: its prompt (without Markdown's **), model and settings are open to everyone, its marks are not.
  await item(theirs).getByRole('button', { name: 'Xem chi tiết' }).click();
  await expect(detail.getByText('words of member B', { exact: true })).toBeVisible();
  await expect(recipe.filter({ hasText: /^Mock E2E$/ })).toHaveCount(1);
  await expect(recipe.filter({ hasText: /^5 giây$/ })).toHaveCount(1);
  await expect(recipe.filter({ hasText: /^E2E Library Recipe B · / })).toHaveCount(1);
  await expect(detail.getByRole('button', { name: 'Đạt', exact: true })).toHaveCount(0);
  // Tab from the close button meets the skip button before the player's six controls, and it takes focus into the side; ← on the player stays the player's.
  await detail.getByRole('button', { name: 'Đóng' }).focus();
  await page.keyboard.press('Tab');
  const skip = detail.getByRole('button', { name: 'Bỏ qua video' });
  await expect(skip).toBeFocused();
  await expect(skip).toBeInViewport({ ratio: 1 });
  await page.keyboard.press('Enter');
  expect(await detail.locator('.lightbox-side').evaluate((side) => side.contains(document.activeElement))).toBe(true);
  await detail.locator('.lightbox-media video').focus();
  await page.keyboard.press('ArrowLeft');
  await page.evaluate(() => new Promise(requestAnimationFrame)); // a step would have rendered by now
  await expect(detail.getByText('words of member B', { exact: true })).toBeVisible();
  // Its input photo opens large in the result's place, not in a new tab, and Về kết quả brings the result back.
  const input = detail.getByRole('list', { name: 'Ảnh đầu vào' }).getByRole('button', { name: 'recipe.png' });
  await input.click();
  await expect(input).toHaveAttribute('aria-pressed', 'true');
  await expect(detail.locator('.lightbox-media img')).toHaveAttribute('alt', 'Ảnh đầu vào recipe.png');
  await detail.getByRole('button', { name: 'Về kết quả' }).click();
  await expect(input).toHaveAttribute('aria-pressed', 'false');
  await expect(detail.locator('.lightbox-media video')).toHaveCount(1);
  await expect(detail.locator('.lightbox-media video')).toHaveJSProperty('loop', true); // a short clip plays on, as on the grid
  // By keyboard: Enter shows the photo, Về kết quả takes focus with a white ring on the dark picture, and Enter puts focus back on the photo.
  await input.focus();
  await page.keyboard.press('Enter');
  await expect(input).toHaveAttribute('aria-pressed', 'true');
  const back = detail.getByRole('button', { name: 'Về kết quả' });
  for (let i = 0; i < 12 && !(await back.evaluate((e) => e === document.activeElement)); i++) await page.keyboard.press('Shift+Tab');
  await expect(back).toBeFocused();
  await expect(back).toHaveCSS('outline-color', 'rgb(255, 255, 255)');
  await page.keyboard.press('Enter');
  await expect(back).toHaveCount(0);
  await expect(input).toBeFocused();
  await expect(input).toHaveAttribute('aria-pressed', 'false');
  // The ←/→ arrows sit on the picture on a phone, so they get the same white ring.
  const step = detail.locator('.lightbox-step').first();
  for (let i = 0; i < 30 && !(await step.evaluate((e) => e === document.activeElement)); i++) await page.keyboard.press('Tab');
  await expect(step).toBeFocused();
  await expect(step).toHaveCSS('outline-color', 'rgb(255, 255, 255)');
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
  // End on Pass, as the other Library specs leave this model.
  await bulk.getByRole('button', { name: 'Đạt', exact: true }).click();
  await expect(item(older).getByTitle('Kết quả: Đạt', { exact: true })).toBeVisible();

  // Leave nothing behind for the other specs that read the shared Library.
  for (const id of [newer, older]) expect((await page.request.delete(`/api/jobs/${id}`)).ok()).toBe(true);
  expect((await other.request.delete(`/api/jobs/${theirs}`)).ok()).toBe(true);
});

test('the Library detail fetches its image neighbours’ large previews ahead, so an arrow shows the next picture at once', async ({ page }) => {
  await signIn(page, 'librp');
  const image = async (prompt: string) => {
    const res = await page.request.post('/api/jobs', { data: { feature: 'image', modelId: 'mock-image-e2e', assetIds: [], ratio: '1:1', prompt, enhance: false, params: { resolution: '1K' } } });
    expect(res.status()).toBe(201);
    return ((await res.json()) as { id: string }).id;
  };
  const older = await image('a neighbour picture');
  const newer = await image('the open picture');
  const mine = async () => ((await (await page.request.get('/api/jobs?mine')).json()) as { jobs: { id: string; status: string; outputAssetId: string }[] }).jobs.filter((j) => j.id === older || j.id === newer);
  try {
    await expect.poll(async () => (await mine()).filter((j) => j.status === 'succeeded').length, { timeout: 60_000 }).toBe(2);
    const neighbour = (await mine()).find((j) => j.id === older)!.outputAssetId;
    await page.goto('/library');
    await page.getByLabel('Người tạo').selectOption({ label: 'E2E Library Prefetch' });
    await expect(page.getByRole('article')).toHaveCount(2);
    const ahead = page.waitForRequest((r) => r.url().endsWith(`/api/assets/${neighbour}/thumb?w=1600`));
    await page.locator(`article[data-clip-id="${newer}"]`).getByRole('button', { name: 'Xem chi tiết' }).click();
    await expect(page.getByRole('dialog').getByText('the open picture', { exact: true })).toBeVisible();
    await ahead; // asked for while the newer picture is open, before any arrow
  } finally {
    for (const id of [older, newer]) expect((await page.request.delete(`/api/jobs/${id}`)).ok()).toBe(true);
  }
});

test('Dùng khung hình này in a video’s detail opens Create video with the frame on screen as its first image', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signIn(page, 'librf');
  const up = (await (await page.request.post('/api/assets', { multipart: { file: { name: 'frame-in.png', mimeType: 'image/png', buffer: png() } } })).json()) as { assets: { id: string }[] };
  const res = await page.request.post('/api/jobs', { data: { assetIds: [up.assets[0]!.id], modelId: 'mock-e2e', prompt: 'a clip to take a frame from', enhance: false, ratio: '9:16', durationSec: 5 } });
  expect(res.status()).toBe(201);
  const id = ((await res.json()) as { id: string }).id;
  try {
    await expect.poll(async () => ((await (await page.request.get('/api/jobs?mine')).json()) as { jobs: { id: string; status: string }[] }).jobs.find((j) => j.id === id)?.status, { timeout: 60_000 }).toBe('succeeded');
    await page.goto('/library');
    await page.getByLabel('Người tạo').selectOption({ label: 'E2E Library Frame' });
    await page.locator(`article[data-clip-id="${id}"]`).getByRole('button', { name: 'Xem chi tiết' }).click();
    const detail = page.getByRole('dialog');
    await expect.poll(() => detail.locator('video').evaluate((v: HTMLVideoElement) => v.readyState)).toBeGreaterThanOrEqual(2); // a frame is decoded
    // Download and the frame carry their words; the rerun, a new paid job, is the quieter button beside Reuse and names the price the clip cost.
    await expect(detail.locator('.job-actions .labelled')).toHaveText(['Tải xuống', 'Dùng khung hình']);
    const rerun = detail.getByRole('button', { name: /^Chạy lại · \$\d+\.\d+$/ });
    await expect(rerun).toHaveCSS('background-color', await detail.locator('.lightbox-side').evaluate((e) => getComputedStyle(e).backgroundColor));
    await expect(detail.locator('.lightbox-foot-actions').getByRole('link', { name: 'Dùng lại' })).toBeInViewport({ ratio: 1 });
    await detail.getByRole('button', { name: 'Dùng khung hình', exact: true }).click();
    await expect(page.getByRole('region', { name: 'Thông báo' })).toContainText('Đã tải khung hình lên, đang mở Tạo video'); // the page is about to change: say why
    await expect(page).toHaveURL(/\/create\?image=[\w-]+$/);
    const picked = page.getByLabel('Ảnh đã chọn').getByRole('img');
    await expect(picked).toHaveCount(1);
    await expect(picked).toHaveAccessibleName(/s\.jpg$/); // the frame, named after the clip and its second
  } finally {
    expect((await page.request.delete(`/api/jobs/${id}`)).ok()).toBe(true);
  }
});

// As from a History card: a picture opens in the two photo tools from its Library detail, the copy (a new input of the viewer's) already in the tool's slot,
// for its creator and for another member of the workspace (owner decision 2026-11-20). CVS_E2E_SHOTS=<folder> saves the screenshots there (1440 px light, 390 px dark).
test('the photo tools in a picture’s Library detail open the tool with the picture in its slot, for its creator and for another member', async ({ page, browser }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signIn(page, 'libtoola');
  const res = await page.request.post('/api/jobs', { data: { feature: 'image', modelId: 'mock-image-e2e', assetIds: [], ratio: '1:1', prompt: 'a picture for the photo tools', enhance: false, params: { resolution: '1K' } } });
  expect(res.status()).toBe(201);
  const id = ((await res.json()) as { id: string }).id;
  const shot = (p: Page, name: string) => p.screenshot({ path: process.env.CVS_E2E_SHOTS ? `${process.env.CVS_E2E_SHOTS}/${name}.png` : test.info().outputPath(`${name}.png`) });
  const open = async (p: Page, phone = false) => {
    await p.goto('/library');
    if (phone) await p.getByRole('button', { name: /^Bộ lọc/ }).click(); // a phone's filters are in a sheet
    await p.getByLabel('Người tạo').selectOption({ label: 'E2E Library Tools A' });
    if (phone) await p.getByRole('button', { name: 'Xong' }).click();
    await p.locator(`article[data-clip-id="${id}"]`).getByRole('button', { name: 'Xem chi tiết' }).click();
    const detail = p.getByRole('dialog');
    await expect(detail.getByText('a picture for the photo tools', { exact: true })).toBeVisible();
    return detail;
  };
  const inSlot = (p: Page) => expect(p.getByRole('group', { name: 'Ảnh', exact: true }).getByRole('img', { name: /^history-\w{8}\.(png|jpg|webp)$/ })).toBeVisible();
  try {
    await expect.poll(async () => ((await (await page.request.get('/api/jobs?mine')).json()) as { jobs: { id: string; status: string }[] }).jobs.find((j) => j.id === id)?.status, { timeout: 60_000 }).toBe('succeeded');

    // Another member: the Background Remover button on A's picture opens it with B's own copy of the picture, ready to run.
    const other = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();
    await signIn(other, 'libtoolb');
    const theirs = await open(other);
    await expect(theirs.getByRole('button', { name: 'Tăng độ phân giải' })).toBeVisible();
    await shot(other, 'library-detail-tools-other-1440-light');
    await theirs.getByRole('button', { name: 'Xoá nền' }).click();
    await expect(other).toHaveURL(/\/apps\/background-remover\?image=[\w-]+$/);
    await inSlot(other);
    await expect(other.getByRole('button', { name: /^Chạy/ })).toBeEnabled(); // the photo is all Background Remover needs
    await other.context().close();

    // A touch phone in dark mode: both tools are full touch targets, the side scrolls instead of squeezing the Reuse link (it drew 24 px tall), and nothing scrolls sideways.
    const phone = await (await browser.newContext({ storageState: await page.context().storageState(), viewport: { width: 390, height: 844 }, colorScheme: 'dark', hasTouch: true, isMobile: true })).newPage();
    const small = await open(phone, true);
    // Reuse is in the side's pinned footer: on screen before any scroll of the side.
    await expect(small.getByRole('link', { name: 'Dùng lại' })).toBeInViewport({ ratio: 1 });
    const tools = small.locator('.lightbox-tools');
    await tools.scrollIntoViewIfNeeded();
    await shot(phone, 'library-detail-tools-390-dark');
    for (const name of ['Xoá nền', 'Tăng độ phân giải']) expect((await tools.getByRole('button', { name }).boundingBox())!.height, name).toBeGreaterThanOrEqual(44);
    expect((await small.getByRole('link', { name: 'Dùng lại' }).boundingBox())!.height).toBe(40);
    expect(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await phone.context().close();

    // The creator: the Image Upscale button opens it with the picture in its slot.
    const detail = await open(page);
    await expect(detail.getByRole('button', { name: 'Xoá nền' })).toBeVisible();
    await shot(page, 'library-detail-tools-1440-light');
    await detail.getByRole('button', { name: 'Tăng độ phân giải' }).click();
    await expect(page).toHaveURL(/\/apps\/image-upscale\?image=[\w-]+$/);
    await inSlot(page);
  } finally {
    expect((await page.request.delete(`/api/jobs/${id}`)).ok()).toBe(true);
  }
});

// A system account's results stay out of everyone's Library; an Admin's "Hiện tài khoản hệ thống" shows them, marked, and the address keeps it (owner decision 2026-11-20).
// CVS_E2E_SHOTS=<folder> saves the screenshots there (1440 px light, 390 px dark).
test('a system account’s results stay out of the Library until an Admin ticks Hiện tài khoản hệ thống', async ({ page, browser }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signIn(page, 'syslib');
  const id = await runViaApi(page);
  const shot = (p: Page, name: string) => p.screenshot({ path: process.env.CVS_E2E_SHOTS ? `${process.env.CVS_E2E_SHOTS}/${name}.png` : test.info().outputPath(`${name}.png`) });
  const listed = (p: Page) => p.waitForResponse((r) => new URL(r.url()).pathname === '/api/library' && r.ok());
  try {
    await expect.poll(async () => ((await (await page.request.get('/api/jobs?mine')).json()) as { jobs: { id: string; status: string }[] }).jobs.find((j) => j.id === id)?.status, { timeout: 60_000 }).toBe('succeeded');

    // A member, the account itself included, never gets them back, not even with system=1 in the address, and has no such toggle.
    const own = listed(page);
    await page.goto('/library?system=1');
    await own;
    await expect(page.locator('.library-empty, .grid .card').first()).toBeVisible(); // the list is drawn, so a missing card is left out, not late
    await expect(page.locator(`article[data-clip-id="${id}"]`)).toHaveCount(0);
    await expect(page.getByRole('checkbox', { name: 'Hiện tài khoản hệ thống' })).toHaveCount(0);

    const admin = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();
    await signIn(admin, 'admin');
    const first = listed(admin);
    await admin.goto('/library');
    await first;
    await expect(admin.locator('.library-empty, .grid .card').first()).toBeVisible();
    const toggle = admin.getByRole('checkbox', { name: 'Hiện tài khoản hệ thống' });
    await expect(toggle).not.toBeChecked();
    await expect(admin.locator(`article[data-clip-id="${id}"]`)).toHaveCount(0);
    await expect(admin.getByLabel('Người tạo').locator('option', { hasText: 'E2E System Library' })).toHaveCount(0);
    await toggle.check();
    await expect(admin).toHaveURL(/[?&]system=1(&|$)/);
    await admin.getByLabel('Người tạo').selectOption({ label: 'E2E System Library' });
    await expect(admin.locator(`article[data-clip-id="${id}"]`).locator('.tag', { hasText: 'Hệ thống' })).toBeVisible();
    await expect(admin.locator('.library-days')).toHaveAttribute('aria-busy', 'false'); // the creator's list has answered, so the grid is no longer dimmed
    await shot(admin, 'library-system-1440-light');

    // The same address on a phone in dark mode: the toggle stays on and the card keeps its mark.
    const phone = await (await browser.newContext({ storageState: await admin.context().storageState(), viewport: { width: 390, height: 844 }, colorScheme: 'dark', hasTouch: true, isMobile: true })).newPage();
    await phone.goto(admin.url());
    await expect(phone.locator(`article[data-clip-id="${id}"]`).locator('.tag', { hasText: 'Hệ thống' })).toBeVisible();
    await expect(phone.locator('.library-days')).toHaveAttribute('aria-busy', 'false');
    await phone.getByRole('button', { name: /^Bộ lọc/ }).click(); // a phone's filters are in a sheet
    const small = phone.getByRole('dialog', { name: 'Bộ lọc' }).getByRole('checkbox', { name: 'Hiện tài khoản hệ thống' });
    await expect(small).toBeChecked();
    await small.scrollIntoViewIfNeeded();
    await shot(phone, 'library-system-390-dark');
    await phone.getByRole('button', { name: 'Xong' }).click();
    expect(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await phone.context().close();
    await admin.context().close();
  } finally {
    expect((await page.request.delete(`/api/jobs/${id}`)).ok()).toBe(true);
  }
});

test('a failed Library read says so, and Thử lại loads it without a page reload', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signIn(page, 'loada');
  let fail = true;
  await page.route(/\/api\/library(\?|$)/, (r) => (fail ? r.fulfill({ status: 500, json: { error: 'down' } }) : r.fallback()));
  await page.goto('/library');
  await expect(page.getByText('Không tải được thư viện.')).toBeVisible();
  fail = false;
  await page.getByRole('button', { name: 'Thử lại' }).click();
  await expect(page.getByText('Không tải được thư viện.')).toHaveCount(0);
  await expect(page.locator('.library-empty, .grid .card').first()).toBeVisible(); // the company's items, or the empty state on a fresh database
});
