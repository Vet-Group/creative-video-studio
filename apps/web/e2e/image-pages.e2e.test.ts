import { expect, type Locator, type Page, test } from '@playwright/test';
import { jpg, modelButton, optionsOf, png, select, signIn } from './support.test';

const nav = (page: Page) => page.getByRole('navigation', { name: 'Điều hướng chính' });
const file = (name: string) => ({ name, mimeType: 'image/png', buffer: png() });
const box = async (loc: Locator) => (await loc.boundingBox())!;
const near = (actual: number, expected: number, what: string, tol = 2) => expect(Math.abs(actual - expected), `${what}: ${actual}, expected ${expected} within ${tol}`).toBeLessThanOrEqual(tol);
const toast = (page: Page, text: string) => page.getByRole('region', { name: 'Thông báo' }).getByText(text);

/** Opens the Library and shows one chip's items. */
async function libraryChip(page: Page, chip: string): Promise<void> {
  await nav(page).getByRole('link', { name: 'Thư viện' }).click();
  await page.getByRole('group', { name: 'Loại' }).getByRole('button', { name: chip, exact: true }).click();
  await expect(page.getByRole('group', { name: 'Loại' }).getByRole('button', { name: chip, exact: true })).toHaveAttribute('aria-pressed', 'true');
}

test('Try On takes 5 garments, as Fash does with Nano Banana Pro, when the model takes that many photos', async ({ page }) => {
  // Nano Banana Pro takes 14 photos (fal, read 2026-10-29); the mock model is shown with that limit, and nothing is run.
  await page.route(/\/api\/image-models\?/, async (r) => {
    const res = await r.fetch();
    const json = (await res.json()) as { models: { maxImages: number }[] };
    return r.fulfill({ json: { ...json, models: json.models.map((m) => ({ ...m, maxImages: 14 })) } });
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signIn(page, 'member9');
  await page.goto('/try-on');
  await expect(modelButton(page)).toContainText('Mock image E2E');
  await expect(page.getByText('Thêm 1 đến 5 ảnh trang phục')).toBeVisible();
  await page.getByLabel('Ảnh trang phục').setInputFiles([1, 2, 3, 4, 5, 6].map((n) => file(`g${n}.png`)));
  await expect(page.getByLabel('Trang phục: ảnh đã chọn').getByRole('img')).toHaveCount(5); // the sixth is left out
  await page.getByLabel('Ảnh người mẫu').setInputFiles(file('person.png'));
  await page.getByLabel('Ảnh bối cảnh').setInputFiles(file('scene.png'));
  await expect(page.getByRole('button', { name: /^Thử đồ/ })).toBeEnabled(); // 7 photos: under the model's 14
  await expect(page.locator('.form-message').getByRole('status')).toHaveCount(0);
});

test('Try On: a missing slot keeps Run disabled with a reason, a mock run reaches History and the Thử đồ chip, and the inputs go person, garment, background', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signIn(page, 'member9');
  await nav(page).getByRole('link', { name: 'Thử đồ' }).click();
  await expect(page).toHaveURL(/\/try-on$/);
  await expect(page.locator('.topbar')).toContainText('Thử đồ');

  const run = page.getByRole('button', { name: /^Thử đồ/ });
  const reason = page.locator('.form-message').getByRole('status');
  await expect(modelButton(page)).toContainText('Mock image E2E');
  await expect(run).toBeDisabled();
  await expect(reason).toHaveText('Tải lên ít nhất 1 ảnh trang phục.');
  await page.getByLabel('Ảnh trang phục').setInputFiles(file('garment.png'));
  await expect(page.getByRole('img', { name: 'garment.png' })).toBeVisible();
  await expect(run).toBeDisabled();
  await expect(reason).toHaveText('Tải lên ảnh người mẫu.');
  await page.getByLabel('Ảnh người mẫu').setInputFiles(file('person.png'));
  await expect(run).toBeEnabled();
  await expect(reason).toHaveCount(0);
  await expect(run).toContainText('$0.0000'); // a mock model books 0
  // The slot is full after one model photo, and a photo can be taken out again.
  await expect(page.getByLabel('Người mẫu: ảnh đã chọn').getByRole('img')).toHaveCount(1);
  await page.getByRole('button', { name: 'Bỏ ảnh person.png' }).click();
  await expect(run).toBeDisabled();
  await page.getByLabel('Ảnh người mẫu').setInputFiles(file('person.png'));
  await expect(run).toBeEnabled();

  await select(page, 'Độ phân giải').click();
  await expect(optionsOf(page, 'Độ phân giải')).toHaveText(['1K', '2K']);
  await page.keyboard.press('Escape');
  await expect(select(page, 'Tỉ lệ')).toHaveAttribute('data-value', 'auto');

  await run.click();
  await expect(page.getByText('Đã gửi job')).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Lịch sử' })).toHaveAttribute('aria-selected', 'true');
  await expect(toast(page, 'Ảnh đã xong')).toBeVisible({ timeout: 60_000 });
  const tray = page.getByRole('complementary', { name: 'Job của tôi' });
  await expect(tray.getByText('Hoàn tất')).toHaveCount(1);
  await expect(tray.locator('.job-chips').first().locator('button')).toHaveText(['1K', 'auto']); // the History card's resolution and ratio chips

  // A second run with a background: the garment is still second and the background last, and the prompt names each image's role.
  await page.getByLabel('Ảnh bối cảnh').setInputFiles(file('background.png'));
  await page.getByLabel('Prompt (tuỳ chọn)').fill('soft studio light');
  await run.click();
  await expect(tray.getByText('Hoàn tất')).toHaveCount(2, { timeout: 60_000 });
  const jobs = (await (await page.request.get('/api/jobs?mine')).json()) as { jobs: { id: string; feature: string }[] };
  expect(jobs.jobs.map((j) => j.feature)).toEqual(['try_on', 'try_on']);
  const detail = (await (await page.request.get(`/api/jobs/${jobs.jobs[0]!.id}`)).json()) as { prompt: string; images: { filename: string }[] };
  expect(detail.images.map((i) => i.filename)).toEqual(['person.png', 'garment.png', 'background.png']);
  expect(detail.prompt).toContain('Image 3 is the background scene.');
  expect(detail.prompt).toMatch(/soft studio light$/);

  await libraryChip(page, 'Thử đồ');
  const mine = page.getByRole('article').filter({ hasText: 'E2E Member 9' });
  await expect(mine).toHaveCount(2);
  await expect(mine.first().locator('img.output')).toBeVisible();
  await page.getByRole('group', { name: 'Loại' }).getByRole('button', { name: 'Tạo ảnh', exact: true }).click();
  await expect(mine).toHaveCount(0);
  await page.getByRole('group', { name: 'Loại' }).getByRole('button', { name: 'Tất cả video', exact: true }).click();
  await expect(mine).toHaveCount(0);

  // Ví dụ shows the company's try-on outputs.
  await nav(page).getByRole('link', { name: 'Thử đồ' }).click();
  await page.getByRole('tab', { name: 'Ví dụ' }).click();
  const gallery = page.getByRole('group', { name: 'Ảnh thử đồ của công ty' });
  await expect(gallery.getByRole('img').first()).toBeVisible();
  await expect.poll(() => gallery.getByRole('img').first().evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0)).toBe(true); // decoded, not just in the DOM
  await page.getByRole('tab', { name: 'Giới thiệu' }).click();
  await expect(page.getByRole('heading', { name: 'Thử đồ trên người mẫu' })).toBeVisible();

  // The two try-on jobs of this user must not show in Create's video history (an unfiltered Tray would list them).
  await nav(page).getByRole('link', { name: 'Tạo video' }).click();
  await expect(page).toHaveURL(/\/create$/); // Try On has a History tab too; wait for Create's
  await page.getByRole('tab', { name: 'Lịch sử' }).click();
  await expect(page.getByText('Chưa có job nào.')).toBeVisible();
  await expect(page.getByText('Hoàn tất')).toHaveCount(0);
});

test('Try On: Ví dụ says so when the company has no try-on image yet', async ({ page }) => {
  await signIn(page, 'member9');
  await page.route(/\/api\/library\?kind=try_on/, (r) => r.fulfill({ json: { hasMore: false, isAdmin: false, creators: [], clips: [] } }));
  await page.goto('/try-on');
  await page.getByRole('tab', { name: 'Ví dụ' }).click();
  await expect(page.getByText('Chưa có ảnh thử đồ nào trong công ty.')).toBeVisible();
});

test('Try On, as on Fash: a sample picture with a details file opens in place with the model, the photos, the prompt and its settings, and Dùng lại refills the form', async ({ page }) => {
  const details = { feature: 'try_on', images: [{ sample: 'try-on-example-1-model.png' }, { sample: 'try-on-example-1-garment-1.png' }, { sample: 'try-on-bg-test.jpg' }], garments: 1, brief: 'Sitting in a velvet armchair.', modelId: 'mock-image-e2e', ratio: '3:4', resolution: '1K', background: 'Seamless White', date: '2026-08-18' };
  const files: [string, Buffer, string][] = [
    ['try-on-example-1.jpg', jpg(), 'image/jpeg'], ['try-on-example-1.json', Buffer.from(JSON.stringify(details)), 'application/json'],
    ['try-on-example-1-model.png', png(), 'image/png'], ['try-on-example-1-garment-1.png', png(), 'image/png'], ['try-on-bg-test.jpg', jpg(), 'image/jpeg'],
    ['try-on-example-2.jpg', jpg(), 'image/jpeg'],
  ];
  const asAdmin = async (each: (name: string, data: Buffer, type: string) => Promise<{ ok(): boolean }>) => {
    await page.context().clearCookies();
    await signIn(page, 'admin');
    for (const [name, data, type] of files) expect((await each(name, data, type)).ok(), name).toBe(true);
    await page.context().clearCookies();
  };
  await asAdmin((name, data, type) => page.request.put(`/api/admin/samples/${name}`, { data, headers: { 'content-type': type } }));
  try {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await signIn(page, 'tryexa');
    await page.route(/\/api\/library\?kind=try_on/, (r) => r.fulfill({ json: { hasMore: false, isAdmin: false, creators: [], clips: [] } }));
    await page.goto('/try-on');
    await page.getByRole('tab', { name: 'Ví dụ' }).click();
    const gallery = page.getByRole('group', { name: 'Ảnh thử đồ của công ty' });
    await expect(gallery.getByRole('link', { name: 'Xem chi tiết ảnh mẫu' })).toHaveCount(1);
    await expect(gallery.getByRole('img', { name: 'Ảnh mẫu' })).toHaveCount(2); // the one without a details file stays a plain picture

    await gallery.getByRole('link', { name: 'Xem chi tiết ảnh mẫu' }).click();
    const detail = page.getByRole('dialog', { name: 'Chi tiết: Thử đồ' });
    await expect(detail.getByRole('heading', { name: 'Mock image E2E' })).toBeVisible();
    await expect(detail.getByRole('list', { name: 'Ảnh đầu vào' }).getByRole('img')).toHaveCount(3);
    await expect(detail.locator('.job-text')).toHaveText(details.brief);
    await expect(detail.locator('.job-chips')).toHaveText(['1K3:4', 'Seamless White']);
    await expect(detail.locator('.lightbox-media img')).toHaveAttribute('src', '/api/samples/try-on-example-1.jpg');

    // As on Fash, each piece goes on the form on its own, with a note: a garment, the background, the words, a chip, the result as the model photo.
    const note = (text: string) => page.getByRole('region', { name: 'Thông báo' }).getByText(text);
    await detail.getByRole('button', { name: 'try-on-example-1-garment-1.png' }).click();
    await expect(note('Đã thêm trang phục')).toBeVisible();
    await expect(page.getByLabel('Trang phục: ảnh đã chọn').getByRole('img', { name: 'try-on-example-1-garment-1.png' })).toBeVisible();
    await detail.getByRole('button', { name: 'Seamless White' }).click();
    await expect(note('Đã chọn bối cảnh')).toBeVisible();
    await expect(page.getByLabel('Bối cảnh (tuỳ chọn): ảnh đã chọn').getByRole('img', { name: 'try-on-bg-test.jpg' })).toBeVisible();
    await detail.getByRole('button', { name: 'Chép prompt vào ô Prompt' }).click();
    await expect(page.getByRole('textbox', { name: 'Prompt (tuỳ chọn)' })).toHaveValue(details.brief);
    await detail.getByRole('button', { name: '3:4' }).click();
    await expect(select(page, 'Tỉ lệ')).toHaveAttribute('data-value', '3:4');
    await detail.getByRole('button', { name: 'Dùng kết quả' }).click();
    await expect(note('Đã dùng kết quả làm ảnh người mẫu')).toBeVisible();
    await expect(page.getByLabel('Người mẫu: ảnh đã chọn').getByRole('img', { name: 'try-on-example-1.jpg' })).toBeVisible();

    // As Fash's Recreate: the form refills in place, the URL stays, the detail stays open and a note shows above it.
    await detail.getByRole('button', { name: 'Dùng lại' }).click();
    const ready = note('Sẵn sàng tạo lại');
    await expect(ready).toBeVisible();
    expect(await page.getByRole('region', { name: 'Thông báo' }).evaluate((e) => e.matches(':popover-open'))).toBe(true); // in the top layer, shown after the dialog, so above it
    await expect(detail).toBeVisible();
    await expect(page).toHaveURL(/\/try-on$/);
    await expect(page.getByLabel('Người mẫu: ảnh đã chọn').getByRole('img', { name: 'try-on-example-1-model.png' })).toBeVisible();
    await expect(page.getByLabel('Trang phục: ảnh đã chọn').getByRole('img', { name: 'try-on-example-1-garment-1.png' })).toBeVisible();
    await expect(page.getByLabel('Bối cảnh (tuỳ chọn): ảnh đã chọn').getByRole('img', { name: 'try-on-bg-test.jpg' })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Prompt (tuỳ chọn)' })).toHaveValue(details.brief);
    await expect(select(page, 'Tỉ lệ')).toHaveAttribute('data-value', '3:4');
    await expect(select(page, 'Độ phân giải')).toHaveAttribute('data-value', '1K');
  } finally {
    await asAdmin((name) => page.request.delete(`/api/admin/samples/${name}`));
  }
});

test('Image Generation, as on Fash: a sample picture with a details file opens in place, and its input, words and Dùng lại go on the form', async ({ page }) => {
  const details = { feature: 'image', images: [{ sample: 'image-example-1-input-1.png' }], prompt: 'Replace the outfit, keep the pose.', enhance: false, modelId: 'mock-image-e2e', ratio: '3:4', resolution: '2K', date: '2026-10-23' };
  const files: [string, Buffer, string][] = [
    ['image-example-1.jpg', jpg(), 'image/jpeg'], ['image-example-1.json', Buffer.from(JSON.stringify(details)), 'application/json'], ['image-example-1-input-1.png', png(), 'image/png'],
  ];
  const asAdmin = async (each: (name: string, data: Buffer, type: string) => Promise<{ ok(): boolean }>) => {
    await page.context().clearCookies();
    await signIn(page, 'admin');
    for (const [name, data, type] of files) expect((await each(name, data, type)).ok(), name).toBe(true);
    await page.context().clearCookies();
  };
  await asAdmin((name, data, type) => page.request.put(`/api/admin/samples/${name}`, { data, headers: { 'content-type': type } }));
  try {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await signIn(page, 'imgexa');
    await page.route(/\/api\/library\?kind=image/, (r) => r.fulfill({ json: { hasMore: false, isAdmin: false, creators: [], clips: [] } }));
    await page.goto('/image-generation');
    const gallery = page.getByRole('group', { name: 'Ảnh của công ty' });
    await gallery.getByRole('link', { name: 'Xem chi tiết ảnh mẫu' }).click();
    const detail = page.getByRole('dialog', { name: 'Chi tiết: Tạo ảnh' });
    await expect(detail.getByRole('heading', { name: 'Mock image E2E' })).toBeVisible();
    await expect(detail.locator('.job-text')).toHaveText(details.prompt);
    await expect(detail.locator('.job-chips')).toHaveText('2K3:4');
    const chosen = page.getByRole('list', { name: 'Ảnh đã chọn' });
    await detail.getByRole('button', { name: 'image-example-1-input-1.png' }).click();
    await expect(chosen.getByRole('img', { name: 'image-example-1-input-1.png' })).toBeVisible();
    await detail.getByRole('button', { name: 'Dùng kết quả' }).click(); // the result as one more input
    await expect(chosen.getByRole('img')).toHaveCount(2);
    await detail.getByRole('button', { name: 'Dùng lại' }).click();
    await expect(page.getByRole('textbox', { name: 'Mô tả cảnh bạn muốn tạo' })).toHaveValue(details.prompt);
    await expect(chosen.getByRole('img')).toHaveCount(1); // Recreate refills: the sample's own input only
    await expect(page).toHaveURL(/\/image-generation$/);

    // As on Fash's cards, the tile's own actions on hover, without opening it: Use Result, then Recreate.
    await page.keyboard.press('Escape');
    await expect(detail).toBeHidden();
    const tile = gallery.getByRole('listitem').filter({ has: page.getByRole('link', { name: 'Xem chi tiết ảnh mẫu' }) });
    await tile.hover();
    await expect(tile.getByRole('link', { name: 'Tải xuống' })).toHaveAttribute('href', '/api/samples/image-example-1.jpg');
    await tile.getByRole('button', { name: 'Dùng kết quả' }).click();
    await expect(chosen.getByRole('img')).toHaveCount(2);
    await page.getByRole('textbox', { name: 'Mô tả cảnh bạn muốn tạo' }).fill('');
    await tile.hover();
    await tile.getByRole('button', { name: 'Dùng lại' }).click();
    await expect(page.getByRole('textbox', { name: 'Mô tả cảnh bạn muốn tạo' })).toHaveValue(details.prompt);
    await expect(chosen.getByRole('img')).toHaveCount(1);
  } finally {
    await asAdmin((name) => page.request.delete(`/api/admin/samples/${name}`));
  }
});

test('Image Generation: the bar counts the prompt near the model limit, and a switch to a smaller limit keeps the text while Run waits', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signIn(page, 'imgp');
  await page.goto('/image-generation');
  const bar = page.getByRole('group', { name: 'Thanh tạo ảnh' });
  const run = bar.getByRole('button', { name: /^Tạo ảnh/ });
  const prompt = bar.getByRole('textbox', { name: 'Mô tả cảnh bạn muốn tạo' });
  const count = bar.locator('.bar-count');
  await bar.getByLabel('Ảnh tham chiếu', { exact: true }).setInputFiles(file('reference.png'));
  await expect(bar.getByRole('img', { name: 'reference.png' })).toBeVisible();
  await expect(modelButton(page)).toContainText('Mock image E2E');
  await prompt.fill('x'.repeat(1500));
  await expect(count).toHaveCount(0); // under 80% of 2000: the bar stays as on the live page
  const text = 'x'.repeat(1700);
  await prompt.fill(text);
  await expect(count).toHaveText('1700/2000 ký tự');
  await expect(run).toBeEnabled();

  await modelButton(page).click();
  await page.getByRole('option', { name: /Mock image Solo/ }).click();
  await expect(modelButton(page)).toContainText('Mock image Solo');
  await expect(prompt).toHaveValue(text);
  await expect(count).toHaveText('1700/1000 ký tự');
  await expect(run).toBeDisabled();
  await expect(bar.getByRole('status')).toHaveText('Mô hình Mock image Solo nhận tối đa 1000 ký tự, hãy rút gọn hoặc chọn mô hình khác.');
});

test('Image Generation: the bar needs a prompt (and an image only on a model with no text-to-image), every pill works by keyboard, and a mock run reaches History and the Tạo ảnh chip', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signIn(page, 'member10');
  await nav(page).getByRole('link', { name: 'Tạo ảnh' }).click();
  await expect(page).toHaveURL(/\/image-generation$/);
  await expect(page.getByRole('tab', { name: 'Ví dụ' })).toHaveAttribute('aria-selected', 'true');

  const bar = page.getByRole('group', { name: 'Thanh tạo ảnh' });
  const run = bar.getByRole('button', { name: /^Tạo ảnh/ });
  const reason = bar.getByRole('status');
  await expect(modelButton(page)).toContainText('Mock image E2E');
  await expect(run).toBeDisabled();
  await expect(reason).toHaveText('Nhập mô tả cảnh bạn muốn tạo.'); // the mock model makes a picture from words alone, as Fash's text-to-image examples
  await bar.getByRole('textbox', { name: 'Mô tả cảnh bạn muốn tạo' }).fill('a red shirt on a hanger');
  await expect(run).toBeEnabled();
  await expect(reason).toHaveCount(0);
  await bar.getByLabel('Ảnh tham chiếu', { exact: true }).setInputFiles(file('reference.png'));
  await expect(bar.getByRole('img', { name: 'reference.png' })).toBeVisible();
  await expect(run).toBeEnabled();

  // Ratio: Enter opens, arrows move, Enter chooses; Escape closes without changing; Space opens too.
  const ratio = select(page, 'Tỉ lệ');
  await ratio.focus();
  await page.keyboard.press('Enter');
  await expect(optionsOf(page, 'Tỉ lệ')).toHaveText(['Tự động', '1:1', '3:4']);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(ratio).toHaveAttribute('data-value', '1:1');
  await expect(ratio).toBeFocused();
  await page.keyboard.press(' ');
  await expect(optionsOf(page, 'Tỉ lệ')).toHaveCount(3);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Escape');
  await expect(optionsOf(page, 'Tỉ lệ')).toHaveCount(0);
  await expect(ratio).toHaveAttribute('data-value', '1:1');
  await expect(ratio).toBeFocused();

  const resolution = select(page, 'Độ phân giải');
  await resolution.focus();
  await page.keyboard.press('Enter');
  await expect(optionsOf(page, 'Độ phân giải')).toHaveText(['1K', '2K']);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(resolution).toHaveAttribute('data-value', '2K');

  // Model: Enter opens the panel with the search box focused; arrows and Enter choose the one-image model; its ratios replace the list.
  await modelButton(page).focus();
  await page.keyboard.press('Enter');
  const panel = page.getByRole('dialog', { name: 'Chọn mô hình' });
  await expect(panel).toBeVisible();
  await expect(panel.getByRole('combobox', { name: 'Tìm mô hình' })).toBeFocused();
  await expect(panel.getByRole('option')).toHaveCount(2);
  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
  await expect(modelButton(page)).toBeFocused();
  for (const key of ['ArrowDown', 'ArrowUp']) {
    await page.keyboard.press(key); // like the Select pills, an arrow opens it
    await expect(panel).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(panel).toBeHidden();
  }
  await page.keyboard.press(' ');
  await expect(panel).toBeVisible();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(modelButton(page)).toContainText('Mock image Solo');
  await expect(ratio).toHaveAttribute('data-value', 'auto'); // 1:1 is not a ratio of this model
  await expect(bar.getByRole('button', { name: 'Thêm ảnh tham chiếu' })).toHaveCount(0); // one image, and it is there
  await page.keyboard.press('Enter');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Enter');
  await expect(modelButton(page)).toContainText('Mock image E2E');
  await expect(ratio).toHaveAttribute('data-value', '1:1'); // back on the roomy model, the earlier choice returns

  // Enhance sits in the bar, on by default; the job stores the member's choice (a mock job is never rewritten).
  const enhance = bar.getByRole('button', { name: 'Cải thiện mô tả bằng AI' });
  await expect(enhance).toHaveAttribute('aria-pressed', 'true');
  await enhance.click();
  await expect(enhance).toHaveText('Cải thiện: tắt');

  await run.click();
  await expect(page.getByText('Đã gửi job')).toBeVisible();
  const sent = ((await (await page.request.get('/api/jobs?mine')).json()) as { jobs: { id: string }[] }).jobs[0]!;
  expect(await (await page.request.get(`/api/jobs/${sent.id}`)).json()).toMatchObject({ prompt: 'a red shirt on a hanger', enhance: false, enhancedPrompt: null });
  await expect(page.getByRole('tab', { name: 'Lịch sử' })).toHaveAttribute('aria-selected', 'true');
  await expect(toast(page, 'Ảnh đã xong')).toBeVisible({ timeout: 60_000 });
  const tray = page.getByRole('complementary', { name: 'Job của tôi' });
  await expect(tray.getByText('Hoàn tất')).toHaveCount(1);
  await expect(tray.locator('.job-chips').first().locator('button')).toHaveText(['2K', '1:1']);

  // Ví dụ now holds the image, and the Library files it under Tạo ảnh and Tất cả ảnh, not under Thử đồ or the videos.
  await page.getByRole('tab', { name: 'Ví dụ' }).click();
  const gallery = page.getByRole('group', { name: 'Ảnh của công ty' });
  await expect(gallery.getByRole('img').first()).toBeVisible();
  await expect.poll(() => gallery.getByRole('img').first().evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0)).toBe(true); // decoded, not just in the DOM
  await libraryChip(page, 'Tạo ảnh');
  const mine = page.getByRole('article').filter({ hasText: 'E2E Member 10' });
  await expect(mine).toHaveCount(1);
  await expect(mine.getByText('Mock image E2E · 1:1 · 2K')).toBeVisible();
  for (const chip of ['Thử đồ', 'Tất cả video', 'Ứng dụng']) {
    await page.getByRole('group', { name: 'Loại' }).getByRole('button', { name: chip, exact: true }).click();
    await expect(mine).toHaveCount(0);
  }
  await page.getByRole('group', { name: 'Loại' }).getByRole('button', { name: 'Tất cả ảnh', exact: true }).click();
  await expect(mine).toHaveCount(1);
});

test('Image Generation, as Fash text-to-image: words alone make a picture on a model that offers it; a model that needs an image says so', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signIn(page, 'member10');
  await page.goto('/image-generation');
  const bar = page.getByRole('group', { name: 'Thanh tạo ảnh' });
  await bar.getByRole('textbox', { name: 'Mô tả cảnh bạn muốn tạo' }).fill('a linen dress on a sunny balcony');
  await bar.getByRole('button', { name: /^Tạo ảnh/ }).click();
  await page.getByRole('tab', { name: 'Lịch sử' }).click();
  const card = page.getByRole('complementary', { name: 'Job của tôi' }).getByRole('listitem').filter({ hasText: 'a linen dress on a sunny balcony' });
  await expect(card.getByText('Hoàn tất')).toBeVisible({ timeout: 60_000 });

  await page.route(/\/api\/image-models\?feature=image/, async (r) => {
    const body = (await (await r.fetch()).json()) as { models: Record<string, unknown>[] };
    await r.fulfill({ json: { models: body.models.map((m) => ({ ...m, textToImage: false })) } });
  });
  await page.reload();
  await bar.getByRole('textbox', { name: 'Mô tả cảnh bạn muốn tạo' }).fill('a linen dress');
  await expect(bar.getByRole('status')).toHaveText('Mô hình này cần ít nhất 1 ảnh tham chiếu.');
  await expect(bar.getByRole('button', { name: /^Tạo ảnh/ })).toBeDisabled();
});

test('Image Generation: a cap refusal shows its message in Vietnamese', async ({ page }) => {
  await signIn(page, 'member10');
  await page.route(/\/api\/jobs$/, (r) => (r.request().method() === 'POST' ? r.fulfill({ status: 429, json: { error: 'Bạn đã dùng hết hạn mức chi phí hôm nay' } }) : r.fallback()));
  await page.goto('/image-generation');
  const bar = page.getByRole('group', { name: 'Thanh tạo ảnh' });
  await expect(bar.getByLabel('Ảnh tham chiếu', { exact: true })).toBeEnabled(); // a fresh load: the input is disabled until hydration
  await bar.getByLabel('Ảnh tham chiếu', { exact: true }).setInputFiles(file('reference.png'));
  await bar.getByRole('textbox', { name: 'Mô tả cảnh bạn muốn tạo' }).fill('a bottle');
  await bar.getByRole('button', { name: /^Tạo ảnh/ }).click();
  await expect(bar.getByRole('alert')).toHaveText('Bạn đã dùng hết hạn mức chi phí hôm nay');
});

test('geometry at 1440: the Try On card is 320 wide at x=288 and the image bar is 818 wide, centred, 24 px above the bottom, and never covers the last row', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signIn(page, 'member11');
  // Ten images from the mock model, so the gallery is taller than the screen.
  const up = await page.request.post('/api/assets', { multipart: { file: file('ref.png') } });
  const assetId = ((await up.json()) as { assets: { id: string }[] }).assets[0]!.id;
  for (let i = 0; i < 10; i++) {
    const job = await page.request.post('/api/jobs', { data: { feature: 'image', modelId: 'mock-image-e2e', assetIds: [assetId], prompt: `scene ${i}`, ratio: 'auto', params: { resolution: '1K' } } });
    expect(job.status()).toBe(201);
  }

  await page.goto('/try-on');
  const card = page.locator('.form-card');
  const c = await box(card);
  near(c.x, 288, 'card x');
  near(c.y, 16, 'card y');
  near(c.width, 320, 'card width');
  near(c.height, 976, 'card height');
  expect(await card.evaluate((el) => getComputedStyle(el).borderTopLeftRadius)).toBe('24px');
  const tabs = await box(page.getByRole('tablist'));
  expect(tabs.y).toBeLessThan(40);
  expect(tabs.x + tabs.width / 2).toBeGreaterThan(c.x + c.width);
  near((await box(page.locator('.runbar'))).height, 73, 'run wrapper height');
  // Three slots, then the model picker, the prompt, the resolution and the ratio, in the order of the reference.
  await expect(page.locator('.form-scroll .field-label')).toHaveText(['Trang phục', 'Người mẫu', 'Bối cảnh (tuỳ chọn)', 'Mô hình', 'Prompt (tuỳ chọn)', 'Độ phân giải', 'Tỉ lệ']);
  for (const slot of await page.locator('.slot').all()) near((await box(slot)).width, 268, 'slot width');
  // The live rhythm: the first label at the top of the form, 32 px between one picture tray and the next label.
  const labels = page.locator('.form-scroll .field-label'), slots = page.locator('.slot');
  near((await box(labels.first())).y, (await box(page.locator('.form-scroll'))).y, 'first label y', 1);
  for (const i of [0, 1]) {
    const tray = await box(slots.nth(i));
    near((await box(labels.nth(i + 1))).y - (tray.y + tray.height), 32, 'tray to next label', 1);
  }
  near((await box(page.locator('.prompt-box'))).height, 74, 'prompt box height', 1); // 74 px with no counter row, as on Fash and Marketing Studio

  await expect.poll(async () => ((await (await page.request.get('/api/jobs?mine')).json()) as { jobs: { status: string }[] }).jobs.filter((j) => j.status === 'succeeded').length, { timeout: 120_000 }).toBe(10);
  await page.goto('/image-generation');
  const gallery = page.getByRole('group', { name: 'Ảnh của công ty' });
  await expect(gallery.getByRole('img').first()).toBeVisible();
  await expect.poll(() => gallery.getByRole('img').first().evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0)).toBe(true); // decoded, not just in the DOM
  const bar = page.locator('.imagebar');
  const b = await box(bar);
  const content = await box(page.locator('.content'));
  near(b.width, 818, 'bar width');
  near(b.x + b.width / 2, content.x + content.width / 2, 'bar centre', 10); // the scrollbar takes part of the content width
  near(1000 - (b.y + b.height), 24, 'bar bottom gap');
  expect(b.height).toBeGreaterThan(120);
  expect(b.height).toBeLessThan(200);
  expect(await bar.evaluate((el) => getComputedStyle(el).borderTopLeftRadius)).toBe('24px');
  // The bar is pinned while the gallery scrolls under it, and at the end of the page the last row sits above it.
  await page.evaluate(() => window.scrollTo(0, 400));
  near(1000 - ((await box(bar)).y + (await box(bar)).height), 24, 'pinned bar bottom gap');
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const last = await page.locator('.gallery-item').evaluateAll((els) => Math.max(...els.map((e) => e.getBoundingClientRect().bottom)));
  expect(last).toBeLessThanOrEqual((await box(bar)).y);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

for (const [width, height] of [[390, 844], [1024, 768], [1440, 1000]] as const) {
  test(`at ${width} px both pages fit the width, in every tab`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await signIn(page, 'member11');
    const fits = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
    for (const path of ['/try-on', '/image-generation']) {
      await page.goto(path);
      await expect(page.getByRole('tab').first()).toBeVisible();
      for (const tab of await page.getByRole('tab').all()) {
        await tab.click();
        expect(await fits(), `${path} ${await tab.textContent()}`).toBe(true);
      }
    }

    if (width === 390) {
      // Try On stacks into the Create-style tabs with its Run button inside the screen; the bar spans the width with 16 px gutters.
      await page.goto('/try-on');
      await expect(page.getByRole('tab')).toHaveText(['Tạo', 'Lịch sử', 'Ví dụ', 'Giới thiệu']);
      const run = await box(page.getByRole('button', { name: /^Thử đồ/ }));
      expect(run.y + run.height).toBeLessThanOrEqual(height);
      near(run.width, 358, 'run width', 1); // the card, which has 16 px gutters
      await page.goto('/image-generation');
      const b = await box(page.locator('.imagebar'));
      near(b.x, 16, 'bar left gutter');
      near(390 - (b.x + b.width), 16, 'bar right gutter');
      expect(b.y + b.height).toBeLessThanOrEqual(height);
      // The pills open inside the screen: the model panel and a select popover.
      await modelButton(page).click();
      const panel = await box(page.getByRole('dialog', { name: 'Chọn mô hình' }));
      expect(panel.x).toBeGreaterThanOrEqual(0);
      expect(panel.x + panel.width).toBeLessThanOrEqual(390);
      expect(panel.y).toBeGreaterThanOrEqual(0);
      expect(panel.y + panel.height).toBeLessThanOrEqual((await box(modelButton(page))).y); // above the pill, which is at the bottom of the screen
    }
  });
}

test('Try On: the sample pictures in an empty slot upload like a picked file, and give way to the slot image until it is removed', async ({ page }) => {
  const names = ['try-on-garment-1.png', 'try-on-garment-2.png', 'try-on-model-1.png', 'try-on-background-1.png'];
  const asAdmin = async (each: (name: string) => Promise<{ ok(): boolean }>) => {
    await page.context().clearCookies();
    await signIn(page, 'admin');
    for (const name of names) expect((await each(name)).ok()).toBe(true);
    await page.context().clearCookies();
  };
  await asAdmin((name) => page.request.put(`/api/admin/samples/${name}`, { data: png(), headers: { 'content-type': 'image/png' } }));
  try {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await signIn(page, 'member9');
    await page.goto('/try-on');
    const samplesOf = (slot: string) => page.getByRole('list', { name: `${slot}: ảnh mẫu` }).getByRole('button');
    const run = page.getByRole('button', { name: /^Thử đồ/ });
    await expect(samplesOf('Trang phục')).toHaveCount(2);
    await expect(samplesOf('Người mẫu')).toHaveCount(1);
    await expect(samplesOf('Bối cảnh (tuỳ chọn)')).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'Tải lên Trang phục' })).toBeVisible(); // the own-file tile stays beside the samples
    // As on the live page, sample tiles are 79 px squares filling the tray's height, and a lone sample (the background) fills the tray.
    expect((await samplesOf('Trang phục').first().boundingBox())!.width).toBeCloseTo(79, 0);
    const tray = (await page.getByRole('list', { name: 'Bối cảnh (tuỳ chọn): ảnh mẫu' }).boundingBox())!;
    expect((await samplesOf('Bối cảnh (tuỳ chọn)').boundingBox())!.width).toBeCloseTo(tray.width, 0);

    // The garments' white ground takes the tray's grey; the model photos keep their own colours.
    expect(await samplesOf('Trang phục').first().locator('img').evaluate((e) => getComputedStyle(e).mixBlendMode)).toBe('multiply');
    expect(await samplesOf('Người mẫu').first().locator('img').evaluate((e) => getComputedStyle(e).mixBlendMode)).toBe('normal');
    await page.getByRole('button', { name: 'Dùng ảnh mẫu 2 cho Trang phục' }).click();
    await expect(page.getByLabel('Trang phục: ảnh đã chọn').getByRole('img', { name: 'try-on-garment-2.png' })).toBeVisible();
    await expect(samplesOf('Trang phục')).toHaveCount(0);
    await expect(run).toBeDisabled();
    await page.getByRole('button', { name: 'Dùng ảnh mẫu 1 cho Người mẫu' }).click();
    await expect(page.getByLabel('Người mẫu: ảnh đã chọn').getByRole('img', { name: 'try-on-model-1.png' })).toBeVisible();
    await expect(run).toBeEnabled(); // the samples went through the normal upload, so they count as the run's images

    await page.getByRole('button', { name: 'Bỏ ảnh try-on-model-1.png' }).click();
    await expect(samplesOf('Người mẫu')).toHaveCount(1);
    await expect(run).toBeDisabled();
  } finally {
    await asAdmin((name) => page.request.delete(`/api/admin/samples/${name}`));
  }
});

test("Try On, as Fash's pickers: a stock model then its pose, a garment category then a garment, and a named background each go in their slot", async ({ page }) => {
  const names = ['try-on-stock-model-10.jpg', 'try-on-stock-model-10-pose-2.jpg', 'try-on-stock-top.jpg', 'try-on-stock-top-1.jpg', 'try-on-bg-new-york.jpg'];
  const asAdmin = async (each: (name: string) => Promise<{ ok(): boolean }>) => {
    await page.context().clearCookies();
    await signIn(page, 'admin');
    for (const name of names) expect((await each(name)).ok(), name).toBe(true);
    await page.context().clearCookies();
  };
  await asAdmin((name) => page.request.put(`/api/admin/samples/${name}`, { data: jpg(), headers: { 'content-type': 'image/jpeg' } }));
  try {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await signIn(page, 'member9');
    await page.goto('/try-on');
    const chosen = (slot: string) => page.getByLabel(`${slot}: ảnh đã chọn`).getByRole('img');
    // Each slot opens its picker once the sample list is in; until then it is an own-file upload.
    for (const slot of ['Người mẫu', 'Trang phục', 'Bối cảnh (tuỳ chọn)']) await expect(page.getByRole('button', { name: `Tải lên ${slot}` })).toHaveAttribute('aria-haspopup', 'dialog');

    await page.getByRole('button', { name: 'Tải lên Người mẫu' }).click();
    const models = page.getByRole('dialog', { name: 'Chọn người mẫu' });
    await models.getByRole('button', { name: 'Người mẫu có sẵn 1' }).click();
    const poses = page.getByRole('dialog', { name: 'Chọn tư thế' });
    await poses.getByRole('button', { name: 'Quay lại' }).click(); // back to the models, as Fash's arrow
    await models.getByRole('button', { name: 'Người mẫu có sẵn 1' }).click();
    await poses.getByRole('button', { name: 'Tư thế 1' }).click();
    await expect(poses).toBeHidden();
    await expect(chosen('Người mẫu')).toHaveCount(1);

    await page.getByRole('button', { name: 'Tải lên Trang phục' }).click();
    await page.getByRole('dialog', { name: 'Chọn trang phục' }).getByRole('button', { name: 'Áo' }).click();
    await page.getByRole('dialog', { name: 'Áo' }).getByRole('button', { name: 'Áo 1' }).click();
    await expect(chosen('Trang phục')).toHaveCount(1);
    await page.getByRole('button', { name: 'Tải lên Trang phục' }).click(); // a slot with room opens the picker again
    await expect(page.getByRole('dialog', { name: 'Chọn trang phục' })).toBeVisible();
    await page.keyboard.press('Escape');

    await page.getByRole('button', { name: 'Tải lên Bối cảnh (tuỳ chọn)' }).click();
    await page.getByRole('dialog', { name: 'Chọn bối cảnh' }).getByRole('button', { name: 'New York Streets' }).click();
    await expect(chosen('Bối cảnh (tuỳ chọn)')).toHaveCount(1);
    await expect(page.getByRole('region', { name: 'Thông báo' }).getByText('Đã chọn bối cảnh')).toBeVisible();
  } finally {
    await asAdmin((name) => page.request.delete(`/api/admin/samples/${name}`));
  }
});
