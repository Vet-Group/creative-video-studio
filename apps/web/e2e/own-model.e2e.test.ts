import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { gotoTryOn, select, selectValue, signIn } from './support.test';

// Try On's own-model creator (Fash's "Create a model unique to your brand"): the model picker's tile opens five traits in place of the photos and Back
// returns; a run (the mock model) saves the member's private AI model, fills the Model slot with it, and the picker then lists it in its AI models group.
test('creates a model inside the Try On model picker, fills the slot and lists it as an AI model', async ({ page }) => {
  await signIn(page, 'ownmodel');
  await gotoTryOn(page);
  // With no stock model at all, the slot still opens the picker: it holds the upload tile and this one.
  await page.getByRole('button', { name: 'Tải lên Người mẫu' }).click();
  const picker = page.getByRole('dialog', { name: 'Chọn người mẫu' });
  const create = picker.getByRole('button', { name: 'Tạo người mẫu riêng cho thương hiệu' });
  await create.click();

  const form = page.getByRole('dialog', { name: 'Tạo người mẫu riêng' });
  await expect(select(page, 'Giới tính')).toBeFocused();
  await form.getByRole('button', { name: 'Quay lại' }).click();
  await create.click();
  expect((await new AxeBuilder({ page }).include('dialog[open]').analyze()).violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id)).toEqual([]);

  // A minor in the free text stops the run before it is sent, as on the app's page.
  const extra = form.getByLabel('Chi tiết thêm (tuỳ chọn)');
  const run = form.getByRole('button', { name: /^Tạo người mẫu/ });
  // The free-text box takes the page's font, not the browser's monospace default.
  expect(await extra.evaluate((e) => getComputedStyle(e).fontFamily)).toBe(await page.evaluate(() => getComputedStyle(document.body).fontFamily));
  await extra.fill('15 tuổi');
  await expect(run).toBeDisabled();
  await expect(form.getByText('Chi tiết thêm không được nhắc đến trẻ em')).toBeVisible();
  await extra.fill('tóc buộc cao');
  await selectValue(page, 'Giới tính', 'male');
  await selectValue(page, 'Dáng người', 'plus');
  await expect(run).toBeEnabled();
  await run.click();

  const name = 'Nam · 26-40 tuổi · Việt Nam / Đông Nam Á';
  await expect(form).toBeHidden({ timeout: 90_000 });
  await expect(page.getByRole('list', { name: 'Người mẫu: ảnh đã chọn' }).getByRole('img', { name })).toBeVisible();

  // One fashion_model job, full length on white, in a portrait ratio.
  const jobs = (await (await page.request.get('/api/jobs?mine')).json()) as { jobs: { feature: string; ratio: string; traits: string | null }[] };
  expect(jobs.jobs.map((j) => [j.feature, j.ratio])).toEqual([['fashion_model', '3:4']]);
  expect(JSON.parse(jobs.jobs[0]!.traits!)).toMatchObject({ gender: 'male', body: 'plus', framing: 'full', background: 'white' });

  // Saved private, and listed in the picker's AI models group without a reload.
  const saved = (await (await page.request.get('/api/fashion-models')).json()) as { models: { name: string; shared: boolean }[] };
  expect(saved.models.map((m) => [m.name, m.shared])).toEqual([[name, false]]);
  await page.getByRole('button', { name: `Bỏ ảnh ${name}` }).click();
  await page.getByRole('button', { name: 'Tải lên Người mẫu' }).click();
  await expect(picker.getByRole('heading', { name: 'Người mẫu AI' })).toBeVisible();
  await expect(picker.getByRole('button', { name: `Dùng người mẫu AI ${name}` })).toBeVisible();

  // Closing the picker mid-run still saves the model, says so in a note, and leaves the slot empty.
  await create.click();
  await expect(run).toBeEnabled();
  await run.click();
  await page.keyboard.press('Escape');
  await expect(form).toBeHidden();
  const second = 'Nữ · 26-40 tuổi · Việt Nam / Đông Nam Á';
  await expect(page.getByRole('region', { name: 'Thông báo' }).getByText(`Đã lưu người mẫu ${second} vào Người mẫu AI`)).toBeVisible({ timeout: 90_000 });
  await expect(page.getByRole('list', { name: 'Người mẫu: ảnh đã chọn' })).toHaveCount(0);
  const both = (await (await page.request.get('/api/fashion-models')).json()) as { models: { name: string }[] };
  expect(both.models.map((m) => m.name).sort()).toEqual([name, second].sort());
});
