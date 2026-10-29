import { expect, test } from '@playwright/test';
import { png, runViaApi, select, selectValue, signIn } from './support.test';

// A page's History tab lists the member's jobs as Fash's History cards: the result, the member's words, the inputs, chips, and the actions.
test('a History card shows the text, inputs and chips, and its favourite, new-tab, download, delete and Dùng lại actions work', async ({ page }) => {
  await signIn(page, 'hista');
  const up = async (name: string) => ((await (await page.request.post('/api/assets', { multipart: { file: { name, mimeType: 'image/png', buffer: png() } } })).json()) as { assets: { id: string }[] }).assets[0]!.id;
  const [a, b] = [await up('h-1.png'), await up('h-2.png')];
  const res = await page.request.post('/api/jobs', { data: { feature: 'image', modelId: 'mock-image-e2e', assetIds: [a, b], ratio: '1:1', prompt: 'a studio shot of the bag', enhance: false, params: { resolution: '2K' } } });
  expect(res.status()).toBe(201);
  const { id } = (await res.json()) as { id: string };

  await page.goto('/image-generation');
  await page.getByRole('tab', { name: 'Lịch sử' }).click();
  const card = page.getByRole('complementary', { name: 'Job của tôi' }).getByRole('listitem').filter({ hasText: 'a studio shot of the bag' });
  await expect(card.getByText('Hoàn tất')).toBeVisible({ timeout: 60_000 });
  await expect(card.getByRole('heading', { name: /Tạo ảnh/ })).toBeVisible();
  await expect(card.getByRole('list', { name: 'Ảnh đầu vào' }).locator('img')).toHaveCount(2); // decorative thumbnails (alt="")
  await expect(card.locator('.job-chips button')).toHaveText(['2K', '1:1']); // as on Fash, each chip sets its value on the form (the next test)
  await expect(card.getByRole('img', { name: 'Tạo ảnh' })).toBeVisible();
  await expect(card.getByRole('button', { name: 'Dùng lại' })).toBeVisible(); // beside the form it refills in place (reuse e2e)

  const out = await card.getByRole('link', { name: 'Mở trong tab mới' }).getAttribute('href');
  expect(out).toMatch(/^\/api\/assets\/.+\/content$/);
  expect((await page.request.get(out!)).status()).toBe(200);

  const favourite = card.getByRole('button', { name: 'Yêu thích' });
  await favourite.click();
  await expect(favourite).toHaveAttribute('aria-pressed', 'true');
  await page.reload();
  await page.getByRole('tab', { name: 'Lịch sử' }).click();
  await expect(card.getByRole('button', { name: 'Yêu thích' })).toHaveAttribute('aria-pressed', 'true'); // kept on the server

  const download = page.waitForEvent('download');
  await card.getByRole('button', { name: 'Tải xuống' }).click();
  expect((await download).suggestedFilename()).toMatch(/\.(png|jpg|jpeg|webp)$/);

  page.once('dialog', (d) => void d.accept());
  await card.getByRole('button', { name: 'Xóa' }).click();
  await expect(card).toHaveCount(0);
  expect(((await (await page.request.get('/api/jobs?mine')).json()) as { jobs: { id: string }[] }).jobs.some((j) => j.id === id)).toBe(false);
});

test('as on Fash, a History chip sets its resolution, ratio or duration on the form beside it and says so', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signIn(page, 'chipa');
  const toast = (text: string) => page.getByRole('region', { name: 'Thông báo' }).getByText(text);
  const up = (await (await page.request.post('/api/assets', { multipart: { file: { name: 'c.png', mimeType: 'image/png', buffer: png() } } })).json()) as { assets: { id: string }[] };
  const res = await page.request.post('/api/jobs', { data: { feature: 'image', modelId: 'mock-image-e2e', assetIds: [up.assets[0]!.id], ratio: '1:1', prompt: 'chips shot', enhance: false, params: { resolution: '2K' } } });
  expect(res.status()).toBe(201);

  await page.goto('/image-generation');
  await page.getByRole('tab', { name: 'Lịch sử' }).click();
  const card = page.getByRole('complementary', { name: 'Job của tôi' }).getByRole('listitem').filter({ hasText: 'chips shot' });
  await expect(card.getByText('Hoàn tất')).toBeVisible({ timeout: 60_000 });
  await expect(select(page, 'Độ phân giải')).toHaveAttribute('data-value', '1K');
  await card.getByRole('button', { name: '2K' }).click();
  await expect(select(page, 'Độ phân giải')).toHaveAttribute('data-value', '2K');
  await expect(toast('Đã chọn độ phân giải 2K')).toBeVisible();
  await expect(toast('Đã chọn độ phân giải 2K')).toBeHidden({ timeout: 6_000 }); // a note goes by itself, with no Library link
  await card.getByRole('button', { name: '1:1' }).click();
  await expect(select(page, 'Tỉ lệ')).toHaveAttribute('data-value', '1:1');
  await expect(toast('Đã chọn tỉ lệ 1:1')).toBeVisible();

  // A video page: the duration chip.
  await runViaApi(page); // 9:16, 5 s
  await page.goto('/create');
  await page.getByRole('tab', { name: 'Lịch sử' }).click();
  const clip = page.getByRole('complementary', { name: 'Job của tôi' }).getByRole('listitem').first();
  await expect(clip.getByText('Hoàn tất')).toBeVisible({ timeout: 60_000 });
  await selectValue(page, 'Tỉ lệ khung hình', '1:1');
  await expect(select(page, 'Thời lượng')).toHaveAttribute('data-value', '8');
  await clip.getByRole('button', { name: '5s' }).click();
  await expect(select(page, 'Thời lượng')).toHaveAttribute('data-value', '5');
  await expect(toast('Đã chọn thời lượng 5s')).toBeVisible();
  await clip.getByRole('button', { name: '9:16' }).click();
  await expect(select(page, 'Tỉ lệ khung hình')).toHaveAttribute('data-value', '9:16');

  // The Library's cards have no form beside them: their chips stay plain text.
  await page.goto('/library');
  await expect(page.locator('.job-chips button')).toHaveCount(0);
});

test("as on Fash, a History card's words, inputs and result go on the form beside it, each with a note", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signIn(page, 'chipa');
  const up = async (name: string) => ((await (await page.request.post('/api/assets', { multipart: { file: { name, mimeType: 'image/png', buffer: png() } } })).json()) as { assets: { id: string }[] }).assets[0]!.id;
  const res = await page.request.post('/api/jobs', { data: { feature: 'image', modelId: 'mock-image-e2e', assetIds: [await up('piece-1.png'), await up('piece-2.png')], ratio: '1:1', prompt: 'pieces shot', enhance: false, params: { resolution: '1K' } } });
  expect(res.status()).toBe(201);

  await page.goto('/image-generation');
  await page.getByRole('tab', { name: 'Lịch sử' }).click();
  const card = page.getByRole('complementary', { name: 'Job của tôi' }).getByRole('listitem').filter({ hasText: 'pieces shot' });
  await expect(card.getByText('Hoàn tất')).toBeVisible({ timeout: 60_000 });
  const note = (text: string) => page.getByRole('region', { name: 'Thông báo' }).getByText(text);
  const chosen = page.getByRole('list', { name: 'Ảnh đã chọn' });
  await card.getByRole('button', { name: 'Dùng ảnh đầu vào 2' }).click();
  await expect(chosen.getByRole('img', { name: 'piece-2.png' })).toBeVisible();
  await expect(note('Đã thêm ảnh vào đầu vào')).toBeVisible();
  await card.getByRole('button', { name: 'Chép prompt vào ô Prompt' }).click();
  await expect(page.getByRole('textbox', { name: 'Mô tả cảnh bạn muốn tạo' })).toHaveValue('pieces shot');
  await expect(note('Đã chép prompt')).toBeVisible();
  await card.getByRole('button', { name: 'Dùng kết quả' }).click(); // Fash's Use Result: the result as one more input
  await expect(chosen.getByRole('img')).toHaveCount(2);
  expect(await page.url()).toMatch(/\/image-generation$/);
});

test("as Fash's Generate Video, an image in History opens Create video with the picture as its first image", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signIn(page, 'vidfrom');
  const res = await page.request.post('/api/jobs', { data: { feature: 'image', modelId: 'mock-image-e2e', assetIds: [], ratio: '1:1', prompt: 'a picture to animate', enhance: false, params: { resolution: '1K' } } });
  expect(res.status()).toBe(201);
  await page.goto('/image-generation');
  await page.getByRole('tab', { name: 'Lịch sử' }).click();
  const card = page.getByRole('complementary', { name: 'Job của tôi' }).getByRole('listitem').filter({ hasText: 'a picture to animate' });
  await expect(card.getByText('Hoàn tất')).toBeVisible({ timeout: 60_000 });
  await card.getByRole('link', { name: 'Tạo video' }).click();
  await expect(page).toHaveURL(/\/create\?image=[\w-]+$/);
  await expect(page.getByLabel('Ảnh đã chọn').getByRole('img')).toHaveCount(1);
  await expect(page.getByRole('textbox', { name: 'Mô tả chuyển động' })).toHaveValue('');
});

test('the Library item detail shows the result large with its words, inputs and chips, steps to the next item and closes on Esc', async ({ page }) => {
  await signIn(page, 'hista');
  const up = async (name: string) => ((await (await page.request.post('/api/assets', { multipart: { file: { name, mimeType: 'image/png', buffer: png() } } })).json()) as { assets: { id: string }[] }).assets[0]!.id;
  const input = await up('detail-in.png');
  const ids: string[] = [];
  for (const prompt of ['first detail shot', 'second detail shot']) {
    const res = await page.request.post('/api/jobs', { data: { feature: 'image', modelId: 'mock-image-e2e', assetIds: [input], ratio: '3:4', prompt, enhance: false, params: { resolution: '1K' } } });
    ids.push(((await res.json()) as { id: string }).id);
  }
  const done = async () => ((await (await page.request.get('/api/jobs?mine')).json()) as { jobs: { id: string; status: string }[] }).jobs.filter((j) => ids.includes(j.id) && j.status === 'succeeded').length;
  await expect.poll(done, { timeout: 60_000 }).toBe(2);

  await page.goto('/library');
  const mine = page.getByRole('article').filter({ hasText: 'E2E History A' });
  await mine.first().getByRole('button', { name: 'Xem chi tiết' }).click();
  const detail = page.getByRole('dialog', { name: 'Chi tiết: Tạo ảnh' });
  await expect(detail.getByText('second detail shot')).toBeVisible(); // newest first
  await expect(detail.getByRole('img', { name: 'detail-in.png' })).toBeVisible();
  await expect(detail.locator('.job-chips span')).toHaveText(['1K', '3:4']);
  await expect(detail.getByRole('link', { name: 'Dùng lại' })).toHaveAttribute('href', `/image-generation?reuse=${ids[1]}`);
  await expect(detail.getByRole('link', { name: 'Mở trong tab mới' })).toHaveAttribute('href', /^\/api\/assets\/.+\/content$/);

  await detail.getByRole('button', { name: 'Mục tiếp theo' }).click();
  await expect(detail.getByText('first detail shot')).toBeVisible();
  await expect(detail.getByRole('link', { name: 'Dùng lại' })).toHaveAttribute('href', `/image-generation?reuse=${ids[0]}`);
  await detail.getByRole('button', { name: 'Mục trước' }).click();
  await expect(detail.getByText('second detail shot')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(detail).toHaveCount(0);
});
