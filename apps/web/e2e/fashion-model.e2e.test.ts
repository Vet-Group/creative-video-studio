import { expect, test } from '@playwright/test';
import { gotoTryOn, openTab, select, selectValue, signIn } from './support.test';

// The AI model generator: traits and a number of images in, results in History, one saved as a model, which the saved tab and Try On's person picker then list.
test('picks traits and two images, runs, saves a result as a model and finds it in the list and in the Try On picker', async ({ page }) => {
  await signIn(page, 'fashiona');
  await page.goto('/apps/ai-fashion-model');
  const run = page.getByRole('button', { name: /^Chạy(?! lại)/ }); // not a History card's rerun button
  await expect(run).toBeEnabled();

  // A niche pre-selects its traits, which stay editable; one image by default, and the cost line follows the number of images.
  await selectValue(page, 'Phong cách (tuỳ chọn)', 'faith');
  await expect(select(page, 'Nguồn gốc')).toContainText('Đa dạng');
  await selectValue(page, 'Phong cách (tuỳ chọn)', 'melanin');
  await expect(select(page, 'Nguồn gốc')).toContainText('Da đen / gốc Phi');
  await page.getByRole('radio', { name: 'Nam', exact: true }).check();
  await expect(page.getByRole('radio', { name: 'Nam', exact: true })).toBeChecked();
  await expect(page.getByRole('status').filter({ hasText: '1 ảnh ×' })).toBeVisible();
  await page.getByRole('button', { name: 'Tăng số ảnh' }).click();
  await page.getByRole('button', { name: 'Tăng số ảnh' }).click();
  await expect(page.getByRole('status').filter({ hasText: '3 ảnh ×' })).toBeVisible();
  await page.getByRole('button', { name: 'Giảm số ảnh' }).click();
  await expect(page.getByRole('status').filter({ hasText: '2 ảnh × $0.00 = $0.00' })).toBeVisible();

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

  // A saved result says so; the other one, saved with its default name, takes that name.
  await expect(save).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Đã lưu', exact: true })).toBeDisabled();
  await save.click();
  await expect(dialog.getByLabel('Tên người mẫu')).toHaveValue('Nam · 26-40 tuổi · Da đen / gốc Phi');
  await dialog.getByRole('button', { name: 'Lưu', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(save).toHaveCount(0);

  // Reuse puts a job's traits back on the form for one image; a save of the same traits then starts with a numbered name.
  await page.getByRole('radio', { name: 'Nữ', exact: true }).check();
  await page.getByRole('button', { name: 'Dùng lại' }).first().click();
  await expect(page.getByRole('radio', { name: 'Nam', exact: true })).toBeChecked();
  await expect(select(page, 'Nguồn gốc')).toContainText('Da đen / gốc Phi');
  await expect(page.getByRole('group', { name: 'Số ảnh' }).locator('output')).toHaveText('1');
  await run.click();
  await expect(save).toHaveCount(1, { timeout: 90_000 });
  await save.click();
  await expect(dialog.getByLabel('Tên người mẫu')).toHaveValue('Nam · 26-40 tuổi · Da đen / gốc Phi 2');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();

  await openTab(page, 'Đã lưu');
  const card = page.getByRole('listitem').filter({ has: page.getByRole('heading', { name: 'Nam Melanin' }) });
  await expect(card).toHaveCount(1);
  await expect(card.getByText('Của bạn · Riêng tư')).toBeVisible();
  await expect(card.getByLabel('Dùng chung cho cả công ty')).not.toBeChecked();

  // Its Try On link opens Try On with the model already in the Model slot.
  await card.getByRole('link', { name: 'Dùng trong Thử đồ' }).click();
  await expect(page).toHaveURL(/\/try-on\?model=[\w-]+$/);
  await expect(page.getByRole('list', { name: 'Người mẫu: ảnh đã chọn' }).getByRole('img', { name: 'Nam Melanin' })).toBeVisible();

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
