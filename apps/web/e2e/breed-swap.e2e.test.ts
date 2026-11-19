import { expect, type Page, test } from '@playwright/test';
import { modelButton, png, signIn } from './support.test';

const runButton = (page: Page) => page.getByRole('button', { name: /^Chạy/ });
const breeds = (page: Page) => page.getByRole('group', { name: 'Giống chó cần tạo' });
const cost = (page: Page) => page.getByRole('status').filter({ hasText: 'ảnh ×' });
const pickModel = async (page: Page, name: RegExp) => {
  await modelButton(page).click();
  await page.getByRole('option', { name }).click();
  await expect(modelButton(page)).toContainText(name);
};

// The breed swap app: one picture with a dog in, one job per breed picked, each with its breed in the prompt and titled with it in History.
test('picks three breeds for a picture with a dog, sees the price of one image per breed, runs one job per breed and reuses the whole batch from one of them', async ({ page }) => {
  await signIn(page, 'breedsa');
  await page.goto('/apps');
  await page.getByRole('list', { name: 'Danh sách ứng dụng' }).getByRole('link').filter({ hasText: 'Đổi giống chó hàng loạt' }).click();
  await expect(page).toHaveURL(/\/apps\/breed-swap$/);

  // No breed until the member picks one, as each costs a job.
  await expect(breeds(page).getByRole('checkbox')).toHaveCount(25);
  for (const name of ['Golden Retriever', 'Pug', 'Border Collie']) await expect(breeds(page).getByRole('checkbox', { name })).not.toBeChecked();
  await expect(page.locator('.form-message').getByRole('status')).toHaveText('Tải lên ảnh: Ảnh gốc.');
  await page.getByLabel('Ảnh gốc có chó').setInputFiles({ name: 'rug.png', mimeType: 'image/png', buffer: png() });
  await expect(page.getByRole('group', { name: 'Ảnh gốc' }).getByRole('img', { name: 'rug.png' })).toBeVisible();
  await expect(page.locator('.form-message').getByRole('status')).toHaveText('Chọn ít nhất một giống chó.');
  await expect(runButton(page)).toBeDisabled();

  // A priced model: the line and the Run button show one image's price per breed, and the preview the first breed's prompt.
  await pickModel(page, /Mock breeds priced/);
  for (const name of ['Golden Retriever', 'Pug', 'Australian Shepherd']) await breeds(page).getByText(name, { exact: true }).click();
  await expect(cost(page)).toHaveText('3 ảnh × $0.0400 = $0.1200');
  await expect(runButton(page)).toContainText('$0.1200');
  await expect(page.getByRole('group', { name: 'Bản cuối gửi cho mô hình' })).toContainText('Golden Retriever: Replace only the dog in the image with a Golden Retriever,');
  await expect(page.getByText('2 giống còn lại dùng prompt như trên, chỉ khác tên giống.')).toBeVisible();

  // The run itself on the mock model, which makes the pictures: one job per breed, each with its own prompt.
  await pickModel(page, /Mock breeds E2E/);
  await runButton(page).click();
  await expect(page.getByText('Đã gửi lượt tạo')).toBeVisible();
  const mine = async () =>
    ((await (await page.request.get('/api/jobs?mine')).json()) as { jobs: { id: string; feature: string; status: string; breed: string | null }[] }).jobs.filter((j) => j.feature === 'breed_swap');
  await expect.poll(async () => (await mine()).map((j) => [j.breed, j.status]).sort(), { timeout: 90_000 }).toEqual([
    ['Australian Shepherd', 'succeeded'], ['Golden Retriever', 'succeeded'], ['Pug', 'succeeded'],
  ]);
  for (const job of await mine()) {
    const { prompt } = (await (await page.request.get(`/api/jobs/${job.id}`)).json()) as { prompt: string };
    expect(prompt).toMatch(new RegExp(`^Replace only the dog in the image with an? ${job.breed}, `));
  }
  for (const breed of ['Golden Retriever', 'Pug', 'Australian Shepherd']) await expect(page.getByRole('heading', { name: `Đổi giống chó · ${breed}`, level: 3 })).toBeVisible();

  // Reuse one card: the picture back in its slot and every breed of its Run picked again.
  const pug = (await mine()).find((j) => j.breed === 'Pug')!;
  await page.goto(`/apps/breed-swap?reuse=${pug.id}`);
  await expect(page.getByRole('group', { name: 'Ảnh gốc' }).getByRole('img', { name: 'rug.png' })).toBeVisible();
  for (const name of ['Golden Retriever', 'Pug', 'Australian Shepherd']) await expect(breeds(page).getByRole('checkbox', { name })).toBeChecked();
  await expect(breeds(page).getByRole('checkbox', { name: 'Beagle' })).not.toBeChecked();
  await expect(cost(page)).toHaveText('3 ảnh × $0.0000 = $0.0000');
});
