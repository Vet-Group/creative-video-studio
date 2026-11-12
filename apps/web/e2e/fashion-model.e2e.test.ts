import { expect, test } from '@playwright/test';
import { gotoTryOn, openTab, select, selectValue, signIn } from './support.test';

// The AI model generator: traits and a number of images in, results in History, one saved as a model, which the my-models tab and Try On's person picker then list.
test('picks traits and two images, runs, saves a result as a model and finds it in the list and in the Try On picker', async ({ page }) => {
  await signIn(page, 'fashiona');
  await page.goto('/apps/ai-fashion-model');
  const run = page.getByRole('button', { name: /^Chạy/ });
  await expect(run).toBeEnabled();

  // A niche pre-selects its traits, which stay editable; the cost line follows the number of images.
  await selectValue(page, 'Phong cách (tuỳ chọn)', 'melanin');
  await expect(select(page, 'Nguồn gốc')).toContainText('Da đen / gốc Phi');
  await page.getByRole('radio', { name: 'Nam', exact: true }).check();
  await expect(page.getByRole('radio', { name: 'Nam', exact: true })).toBeChecked();
  await page.getByRole('button', { name: 'Tăng số ảnh' }).click();
  await expect(page.getByRole('status').filter({ hasText: '3 ảnh ×' })).toBeVisible();
  await page.getByRole('button', { name: 'Giảm số ảnh' }).click();
  await expect(page.getByRole('status').filter({ hasText: '2 ảnh × $0 = $0' })).toBeVisible();

  await run.click();
  await openTab(page, 'Lịch sử');
  const save = page.getByRole('button', { name: 'Lưu làm người mẫu' });
  await expect(save).toHaveCount(2, { timeout: 90_000 });

  const jobs = (await (await page.request.get('/api/jobs?mine')).json()) as { jobs: { feature: string; ratio: string }[] };
  expect(jobs.jobs.map((j) => [j.feature, j.ratio])).toEqual([['fashion_model', '3:4'], ['fashion_model', '3:4']]);

  await save.first().click();
  const dialog = page.getByRole('dialog', { name: 'Lưu làm người mẫu' });
  await expect(dialog.getByLabel('Tên người mẫu')).toHaveValue('Nam · 26-40 tuổi · Da đen / gốc Phi');
  await dialog.getByLabel('Tên người mẫu').fill('Nam Melanin');
  await dialog.getByRole('button', { name: 'Lưu', exact: true }).click();
  await expect(dialog).toBeHidden();

  await openTab(page, 'Người mẫu của tôi');
  const card = page.getByRole('listitem').filter({ has: page.getByRole('heading', { name: 'Nam Melanin' }) });
  await expect(card).toHaveCount(1);
  await expect(card.getByText('Của bạn · Riêng tư')).toBeVisible();
  await expect(card.getByLabel('Dùng chung cho cả công ty')).not.toBeChecked();

  await gotoTryOn(page);
  const picker = page.getByRole('dialog', { name: 'Chọn người mẫu' });
  // The slot opens its picker once the saved models have loaded; before that a click opens the file chooser, so it is retried.
  await expect(async () => {
    await page.getByRole('button', { name: 'Tải lên Người mẫu' }).click({ timeout: 2_000 });
    await expect(picker).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
  await expect(picker.getByRole('heading', { name: 'Người mẫu AI' })).toBeVisible();
  await picker.getByRole('button', { name: 'Dùng người mẫu AI Nam Melanin' }).click();
  await expect(page.getByRole('list', { name: 'Người mẫu: ảnh đã chọn' }).getByRole('img', { name: 'Nam Melanin' })).toBeVisible();
});
