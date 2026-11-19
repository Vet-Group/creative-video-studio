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
  await expect(cost(page)).toHaveText('3 ảnh × $0.0350 = $0.1050');
  await expect(runButton(page)).toContainText('$0.1050');
  await views(page).getByText('Nhìn từ trên', { exact: true }).click();
  await expect(cost(page)).toHaveText('4 ảnh × $0.0350 = $0.1400');
  for (const name of ['Mặt sau', 'Bên trái', 'Bên phải', 'Nhìn từ trên']) await views(page).getByText(name, { exact: true }).click();
  await expect(page.locator('.form-message').getByRole('status')).toHaveText('Chọn ít nhất một góc.');
  await expect(runButton(page)).toBeDisabled();
  for (const name of ['Mặt sau', 'Bên trái']) await views(page).getByText(name, { exact: true }).click();
  await expect(cost(page)).toHaveText('2 ảnh × $0.0350 = $0.0700');

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
