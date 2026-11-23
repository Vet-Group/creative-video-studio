import { readFile } from 'node:fs/promises';
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
const background = (page: Page, name: string) => page.getByRole('radiogroup', { name: 'Nền', exact: true }).getByRole('radio', { name, exact: true });
const chip = (page: Page, name: string) => page.getByRole('group', { name: 'Chọn nhanh theo sàn' }).getByRole('button', { name, exact: true });
const slot = (page: Page) => page.getByRole('group', { name: 'Người mẫu', exact: true });
const toast = (page: Page, text: string) => page.getByRole('region', { name: 'Thông báo' }).getByText(text);
type Job = { id: string; outputAssetId: string | null; feature: string; status: string; batch: string | null; pose: string | null; poseText: string | null };
const mine = async (page: Page) => ((await (await page.request.get('/api/jobs?mine')).json()) as { jobs: Job[] }).jobs.filter((j) => j.feature === 'pose_generator');

test('picks a model photo, two library poses and own words, sees the price of three images, refuses a fifth pose, runs one job per pose and titles each card by its pose', async ({ page }) => {
  // One pose picture of a man's, so the pictures show and the gender switch has something to switch, and the company model's result in that pose.
  const sample = 'try-on-pose-man-kneel.jpg';
  const result = 'pose-result-man-kneel.jpg';
  const asAdmin = async (send: (name: string) => Promise<{ ok(): boolean }>) => {
    await page.context().clearCookies();
    await signIn(page, 'admin');
    for (const name of [sample, result]) await settled(() => send(name), name);
    await page.context().clearCookies();
  };
  await asAdmin((name) => page.request.put(`/api/admin/samples/${name}`, { data: jpg(), headers: { 'content-type': 'image/jpeg' } }));
  try {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await signIn(page, 'posea');
    await page.goto('/apps');
    await page.getByRole('list', { name: 'Danh sách ứng dụng' }).getByRole('link').filter({ hasText: 'Tạo tư thế người mẫu' }).click();
    await expect(page).toHaveURL(/\/apps\/pose-generator$/);
    await expect(page.getByRole('tab')).toHaveText(['Lịch sử', 'Ví dụ', 'Giới thiệu']); // the company's poses as examples

    // The slot says what photo it wants; every pose is a tile, none picked until the member picks one, as each costs a job.
    await expect(page.getByRole('button', { name: 'Tải lên Người mẫu' })).toHaveAttribute('title', 'Ảnh người mẫu (rõ mặt, thấy người)');
    await expect(poses(page).getByRole('button')).toHaveCount(POSES.length);
    for (const tile of await poses(page).getByRole('button').all()) await expect(tile).toHaveAttribute('aria-pressed', 'false');
    await expect(reason(page)).toHaveText('Tải lên ảnh: Người mẫu.');
    await page.getByLabel('Ảnh người mẫu', { exact: true }).setInputFiles({ name: 'model.png', mimeType: 'image/png', buffer: png() });
    await expect(slot(page).getByRole('img', { name: 'model.png' })).toBeVisible();
    // The one photo fills its slot whole, as Marketing Studio's do, not a 56 px thumbnail under a name chip cut to "N…" (the label above names it).
    expect((await slot(page).getByRole('img', { name: 'model.png' }).boundingBox())!.height).toBeGreaterThan(180);
    await expect(slot(page).locator('.slot-chip')).toBeHidden();
    await expect(reason(page)).toHaveText('Chọn ít nhất một tư thế, hoặc tự tả một tư thế.');
    await expect(runButton(page)).toBeDisabled();
    await expect(cost(page)).toHaveCount(0); // no price while nothing is picked
    await expect(background(page, 'Giữ nền gốc')).toBeChecked(); // the photo's own background until the member picks another
    for (const name of ['Amazon', 'Etsy', 'Shopify']) await expect(chip(page, name)).toHaveAttribute('aria-pressed', 'false');

    // An own photo says no gender, so the pictures are of the one that has them (his kneel); Nữ shows that pose by its name, as Try On does without a picture.
    const kneel = poses(page).getByRole('button', { name: 'Quỳ một gối', exact: true });
    await expect(page.getByRole('radio', { name: 'Nam', exact: true })).toBeChecked();
    await expect(kneel.locator('img')).toHaveAttribute('src', `/api/samples/${sample}?thumb=1`);
    await expect(kneel.locator('.photo-caption')).toHaveText('Quỳ một gối');
    // Picked, it previews the company model's result in that pose; unpicked, the pose picture again.
    await kneel.click();
    await expect(kneel.locator('img')).toHaveAttribute('src', `/api/samples/${result}?thumb=1`);
    await expect(kneel.locator('.photo-caption')).toHaveText('Quỳ một gối');
    await kneel.click();
    await expect(kneel).toHaveAttribute('aria-pressed', 'false');
    await expect(kneel.locator('img')).toHaveAttribute('src', `/api/samples/${sample}?thumb=1`);
    // Three tiles a row in the form column, also once a pose has its picture.
    const rows = await Promise.all([0, 1, 2].map(async (i) => (await poses(page).getByRole('button').nth(i).boundingBox())!.y));
    expect(rows).toEqual([rows[0], rows[0], rows[0]]);
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
    // A marketplace preset replaces the picks and sets the background. With the own words filled they take a slot, so only the preset's first three poses come.
    await chip(page, 'Amazon').click();
    await expect(poses(page).getByRole('button', { pressed: true })).toHaveText(['Mặt trước', 'Quay lưng', 'Nghiêng một bên']);
    await expect(poses(page).getByRole('button', { name: 'Xoay 3/4', exact: true })).toHaveAttribute('aria-pressed', 'false');
    await expect(count(page)).toContainText('4/4 đã chọn');
    await expect(chip(page, 'Amazon')).toHaveAttribute('aria-pressed', 'true');
    await expect(background(page, 'Studio trắng')).toBeChecked();
    // Without them all four, Amazon's own: front, back, side and 3/4 views, on white.
    await page.getByLabel(OWN_POSE).fill('');
    await expect(chip(page, 'Amazon')).toHaveAttribute('aria-pressed', 'false'); // the preset is four poses now, the picks three
    await chip(page, 'Amazon').click();
    await expect(poses(page).getByRole('button', { pressed: true })).toHaveText(['Mặt trước', 'Xoay 3/4', 'Quay lưng', 'Nghiêng một bên']);
    await expect(count(page)).toHaveText('4/4 đã chọn · Bỏ chọn hết');
    await expect(chip(page, 'Amazon')).toHaveAttribute('aria-pressed', 'true');
    for (const name of ['Etsy', 'Shopify']) await expect(chip(page, name)).toHaveAttribute('aria-pressed', 'false');
    await expect(background(page, 'Studio trắng')).toBeChecked();
    // One tile changed, or the background, and it no longer is the preset.
    await poses(page).getByRole('button', { name: 'Quay lưng', exact: true }).click();
    await expect(chip(page, 'Amazon')).toHaveAttribute('aria-pressed', 'false');
    await chip(page, 'Etsy').click();
    await expect(poses(page).getByRole('button', { pressed: true })).toHaveText(['Mặt trước', 'Tay chống hông', 'Xoay 3/4', 'Sải bước']);
    await expect(background(page, 'Lifestyle')).toBeChecked();
    await expect(chip(page, 'Etsy')).toHaveAttribute('aria-pressed', 'true');
    await background(page, 'Giữ nền gốc').check();
    await expect(chip(page, 'Etsy')).toHaveAttribute('aria-pressed', 'false');
    await chip(page, 'Shopify').click();
    await expect(poses(page).getByRole('button', { pressed: true })).toHaveText(['Mặt trước', 'Xoay 3/4', 'Quay lưng', 'Sải bước']);
    await expect(background(page, 'Studio trắng')).toBeChecked();
    // A pressed chip is a toggle: pressed again it clears the picks and puts the photo's own background back.
    await chip(page, 'Shopify').click();
    await expect(chip(page, 'Shopify')).toHaveAttribute('aria-pressed', 'false');
    await expect(poses(page).getByRole('button', { pressed: true })).toHaveCount(0);
    await expect(background(page, 'Giữ nền gốc')).toBeChecked();
    // Back to the form the rest of the test goes on with: the own words only, on the photo's background.
    await page.getByLabel(OWN_POSE).fill('  ngồi trên bậc thềm,  tay chống cằm ');
    await expect(count(page)).toHaveText('1/4 đã chọn');
    // Keys 1 to 9 toggle the first nine poses while one has focus.
    const second = poses(page).getByRole('button').nth(1);
    await poses(page).getByRole('button').first().focus();
    await page.keyboard.press('2');
    await expect(second).toHaveAttribute('aria-pressed', 'true');
    await expect(count(page)).toHaveText('2/4 đã chọn · Bỏ chọn hết');
    await page.keyboard.press('2');
    await expect(second).toHaveAttribute('aria-pressed', 'false');
    for (const name of ['Mặt trước', 'Quỳ một gối']) await poses(page).getByRole('button', { name, exact: true }).click();
    await background(page, 'Studio trắng').check(); // the Run's jobs all carry it, and the prompt shown is theirs
    await expect(preview(page)).toContainText(`Mặt trước: ${posePrompt(poseOf('front')!.words, 'white')}`);

    // The run on the mock model: one job per pose, in the list's order and the own words last, cleaned, each with its own prompt and one batch id.
    await pickModel(page, /Mock pets E2E/);
    const sent: { params: Record<string, string>; prompt: string; assetIds: string[] }[] = [];
    page.on('request', (r) => void (r.method() === 'POST' && new URL(r.url()).pathname === '/api/jobs' && sent.push(r.postDataJSON())));
    await runButton(page).click();
    await expect(page.getByText('Đã gửi lượt tạo')).toBeVisible();
    const own = 'ngồi trên bậc thềm, tay chống cằm';
    const batch = sent[0]?.params.batch;
    expect(batch).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(sent.map((b) => b.params)).toEqual([{ resolution: '1K', pose: 'front', background: 'white', batch }, { resolution: '1K', pose: 'kneel', background: 'white', batch }, { resolution: '1K', poseText: own, background: 'white', batch }]);
    expect(sent.map((b) => b.prompt)).toEqual([posePrompt(poseOf('front')!.words, 'white'), posePrompt(poseOf('kneel')!.words, 'white'), posePrompt(own, 'white')]);
    for (const b of sent) expect(b.assetIds).toHaveLength(1);
    await expect.poll(async () => (await mine(page)).map((j) => [j.pose, j.poseText, j.status]).sort(), { timeout: 90_000 }).toEqual([
      [null, own, 'succeeded'], ['front', null, 'succeeded'], ['kneel', null, 'succeeded'],
    ]);
    for (const title of ['Mặt trước', 'Quỳ một gối', OWN_POSE]) await expect(page.getByRole('heading', { name: `Tạo tư thế · ${title}`, level: 3 })).toBeVisible();

    // History lays the Run's pictures out as one lookbook, two per row, saved as a JPEG; a single picture is not a lookbook.
    const card = page.locator('.job-card').filter({ has: page.getByRole('heading', { name: 'Tạo tư thế · Mặt trước' }) });
    await card.getByRole('button', { name: 'Chọn cả lô' }).click();
    await expect(page.getByRole('group', { name: 'Tải nhiều mục' })).toContainText('Đã chọn 3');
    const saved = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Ghép lookbook' }).click();
    const lookbook = await saved;
    expect(lookbook.suggestedFilename()).toBe('lookbook.jpg');
    const bytes = await readFile((await lookbook.path())!);
    expect([...bytes.subarray(0, 3)]).toEqual([0xff, 0xd8, 0xff]);
    // Under a typed title, "Tải PDF" saves the same grid as one A4 page.
    await page.getByLabel('Tiêu đề lookbook').fill('Bộ sưu tập Thu Đông');
    const savedPdf = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Tải PDF' }).click();
    const pdf = await savedPdf;
    expect(pdf.suggestedFilename()).toBe('lookbook.pdf');
    expect((await readFile((await pdf.path())!)).subarray(0, 5).toString('latin1')).toBe('%PDF-');
    for (const title of [OWN_POSE, 'Quỳ một gối']) await page.getByRole('checkbox', { name: new RegExp(`^Chọn Tạo tư thế · ${title} `) }).uncheck();
    await page.getByRole('button', { name: 'Ghép lookbook' }).click();
    await expect(toast(page, 'Chọn 2 đến 4 ảnh để ghép lookbook.')).toBeVisible();

    // Exactly two pictures also start a video: the first picked is the start frame, the second the end frame. The form opens with both and waits for Run.
    const made = await mine(page);
    const startJob = made.find((j) => j.pose === 'front')!;
    const endJob = made.find((j) => j.pose === 'kneel')!;
    await expect(page.getByRole('link', { name: 'Tạo video từ 2 ảnh' })).toHaveCount(0); // one picked
    for (const title of ['Mặt trước', OWN_POSE, 'Quỳ một gối']) await page.getByRole('checkbox', { name: new RegExp(`^Chọn Tạo tư thế · ${title} `) }).uncheck();
    for (const title of ['Mặt trước', 'Quỳ một gối']) await page.getByRole('checkbox', { name: new RegExp(`^Chọn Tạo tư thế · ${title} `) }).check();
    // On a phone each control of the select bar is drawn 44 px tall: the bar wraps into rows, so a wider hit area would reach into the next one.
    const wide = page.viewportSize()!;
    await page.setViewportSize({ width: 390, height: 844 });
    const barControls = page.locator('.zip-tools').locator('button, a, input');
    await expect(barControls).toHaveCount(6); // Chọn, Tải xuống .zip, Ghép lookbook, the title, Tải PDF, Tạo video từ 2 ảnh
    for (const control of await barControls.all()) expect((await control.boundingBox())!.height, (await control.getAttribute('aria-label')) ?? (await control.textContent())!).toBeGreaterThanOrEqual(44);
    await page.setViewportSize(wide);
    // The mock model takes no end frame, so the models answer lists one that does, which the form must move to.
    await page.route('**/api/models?*', async (route) => {
      const res = await route.fetch();
      const json = (await res.json()) as { models: Record<string, unknown>[] };
      json.models.push({ ...json.models.find((m) => m.id === 'mock-e2e')!, id: 'mock-end', label: 'Mock End Frame', pairIds: [], recommended: false, endFrame: true });
      await route.fulfill({ response: res, json });
    });
    await page.getByRole('link', { name: 'Tạo video từ 2 ảnh' }).click();
    await expect(page).toHaveURL(new RegExp(`/create\\?image=${startJob.outputAssetId}&end=${endJob.outputAssetId}$`));
    const path = page.getByRole('figure', { name: 'Đầu → Cuối' });
    await expect(path.getByRole('img', { name: 'Ảnh đầu' })).toBeVisible();
    await expect(path.getByRole('img', { name: 'Khung hình cuối' })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Mô hình / })).toContainText('Mock End Frame');
    await page.unrouteAll({ behavior: 'ignoreErrors' }); // not Run: a paid clip is never made from a test

    // Reuse one card: the photo back in its slot, and the two poses and the own words of its Run picked again.
    const jobs = made;
    await page.goto(`/apps/pose-generator?reuse=${jobs.find((j) => j.pose === 'kneel')!.id}`);
    await expect(slot(page).getByRole('img', { name: 'model.png' })).toBeVisible();
    for (const name of ['Mặt trước', 'Quỳ một gối']) await expect(poses(page).getByRole('button', { name, exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByLabel(OWN_POSE)).toHaveValue(own);
    await expect(background(page, 'Studio trắng')).toBeChecked();
    await expect(cost(page)).toContainText('3 ảnh ×');
    // A job from before the background existed comes back on the photo's own: the same job, served without one.
    await page.route(/\/api\/jobs\/[\w-]+$/, async (route) => {
      const res = await route.fetch();
      await route.fulfill({ response: res, json: { ...(await res.json()), background: null } });
    });
    await page.goto(`/apps/pose-generator?reuse=${jobs.find((j) => j.pose === 'kneel')!.id}`);
    await expect(poses(page).getByRole('button', { name: 'Quỳ một gối', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(background(page, 'Giữ nền gốc')).toBeChecked();
  } finally {
    await asAdmin((name) => page.request.delete(`/api/admin/samples/${name}`));
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
