import { expect, type Page, test } from '@playwright/test';
import { modelButton, png, signIn } from './support.test';

const runButton = (page: Page) => page.getByRole('button', { name: /^Chạy/ });
const views = (page: Page) => page.getByRole('group', { name: 'Góc cần tạo' });
const cost = (page: Page) => page.getByRole('status').filter({ hasText: 'ảnh ×' });
const pickModel = async (page: Page, name: RegExp) => {
  await modelButton(page).click();
  await page.getByRole('option', { name }).click();
  await expect(modelButton(page)).toContainText(name);
};

// The multi-angle app: one product photo in, one job per view picked, each titled with its view in History.
test('picks the views of a product photo, sees the price of one image per view, runs one job per view and reuses the whole batch from one of them', async ({ page }) => {
  await signIn(page, 'viewsa');
  await page.goto('/apps');
  await page.getByRole('list', { name: 'Danh sách ứng dụng' }).getByRole('link').filter({ hasText: 'Ảnh nhiều góc' }).click();
  await expect(page).toHaveURL(/\/apps\/multi-angle$/);

  // The back and both sides by default, with the note that the model guesses them.
  for (const name of ['Mặt sau', 'Bên trái', 'Bên phải']) await expect(views(page).getByRole('checkbox', { name })).toBeChecked();
  for (const name of ['Góc 3/4 trái', 'Góc 3/4 phải', 'Nhìn từ trên']) await expect(views(page).getByRole('checkbox', { name })).not.toBeChecked();
  await expect(page.getByText('Mặt sau và hai bên là AI đoán từ ảnh mặt trước; nếu có ảnh thật thì dùng ảnh thật.')).toBeVisible();
  await expect(page.locator('.form-message').getByRole('status')).toHaveText('Tải lên ảnh: Sản phẩm.');
  await page.getByLabel('Ảnh sản phẩm').setInputFiles({ name: 'hoodie.png', mimeType: 'image/png', buffer: png() });
  await expect(page.getByRole('group', { name: 'Sản phẩm' }).getByRole('img', { name: 'hoodie.png' })).toBeVisible();

  // A priced model: the line and the Run button show one image's price per view.
  await pickModel(page, /Mock angles priced/);
  await expect(cost(page)).toHaveText('3 ảnh × $0.035 = $0.105');
  await expect(runButton(page)).toContainText('$0.105');
  await views(page).getByText('Nhìn từ trên', { exact: true }).click();
  await expect(cost(page)).toHaveText('4 ảnh × $0.035 = $0.14');
  for (const name of ['Mặt sau', 'Bên trái', 'Bên phải', 'Nhìn từ trên']) await views(page).getByText(name, { exact: true }).click();
  await expect(page.locator('.form-message').getByRole('status')).toHaveText('Chọn ít nhất một góc.');
  await expect(runButton(page)).toBeDisabled();
  await expect(runButton(page)).not.toContainText('$'); // no free-looking $0.0000 while nothing is picked
  for (const name of ['Mặt sau', 'Bên trái']) await views(page).getByText(name, { exact: true }).click();
  await expect(cost(page)).toHaveText('2 ảnh × $0.035 = $0.07');

  // The run itself on the mock model, which makes the pictures.
  await pickModel(page, /Mock angles E2E/);
  await runButton(page).click();
  await expect(page.getByText('Đã gửi lượt tạo')).toBeVisible();
  const mine = async () =>
    ((await (await page.request.get('/api/jobs?mine')).json()) as { jobs: { id: string; feature: string; status: string; view: string | null }[] }).jobs.filter((j) => j.feature === 'multi_angle');
  await expect.poll(async () => (await mine()).map((j) => [j.view, j.status]).sort(), { timeout: 90_000 }).toEqual([['back', 'succeeded'], ['left', 'succeeded']]);
  await expect(page.getByRole('heading', { name: 'Ảnh nhiều góc · Mặt sau', level: 3 })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Ảnh nhiều góc · Bên trái', level: 3 })).toBeVisible();

  // Reuse one card: the photo back in its slot and every view of its Run picked again, so the member changes one and runs the batch again.
  const back = (await mine()).find((j) => j.view === 'back')!;
  await page.goto(`/apps/multi-angle?reuse=${back.id}`);
  await expect(page.getByRole('group', { name: 'Sản phẩm' }).getByRole('img', { name: 'hoodie.png' })).toBeVisible();
  await expect(views(page).getByRole('checkbox', { name: 'Mặt sau' })).toBeChecked();
  await expect(views(page).getByRole('checkbox', { name: 'Bên trái' })).toBeChecked();
  await expect(views(page).getByRole('checkbox', { name: 'Bên phải' })).not.toBeChecked();
});

// The 360 turntable: one chip picks the 7 horizontal views, and the finished Run shows the video the worker stitched from the photo and its 7 views.
test('the 360 chip picks exactly the 7 horizontal views and clears them on a second press, and a Run with it ends with a playable 360 video to download', async ({ page }) => {
  await signIn(page, 'viewsb');
  await page.goto('/apps/multi-angle');
  const chip = page.getByRole('group', { name: 'Chọn nhanh' }).getByRole('button', { name: 'Vòng xoay 360°' });
  await expect(page.getByText('Chọn 7 góc ngang; khi cả 7 ảnh xong, app tự ghép ảnh gốc và 7 góc thành video xoay 360° (MP4, miễn phí).')).toBeVisible();
  await expect(chip).toHaveAttribute('aria-pressed', 'false'); // the back and both sides are picked, not the turntable
  await page.getByLabel('Ảnh sản phẩm').setInputFiles({ name: 'hoodie.png', mimeType: 'image/png', buffer: png() });
  await expect(page.getByRole('group', { name: 'Sản phẩm' }).getByRole('img', { name: 'hoodie.png' })).toBeVisible();
  await pickModel(page, /Mock angles priced/);

  await chip.click();
  await expect(chip).toHaveAttribute('aria-pressed', 'true');
  for (const name of ['Mặt sau', 'Bên trái', 'Bên phải', 'Góc 3/4 trái', 'Góc 3/4 phải', 'Sau chéo trái', 'Sau chéo phải']) await expect(views(page).getByRole('checkbox', { name })).toBeChecked();
  await expect(views(page).getByRole('checkbox', { name: 'Nhìn từ trên' })).not.toBeChecked();
  await expect(cost(page)).toHaveText('7 ảnh × $0.035 = $0.245');
  await views(page).getByText('Nhìn từ trên', { exact: true }).click();
  await expect(chip).toHaveAttribute('aria-pressed', 'false'); // eight views are more than the turntable
  await views(page).getByText('Nhìn từ trên', { exact: true }).click();
  await expect(chip).toHaveAttribute('aria-pressed', 'true');
  await chip.click();
  await expect(chip).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('.form-message').getByRole('status')).toHaveText('Chọn ít nhất một góc.');
  await chip.click();

  await pickModel(page, /Mock angles E2E/);
  await runButton(page).click();
  await expect(page.getByText('Đã gửi lượt tạo')).toBeVisible();
  const mine = async () => ((await (await page.request.get('/api/jobs?mine')).json()) as { jobs: { feature: string; status: string }[] }).jobs.filter((j) => j.feature === 'multi_angle');
  await expect.poll(async () => (await mine()).filter((j) => j.status === 'succeeded').length, { timeout: 120_000 }).toBe(7);

  // Under the 7 results: the video, once the worker has stitched it, playing and with its download.
  await expect(page.getByRole('heading', { name: 'Video xoay 360°', level: 3 })).toBeVisible();
  const video = page.getByLabel('Video xoay 360° của ảnh gốc và 7 góc ngang');
  await expect(video).toBeVisible({ timeout: 60_000 });
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.readyState >= 2 && v.videoWidth > 0 && v.duration > 7), { timeout: 30_000 }).toBe(true);
  const download = page.getByRole('link', { name: 'Tải video xoay 360°' });
  const href = (await download.getAttribute('href'))!;
  expect(href).toMatch(/^\/api\/turntables\/[0-9a-f-]{36}\?asset=[^&]+&download=1$/);
  const file = await page.request.get(href);
  expect(file.status()).toBe(200);
  expect(file.headers()['content-type']).toBe('video/mp4');
  expect(file.headers()['content-disposition']).toMatch(/^attachment; filename="xoay-360-[0-9a-f]{8}\.mp4"/);
  expect((await file.body()).length).toBeGreaterThan(1000);
});
