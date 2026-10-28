import { expect, test } from '@playwright/test';
import { png, signIn } from './support.test';

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
  await expect(card.locator('.job-chips span')).toHaveText(['2K', '1:1']);
  await expect(card.getByRole('img', { name: 'Tạo ảnh' })).toBeVisible();
  await expect(card.getByRole('link', { name: 'Dùng lại' })).toHaveAttribute('href', `/image-generation?reuse=${id}`);

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
