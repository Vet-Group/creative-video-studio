import { expect, type Page, test } from '@playwright/test';
import { listingShotPrompt, recolorPrompt } from '../src/lib/apps';
import { modelButton, png, signIn } from './support.test';

// Product recolor and the listing set: one product photo in, one job per colour or shot picked, each with the prompt its item makes,
// all of one Run sharing one batch id, which History's select-the-batch button and Reuse read back.
const runButton = (page: Page) => page.getByRole('button', { name: /^Chạy(?! lại)/ }); // not a History card's rerun button
const reason = (page: Page) => page.locator('.form-message').getByRole('status');
const cost = (page: Page) => page.getByRole('status').filter({ hasText: 'ảnh ×' });
const preview = (page: Page) => page.getByRole('group', { name: 'Bản cuối gửi cho mô hình' });
const slot = (page: Page) => page.getByRole('group', { name: 'Sản phẩm', exact: true });
const toast = (page: Page, text: string) => page.getByRole('region', { name: 'Thông báo' }).getByText(text);
const pickModel = async (page: Page, name: RegExp) => {
  await modelButton(page).click();
  await page.getByRole('option', { name }).click();
  await expect(modelButton(page)).toContainText(name);
};
const openApp = async (page: Page, name: string, slug: string) => {
  await page.goto('/apps');
  await page.getByRole('list', { name: 'Danh sách ứng dụng' }).getByRole('link').filter({ hasText: name }).click();
  await expect(page).toHaveURL(new RegExp(`/apps/${slug}$`));
};
type Job = { id: string; feature: string; status: string; batch: string | null; color: string | null; shot: string | null };
const mine = async (page: Page, feature: string) => ((await (await page.request.get('/api/jobs?mine')).json()) as { jobs: Job[] }).jobs.filter((j) => j.feature === feature);
const detail = async (page: Page, id: string) => (await (await page.request.get(`/api/jobs/${id}`)).json()) as { prompt: string };
const sentJobs = (page: Page) => {
  const sent: { params: Record<string, string>; prompt: string; assetIds: string[] }[] = [];
  page.on('request', (r) => void (r.method() === 'POST' && new URL(r.url()).pathname === '/api/jobs' && sent.push(r.postDataJSON())));
  return sent;
};

test('product recolor: picks a swatch and an own colour code, sees the price of two pictures, runs one job per colour, reuses the batch and holds a Run to 15 colours', async ({ page }) => {
  await signIn(page, 'recolora');
  await openApp(page, 'Đổi màu sản phẩm', 'product-recolor');
  const colors = page.getByRole('group', { name: 'Màu cần tạo' });

  // Twelve swatches, none picked until the member picks one, as each costs a job; the art-less page still renders.
  await expect(colors.getByRole('checkbox')).toHaveCount(12);
  for (const box of await colors.getByRole('checkbox').all()) await expect(box).not.toBeChecked();
  await expect(reason(page)).toHaveText('Tải lên ảnh: Sản phẩm.');
  await page.getByLabel('Ảnh sản phẩm', { exact: true }).setInputFiles({ name: 'tee.png', mimeType: 'image/png', buffer: png() });
  await expect(slot(page).getByRole('img', { name: 'tee.png' })).toBeVisible();
  await expect(reason(page)).toHaveText('Chọn ít nhất một màu.');
  await expect(runButton(page)).toBeDisabled();

  // A swatch, then an own colour: a code that is not #RRGGBB is refused under the box, a good one (any case, # optional) becomes a picked chip.
  await pickModel(page, /Mock pets priced/);
  await colors.getByRole('checkbox', { name: 'Đen #111111' }).check();
  const hex = page.getByLabel('Màu riêng (tuỳ chọn)');
  await hex.fill('teal');
  await page.getByRole('button', { name: 'Thêm màu' }).click();
  await expect(page.getByText('Nhập mã màu dạng #RRGGBB, ví dụ #2E8B57.')).toBeVisible();
  await expect(hex).toHaveAttribute('aria-invalid', 'true');
  await hex.fill('2e8b57');
  await hex.press('Enter');
  await expect(colors.getByRole('checkbox', { name: 'Mã #2E8B57' })).toBeChecked();
  await expect(hex).toHaveValue('');
  await expect(cost(page)).toHaveText('2 ảnh × $0.15 = $0.30');
  await expect(runButton(page)).toContainText('$0.30');
  await expect(preview(page)).toContainText(`Đen: ${recolorPrompt('#111111')}`);
  await expect(page.getByText('1 màu còn lại dùng prompt như trên, chỉ khác tên và mã màu.')).toBeVisible();

  // The run on the mock model: one job per colour, in the order picked, each with its own prompt and one batch id.
  await pickModel(page, /Mock pets E2E/);
  const sent = sentJobs(page);
  await runButton(page).click();
  await expect(page.getByText('Đã gửi lượt tạo')).toBeVisible();
  const batch = sent[0]?.params.batch;
  expect(batch).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  expect(sent.map((b) => b.params)).toEqual([{ resolution: '1K', color: '#111111', batch }, { resolution: '1K', color: '#2E8B57', batch }]);
  for (const b of sent) expect(b.assetIds).toHaveLength(1);
  await expect.poll(async () => (await mine(page, 'product_recolor')).map((j) => [j.color, j.status]).sort(), { timeout: 90_000 }).toEqual([['#111111', 'succeeded'], ['#2E8B57', 'succeeded']]);
  const jobs = await mine(page, 'product_recolor');
  for (const job of jobs) expect((await detail(page, job.id)).prompt).toBe(recolorPrompt(job.color!));
  for (const title of ['Đen', 'Mã #2E8B57']) await expect(page.getByRole('heading', { name: `Đổi màu sản phẩm · ${title}`, level: 3 })).toBeVisible();

  // "Chọn cả lô" on one card picks both results for the .zip.
  const card = page.locator('.job-card').filter({ has: page.getByRole('heading', { name: 'Đổi màu sản phẩm · Đen' }) });
  await card.getByRole('button', { name: 'Chọn cả lô' }).click();
  await expect(page.getByRole('group', { name: 'Tải nhiều mục' })).toContainText('Đã chọn 2');

  // Reuse one card: the photo back in its slot, and the swatch and the own colour of its Run picked again.
  await page.goto(`/apps/product-recolor?reuse=${jobs.find((j) => j.color === '#2E8B57')!.id}`);
  await expect(slot(page).getByRole('img', { name: 'tee.png' })).toBeVisible();
  for (const name of ['Đen #111111', 'Mã #2E8B57']) await expect(colors.getByRole('checkbox', { name })).toBeChecked();
  await expect(colors.getByRole('checkbox', { name: 'Trắng #FFFFFF' })).not.toBeChecked();
  await expect(cost(page)).toContainText('2 ảnh ×');

  // At most 15 colours a Run: the other eleven swatches and two more codes fill it, a 16th is refused and stays out.
  for (const box of await colors.getByRole('checkbox').all()) if (!(await box.isChecked())) await box.check();
  for (const code of ['#000001', '#000002']) {
    await hex.fill(code);
    await page.getByRole('button', { name: 'Thêm màu' }).click();
  }
  await expect(colors.getByRole('checkbox')).toHaveCount(15);
  await expect(cost(page)).toContainText('15 ảnh ×');
  await hex.fill('#000003');
  await page.getByRole('button', { name: 'Thêm màu' }).click();
  await expect(toast(page, 'Tối đa 15 màu mỗi lần chạy')).toBeVisible();
  await expect(colors.getByRole('checkbox')).toHaveCount(15);
  // Unticking an own colour takes it off the list.
  await colors.getByRole('checkbox', { name: 'Mã #000002' }).click(); // not uncheck(): the chip goes, so there is no unticked box to see
  await expect(colors.getByRole('checkbox', { name: 'Mã #000002' })).toHaveCount(0);
  await expect(cost(page)).toContainText('14 ảnh ×');
});

test('listing set: picks a basic and a seasonal shot for a product photo, sees the price of two pictures, runs one job per shot, selects the batch and reuses it', async ({ page }) => {
  await signIn(page, 'listinga');
  await openApp(page, 'Bộ ảnh listing', 'listing-set');
  const basic = page.getByRole('group', { name: 'Cảnh cơ bản' });
  const seasonal = page.getByRole('group', { name: 'Cảnh theo mùa' });

  await expect(basic.getByRole('checkbox')).toHaveCount(10);
  await expect(seasonal.getByRole('checkbox')).toHaveCount(5);
  for (const box of [...(await basic.getByRole('checkbox').all()), ...(await seasonal.getByRole('checkbox').all())]) await expect(box).not.toBeChecked();
  await page.getByLabel('Ảnh sản phẩm', { exact: true }).setInputFiles({ name: 'mug.png', mimeType: 'image/png', buffer: png() });
  await expect(slot(page).getByRole('img', { name: 'mug.png' })).toBeVisible();
  await expect(reason(page)).toHaveText('Chọn ít nhất một cảnh.');

  // A priced model: one picture's price per shot, and the first shot's prompt.
  await pickModel(page, /Mock pets priced/);
  await basic.getByText('Nền trắng', { exact: true }).click();
  await seasonal.getByText('Giáng sinh', { exact: true }).click();
  await expect(cost(page)).toHaveText('2 ảnh × $0.15 = $0.30');
  await expect(preview(page)).toContainText(`Nền trắng: ${listingShotPrompt('white')}`);
  await expect(page.getByText('1 cảnh còn lại dùng prompt như trên, chỉ khác phần mô tả cảnh.')).toBeVisible();

  // The run on the mock model: one job per shot, in the list's order, each with its own prompt and one batch id.
  await pickModel(page, /Mock pets E2E/);
  const sent = sentJobs(page);
  await runButton(page).click();
  await expect(page.getByText('Đã gửi lượt tạo')).toBeVisible();
  const batch = sent[0]?.params.batch;
  expect(sent.map((b) => b.params)).toEqual([{ resolution: '1K', shot: 'white', batch }, { resolution: '1K', shot: 'christmas', batch }]);
  await expect.poll(async () => (await mine(page, 'listing_set')).map((j) => [j.shot, j.status]).sort(), { timeout: 90_000 }).toEqual([['christmas', 'succeeded'], ['white', 'succeeded']]);
  const jobs = await mine(page, 'listing_set');
  expect(new Set(jobs.map((j) => j.batch))).toEqual(new Set([batch]));
  for (const job of jobs) expect((await detail(page, job.id)).prompt).toBe(listingShotPrompt(job.shot!));
  for (const title of ['Nền trắng', 'Giáng sinh']) await expect(page.getByRole('heading', { name: `Bộ ảnh listing · ${title}`, level: 3 })).toBeVisible();

  const card = page.locator('.job-card').filter({ has: page.getByRole('heading', { name: 'Bộ ảnh listing · Giáng sinh' }) });
  await card.getByRole('button', { name: 'Chọn cả lô' }).click();
  await expect(page.getByRole('group', { name: 'Tải nhiều mục' })).toContainText('Đã chọn 2');

  // Reuse one card: the photo back and both shots of its Run picked again.
  await page.goto(`/apps/listing-set?reuse=${jobs.find((j) => j.shot === 'white')!.id}`);
  await expect(slot(page).getByRole('img', { name: 'mug.png' })).toBeVisible();
  await expect(basic.getByRole('checkbox', { name: 'Nền trắng' })).toBeChecked();
  await expect(seasonal.getByRole('checkbox', { name: 'Giáng sinh' })).toBeChecked();
  await expect(basic.getByRole('checkbox', { name: 'Gói quà' })).not.toBeChecked();
  await expect(cost(page)).toContainText('2 ảnh ×');
});
