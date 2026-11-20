import { expect, type Page, test } from '@playwright/test';
import { OWN_POSE, posePrompt } from '../src/lib/apps';
import { poseOf, POSES } from '../src/lib/try-on-stock';
import { gotoTryOn, jpg, openTab, pickModel, png, settled, signIn } from './support.test';

// The pose generator: one model photo in, one job per pose picked (a pose of Try On's list, or the member's own words), up to four, each with the prompt its pose
// makes and all of one Run sharing one batch id; and the shortcut to it on an AI model's and a Try On's result.
const runButton = (page: Page) => page.getByRole('button', { name: /^Chạy(?! lại)/ }); // not a History card's rerun button
const reason = (page: Page) => page.locator('.form-message').getByRole('status');
const cost = (page: Page) => page.getByRole('status').filter({ hasText: 'ảnh ×' });
const preview = (page: Page) => page.getByRole('group', { name: 'Bản cuối gửi cho mô hình' });
const poses = (page: Page) => page.getByRole('group', { name: 'Tư thế cần tạo' });
const count = (page: Page) => page.locator('.pick-count');
const slot = (page: Page) => page.getByRole('group', { name: 'Người mẫu', exact: true });
const toast = (page: Page, text: string) => page.getByRole('region', { name: 'Thông báo' }).getByText(text);
type Job = { id: string; feature: string; status: string; batch: string | null; pose: string | null; poseText: string | null };
const mine = async (page: Page) => ((await (await page.request.get('/api/jobs?mine')).json()) as { jobs: Job[] }).jobs.filter((j) => j.feature === 'pose_generator');

test('picks a model photo, two library poses and own words, sees the price of three images, refuses a fifth pose, runs one job per pose and titles each card by its pose', async ({ page }) => {
  // One pose picture of a man's, so the pictures show and the gender switch has something to switch.
  const sample = 'try-on-pose-man-kneel.jpg';
  const asAdmin = async (send: () => Promise<{ ok(): boolean }>) => {
    await page.context().clearCookies();
    await signIn(page, 'admin');
    await settled(send, sample);
    await page.context().clearCookies();
  };
  await asAdmin(() => page.request.put(`/api/admin/samples/${sample}`, { data: jpg(), headers: { 'content-type': 'image/jpeg' } }));
  try {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await signIn(page, 'posea');
    await page.goto('/apps');
    await page.getByRole('list', { name: 'Danh sách ứng dụng' }).getByRole('link').filter({ hasText: 'Tạo tư thế người mẫu' }).click();
    await expect(page).toHaveURL(/\/apps\/pose-generator$/);

    // The slot says what photo it wants; every pose is a tile, none picked until the member picks one, as each costs a job.
    await expect(page.getByRole('button', { name: 'Tải lên Người mẫu' })).toHaveAttribute('title', 'Ảnh người mẫu (rõ mặt, thấy người)');
    await expect(poses(page).getByRole('button')).toHaveCount(POSES.length);
    for (const tile of await poses(page).getByRole('button').all()) await expect(tile).toHaveAttribute('aria-pressed', 'false');
    await expect(reason(page)).toHaveText('Tải lên ảnh: Người mẫu.');
    await page.getByLabel('Ảnh người mẫu', { exact: true }).setInputFiles({ name: 'model.png', mimeType: 'image/png', buffer: png() });
    await expect(slot(page).getByRole('img', { name: 'model.png' })).toBeVisible();
    await expect(reason(page)).toHaveText('Chọn ít nhất một tư thế, hoặc tự tả một tư thế.');
    await expect(runButton(page)).toBeDisabled();
    await expect(cost(page)).toHaveCount(0); // no price while nothing is picked

    // An own photo says no gender, so the pictures are of the one that has them (his kneel); Nữ shows that pose by its name, as Try On does without a picture.
    const kneel = poses(page).getByRole('button', { name: 'Quỳ một gối', exact: true });
    await expect(page.getByRole('radio', { name: 'Nam', exact: true })).toBeChecked();
    await expect(kneel.locator('img')).toHaveAttribute('src', `/api/samples/${sample}?thumb=1`);
    await expect(kneel.locator('.photo-caption')).toHaveText('Quỳ một gối');
    await page.getByRole('radio', { name: 'Nữ', exact: true }).check();
    await expect(kneel).toHaveClass('photo-name');
    await expect(kneel).toHaveText('Quỳ một gối');

    // A priced model: two library poses and the own words are three images at one price each.
    await pickModel(page, /Mock pets priced/);
    await poses(page).getByRole('button', { name: 'Mặt trước', exact: true }).click();
    await kneel.click();
    await expect(kneel).toHaveAttribute('aria-pressed', 'true');
    await page.getByLabel(OWN_POSE).fill('  ngồi trên bậc thềm,  tay chống cằm ');
    await expect(count(page)).toContainText('3/4 đã chọn');
    await expect(cost(page)).toHaveText('3 ảnh × $0.15 = $0.45');
    await expect(runButton(page)).toContainText('$0.45');
    await expect(preview(page)).toContainText(`Mặt trước: ${posePrompt(poseOf('front')!.words)}`);
    await expect(page.getByText('2 tư thế còn lại dùng prompt như trên, chỉ khác phần mô tả tư thế.')).toBeVisible();

    // A fourth pose fills the Run; a fifth is refused and stays unpicked.
    await poses(page).getByRole('button', { name: 'Xoay 3/4', exact: true }).click();
    await expect(count(page)).toContainText('4/4 đã chọn');
    await poses(page).getByRole('button', { name: 'Quay lưng', exact: true }).click();
    await expect(toast(page, 'Tối đa 4 tư thế mỗi lần chạy')).toBeVisible();
    await expect(poses(page).getByRole('button', { name: 'Quay lưng', exact: true })).toHaveAttribute('aria-pressed', 'false');
    await expect(cost(page)).toHaveText('4 ảnh × $0.15 = $0.60');
    // Bỏ chọn hết unticks the library poses and keeps the own words, which still count as one.
    await page.getByRole('button', { name: 'Bỏ chọn hết' }).click();
    await expect(count(page)).toHaveText('1/4 đã chọn');
    for (const tile of await poses(page).getByRole('button').all()) await expect(tile).toHaveAttribute('aria-pressed', 'false');
    for (const name of ['Mặt trước', 'Quỳ một gối']) await poses(page).getByRole('button', { name, exact: true }).click();

    // The run on the mock model: one job per pose, in the list's order and the own words last, cleaned, each with its own prompt and one batch id.
    await pickModel(page, /Mock pets E2E/);
    const sent: { params: Record<string, string>; prompt: string; assetIds: string[] }[] = [];
    page.on('request', (r) => void (r.method() === 'POST' && new URL(r.url()).pathname === '/api/jobs' && sent.push(r.postDataJSON())));
    await runButton(page).click();
    await expect(page.getByText('Đã gửi lượt tạo')).toBeVisible();
    const own = 'ngồi trên bậc thềm, tay chống cằm';
    const batch = sent[0]?.params.batch;
    expect(batch).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(sent.map((b) => b.params)).toEqual([{ resolution: '1K', pose: 'front', batch }, { resolution: '1K', pose: 'kneel', batch }, { resolution: '1K', poseText: own, batch }]);
    expect(sent.map((b) => b.prompt)).toEqual([posePrompt(poseOf('front')!.words), posePrompt(poseOf('kneel')!.words), posePrompt(own)]);
    for (const b of sent) expect(b.assetIds).toHaveLength(1);
    await expect.poll(async () => (await mine(page)).map((j) => [j.pose, j.poseText, j.status]).sort(), { timeout: 90_000 }).toEqual([
      [null, own, 'succeeded'], ['front', null, 'succeeded'], ['kneel', null, 'succeeded'],
    ]);
    for (const title of ['Mặt trước', 'Quỳ một gối', OWN_POSE]) await expect(page.getByRole('heading', { name: `Tạo tư thế · ${title}`, level: 3 })).toBeVisible();

    // Reuse one card: the photo back in its slot, and the two poses and the own words of its Run picked again.
    const jobs = await mine(page);
    await page.goto(`/apps/pose-generator?reuse=${jobs.find((j) => j.pose === 'kneel')!.id}`);
    await expect(slot(page).getByRole('img', { name: 'model.png' })).toBeVisible();
    for (const name of ['Mặt trước', 'Quỳ một gối']) await expect(poses(page).getByRole('button', { name, exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByLabel(OWN_POSE)).toHaveValue(own);
    await expect(cost(page)).toContainText('3 ảnh ×');
  } finally {
    await asAdmin(() => page.request.delete(`/api/admin/samples/${sample}`));
  }
});

test('Đổi tư thế on an AI model result and on a Try On result opens the pose generator with that picture in its slot', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signIn(page, 'poseb');
  const card = (title: string) => page.locator('li.job-card').filter({ has: page.getByRole('heading', { name: title, level: 3 }) });
  const opened = async () => {
    await expect(page).toHaveURL(/\/apps\/pose-generator\?image=[\w-]+$/);
    await expect(slot(page).getByRole('img', { name: /^history-\w{8}\.(png|jpg|webp)$/ })).toBeVisible(); // the result, copied as the member's own input
    await expect(poses(page)).toBeVisible();
  };

  // An AI model the generator made.
  await page.goto('/apps/ai-fashion-model');
  await expect(runButton(page)).toBeEnabled();
  await runButton(page).click();
  await openTab(page, 'Lịch sử');
  const model = card('Tạo người mẫu AI');
  await expect(model.getByRole('button', { name: 'Đổi tư thế' })).toBeVisible({ timeout: 90_000 });
  await model.getByRole('button', { name: 'Đổi tư thế' }).click();
  await opened();

  // A Try On result.
  await gotoTryOn(page);
  await page.getByLabel('Ảnh trang phục').setInputFiles({ name: 'garment.png', mimeType: 'image/png', buffer: png() });
  await page.getByLabel('Ảnh người mẫu', { exact: true }).setInputFiles({ name: 'person.png', mimeType: 'image/png', buffer: png() });
  await page.getByRole('button', { name: /^Thử đồ/ }).click();
  await expect(page.getByText('Đã gửi lượt tạo')).toBeVisible();
  const tried = card('Thử đồ');
  await expect(tried.getByRole('button', { name: 'Đổi tư thế' })).toBeVisible({ timeout: 90_000 });
  await tried.getByRole('button', { name: 'Đổi tư thế' }).click();
  await opened();
});
