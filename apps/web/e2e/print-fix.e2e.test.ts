import { expect, type Page, test } from '@playwright/test';
import sharp from 'sharp';
import { basePrompt } from '../src/lib/prompt-limit';
import { openTab, png, runViaApi, signIn } from './support.test';

// The print fix on the mock model of e2e/serve.ts: the photo to fix and the design file in, one picture out; and its button on a History picture and on a clip's first frame,
// which copies that picture into the member's own input and opens the app with it in the first slot.
const runButton = (page: Page) => page.getByRole('button', { name: /^Chạy(?! lại)/ }); // not a History card's rerun button
const reason = (page: Page) => page.locator('.form-message').getByRole('status');
const history = (page: Page) => page.getByRole('complementary', { name: 'Lượt tạo của tôi' });
const photoSlot = (page: Page) => page.getByRole('group', { name: 'Ảnh cần sửa', exact: true });
type Job = { id: string; feature: string; status: string; outputAssetId: string | null };
const mine = async (page: Page, feature: string) => ((await (await page.request.get('/api/jobs?mine')).json()) as { jobs: Job[] }).jobs.filter((j) => j.feature === feature);
const succeeded = (page: Page, feature: string, count = 1) => expect.poll(async () => (await mine(page, feature)).filter((j) => j.status === 'succeeded').length, { timeout: 90_000 }).toBe(count);

test('print fix: both slots, Run waits for the photo and then the design, and a Run sends the photo first, the design second and the note after the fixed instruction', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signIn(page, 'printa');
  await page.goto('/apps');
  await page.getByRole('list', { name: 'Danh sách ứng dụng' }).getByRole('link').filter({ hasText: 'Sửa lại hình in' }).click();
  await expect(page).toHaveURL(/\/apps\/print-fix$/);

  // The form before any upload: two slots, the optional note, no Examples tab yet; the page renders without card art.
  await expect(page.getByRole('tab')).toHaveText(['Lịch sử', 'Giới thiệu']);
  await expect(photoSlot(page)).toBeVisible();
  await expect(page.getByRole('group', { name: 'File design gốc', exact: true })).toBeVisible();
  await expect(reason(page)).toHaveText('Tải lên ảnh: Ảnh cần sửa.');
  await expect(runButton(page)).toBeDisabled();

  await page.getByLabel('Ảnh cần sửa hình in', { exact: true }).setInputFiles({ name: 'tee.png', mimeType: 'image/png', buffer: png() });
  await expect(photoSlot(page).getByRole('img', { name: 'tee.png' })).toBeVisible();
  await expect(reason(page)).toHaveText('Tải lên ảnh: File design gốc.');
  await expect(runButton(page)).toBeDisabled();

  // A transparent PNG design, as sellers keep their print files.
  const design = await sharp({ create: { width: 64, height: 64, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite([{ input: await sharp({ create: { width: 32, height: 32, channels: 4, background: '#c8102e' } }).png().toBuffer(), left: 16, top: 16 }]).png().toBuffer();
  await page.getByLabel('Ảnh design gốc', { exact: true }).setInputFiles({ name: 'design.png', mimeType: 'image/png', buffer: design });
  await expect(page.getByRole('group', { name: 'File design gốc', exact: true }).getByRole('img', { name: 'design.png' })).toBeVisible();
  await expect(reason(page)).toHaveCount(0);
  await expect(runButton(page)).toBeEnabled();

  const note = 'hình in ở lưng áo';
  await expect(page.getByLabel('Mô tả (tuỳ chọn)')).toHaveAttribute('placeholder', 'Ví dụ: hình in ở lưng áo, hoặc chỉ sửa dòng chữ trên ngực');
  await page.getByLabel('Mô tả (tuỳ chọn)').fill(note);
  const sent = page.waitForRequest((r) => r.method() === 'POST' && new URL(r.url()).pathname === '/api/jobs');
  await runButton(page).click();
  const body = (await sent).postDataJSON() as { feature: string; assetIds: string[]; prompt: string; ratio: string; params: Record<string, string> };
  expect([body.feature, body.assetIds.length, body.prompt, body.ratio, body.params]).toEqual(['print_fix', 2, note, 'auto', { resolution: '1K', brief: note }]);
  await succeeded(page, 'print_fix');
  const [job] = await mine(page, 'print_fix');
  const detail = (await (await page.request.get(`/api/jobs/${job!.id}`)).json()) as { prompt: string; inputIds: string[]; images: { id: string; filename: string }[] };
  expect(detail.prompt).toBe(basePrompt('print_fix', note));
  expect(detail.inputIds.map((id) => detail.images.find((i) => i.id === id)?.filename)).toEqual(['tee.png', 'design.png']); // the photo first, then the design

  // Its result offers the way to remake the clip from the fixed picture, and no print fix of its own.
  const card = history(page).locator('li.job-card').first();
  await expect(card.getByRole('link', { name: 'Tạo video' })).toHaveAttribute('href', `/create?image=${job!.outputAssetId}`);
  await expect(card.getByRole('button', { name: 'Sửa lại hình in' })).toHaveCount(0);
});

test('Sửa lại hình in on a History picture opens the print fix with that picture in its first slot, and on a clip with its first frame', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signIn(page, 'printb');
  const up = await page.request.post('/api/assets', { multipart: { file: { name: 'tee.png', mimeType: 'image/png', buffer: png() } } });
  const [asset] = ((await up.json()) as { assets: { id: string }[] }).assets;
  const res = await page.request.post('/api/jobs', { data: { feature: 'reframe', modelId: 'mock-apps-e2e', assetIds: [asset!.id], ratio: '1:1', params: { resolution: '1K' } } });
  expect(res.status()).toBe(201);
  await succeeded(page, 'reframe');

  // A picture: the result is copied into a new input of the member's, already in the photo slot, and only the design is left to add.
  await page.goto('/apps/reframe');
  await openTab(page, 'Lịch sử');
  await history(page).locator('li.job-card').first().getByRole('button', { name: 'Sửa lại hình in' }).click();
  await expect(page).toHaveURL(/\/apps\/print-fix\?image=[\w-]+$/);
  await expect(photoSlot(page).getByRole('img', { name: /^history-\w{8}\.(png|jpg|webp)$/ })).toBeVisible();
  await expect(reason(page)).toHaveText('Tải lên ảnh: File design gốc.');

  // A clip: its first frame, the poster the worker cut, goes in the photo slot as a JPEG.
  await runViaApi(page);
  await succeeded(page, 'video');
  await page.goto('/create');
  await openTab(page, 'Lịch sử');
  await history(page).locator('li.job-card').first().getByRole('button', { name: 'Sửa lại hình in' }).click();
  await expect(page).toHaveURL(/\/apps\/print-fix\?image=[\w-]+$/);
  await expect(photoSlot(page).getByRole('img', { name: /^history-\w{8}\.jpg$/ })).toBeVisible();
});
