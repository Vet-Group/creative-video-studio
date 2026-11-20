import { expect, type Locator, type Page, test } from '@playwright/test';
import { POSES } from '../src/lib/try-on-stock';
import { addExamples, gotoTryOn, jpg, modelButton, optionsOf, pickModel, png, select, selectValue, settled, signIn } from './support.test';

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
  await expect(page.getByText('Chỉ lấy 5 ảnh đầu.')).toBeVisible(); // and the slot says so
  await page.getByLabel('Ảnh người mẫu').setInputFiles(file('person.png'));
  await page.getByLabel('Ảnh bối cảnh').setInputFiles(file('scene.png'));
  await expect(page.getByRole('button', { name: /^Thử đồ/ })).toBeEnabled(); // 7 photos: under the model's 14
  await expect(page.locator('.form-message').getByRole('status')).toHaveCount(0);
});

test('Try On takes 13 garments on Nano Banana 2.1 and counts them on the slot; a background past the image limit is named, and a model that takes 5 keeps all 13 and holds Run until 8 go', async ({ page }) => {
  // The mock model is listed again under Nano Banana 2.1's id, which takes 13 garments (Fash's About page); both take 14 photos. Nothing is run.
  await page.route(/\/api\/image-models\?/, async (r) => {
    const res = await r.fetch();
    const json = (await res.json()) as { models: { id: string; label: string; maxImages: number; recommended: boolean }[] };
    const models = json.models.map((m) => ({ ...m, maxImages: 14, recommended: false }));
    return r.fulfill({ json: { ...json, models: [...models, { ...models[0]!, id: 'nano-banana-2.1', label: 'Nano Banana 2.1' }] } });
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signIn(page, 'garmentcap');
  await gotoTryOn(page);
  const garments = page.getByRole('group', { name: 'Trang phục', exact: true });
  const chosen = page.getByLabel('Trang phục: ảnh đã chọn').getByRole('img');
  const run = page.getByRole('button', { name: /^Thử đồ/ });
  const reason = page.locator('.form-message').getByRole('status');

  await pickModel(page, /Nano Banana 2.1/);
  await expect(modelButton(page)).toContainText('Nano Banana 2.1');
  await expect(page.getByText('Thêm 1 đến 13 ảnh trang phục')).toBeVisible();
  await page.getByLabel('Ảnh trang phục').setInputFiles(Array.from({ length: 14 }, (_, i) => file(`cap${i + 1}.png`)));
  await expect(chosen).toHaveCount(13); // the fourteenth is left out
  await expect(page.getByText('Chỉ lấy 13 ảnh đầu.')).toBeVisible();
  await expect(garments).toHaveAccessibleDescription('13 trên 13 ảnh trang phục'); // the count beside the slot's name, read with the slot
  await expect(page.locator('.slot-count > [aria-hidden="true"]')).toHaveText('13/13'); // on screen; screen readers hear the words
  await expect(page.getByRole('button', { name: 'Tải lên Trang phục' })).toHaveCount(0); // full: no add tile
  await page.getByLabel('Ảnh người mẫu').setInputFiles(file('cap-person.png'));
  await expect(run).toBeEnabled(); // 14 photos: the model's 14
  await expect(reason).toHaveCount(0);
  // A background makes 15: the reason names it as the photo too many, and the slot now offers 12.
  await page.getByLabel('Ảnh bối cảnh').setInputFiles(file('cap-scene.png'));
  await expect(reason).toHaveText('Mô hình này nhận tối đa 14 ảnh, tính cả ảnh bối cảnh. Bỏ ảnh bối cảnh hoặc bớt 1 ảnh trang phục để chạy.');
  await expect(garments).toHaveAccessibleDescription('13 trên 12 ảnh trang phục');
  await expect(run).toBeDisabled();
  await page.getByRole('button', { name: 'Bỏ ảnh cap-scene.png' }).click();
  await expect(reason).toHaveCount(0);
  await expect(run).toBeEnabled();

  // A model that takes 5 drops none of the 13: the count reads over its cap and Run waits with the reason until 8 go.
  await pickModel(page, /Mock image E2E/);
  await expect(chosen).toHaveCount(13);
  await expect(garments).toHaveAccessibleDescription('13 trên 5 ảnh trang phục');
  await expect(reason).toHaveText('Mô hình này nhận tối đa 5 ảnh trang phục. Bỏ bớt 8 ảnh để chạy.');
  await expect(run).toBeDisabled();
  for (let n = 13; n > 5; n--) await page.getByRole('button', { name: `Bỏ ảnh cap${n}.png` }).click();
  await expect(garments).toHaveAccessibleDescription('5 trên 5 ảnh trang phục');
  await expect(reason).toHaveCount(0);
  await expect(run).toBeEnabled();
  await page.getByRole('button', { name: 'Bỏ ảnh cap5.png' }).click();
  await expect(garments).toHaveAccessibleDescription('4 trên 5 ảnh trang phục');
  await expect(page.getByRole('button', { name: 'Tải lên Trang phục' })).toBeVisible(); // room again: the add tile is back
});

test('Try On: a missing slot keeps Run disabled with a reason, a mock run reaches History and the Thử đồ chip, and the inputs go person, garment, background', async ({ page, browser }) => {
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
  await expect(page.getByText('Đã gửi lượt tạo')).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Lịch sử' })).toHaveAttribute('aria-selected', 'true');
  await expect(toast(page, 'Ảnh đã xong')).toBeVisible({ timeout: 60_000 });
  const tray = page.getByRole('complementary', { name: 'Lượt tạo của tôi' });
  await expect(tray.getByText('Hoàn tất')).toHaveCount(1);
  await expect(tray.locator('.job-chips').first().locator('button')).toHaveText(['1K', 'auto']); // the History card's resolution and ratio chips
  // The before/after slider: the card's compare button opens it over the original model photo; the arrow keys move the handle and Escape closes it.
  await tray.getByRole('button', { name: 'So sánh trước/sau' }).first().click();
  const compare = page.getByRole('dialog', { name: /^So sánh trước\/sau/ });
  const slider = compare.getByRole('slider', { name: 'So sánh trước và sau' });
  await expect(slider).toHaveAttribute('aria-valuetext', 'Ảnh gốc 50%, kết quả 50%');
  await expect(compare.getByRole('img', { name: 'Ảnh người mẫu gốc' })).toBeVisible();
  await slider.press('ArrowRight');
  await expect(slider).toHaveAttribute('aria-valuetext', 'Ảnh gốc 51%, kết quả 49%');
  await page.keyboard.press('Escape');
  await expect(compare).toHaveCount(0);

  // A second run with a background: the garment is still second and the background last, and the prompt names each image's role.
  await page.getByLabel('Ảnh bối cảnh').setInputFiles(file('background.png'));
  await page.getByLabel('Mô tả (tuỳ chọn)').fill('soft studio light');
  await expect(page.locator('.prompt-preview p')).toContainText('Image 3 is the background scene.'); // once the background is in
  await expect(page.locator('.prompt-preview p')).toContainText(/soft studio light$/);
  const preview = await page.locator('.prompt-preview p').innerText();
  await run.click();
  await expect(tray.getByText('Hoàn tất')).toHaveCount(2, { timeout: 60_000 });
  const jobs = (await (await page.request.get('/api/jobs?mine')).json()) as { jobs: { id: string; feature: string }[] };
  expect(jobs.jobs.map((j) => j.feature)).toEqual(['try_on', 'try_on']);
  const detail = (await (await page.request.get(`/api/jobs/${jobs.jobs[0]!.id}`)).json()) as { prompt: string; images: { filename: string }[] };
  expect(detail.images.map((i) => i.filename)).toEqual(['person.png', 'garment.png', 'background.png']);
  expect(detail.prompt).toContain('Image 3 is the background scene.');
  expect(detail.prompt).toMatch(/soft studio light$/);
  expect(detail.prompt).toBe(preview); // the prompt preview showed what the server stored

  await libraryChip(page, 'Thử đồ');
  const mine = page.getByRole('article').filter({ hasText: 'E2E Member 9' });
  await expect(mine).toHaveCount(2);
  await expect(mine.first().locator('img.output')).toBeVisible();
  // The Library detail of a Try On image switches between the result and the before/after slider.
  await mine.first().getByRole('button', { name: 'Xem chi tiết' }).click();
  const lightbox = page.getByRole('dialog', { name: /^Chi tiết: / });
  const compareToggle = lightbox.getByRole('button', { name: 'So sánh trước/sau' });
  await expect(compareToggle).toHaveAttribute('aria-pressed', 'false');
  await compareToggle.click();
  await expect(lightbox.getByRole('slider', { name: 'So sánh trước và sau' })).toBeVisible();
  await expect(lightbox.getByRole('img', { name: /^Ảnh gốc person\.png$/ })).toBeVisible();
  await compareToggle.click();
  await expect(lightbox.getByRole('slider')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(lightbox).toHaveCount(0);
  await page.getByRole('group', { name: 'Loại' }).getByRole('button', { name: 'Tạo ảnh', exact: true }).click();
  await expect(mine).toHaveCount(0);
  await page.getByRole('group', { name: 'Loại' }).getByRole('button', { name: 'Tất cả video', exact: true }).click();
  await expect(mine).toHaveCount(0);

  // Ví dụ shows the company's try-on outputs once an Admin put them there.
  await addExamples(browser, jobs.jobs.map((j) => j.id));
  await nav(page).getByRole('link', { name: 'Thử đồ' }).click();
  await page.getByRole('tab', { name: 'Ví dụ' }).click();
  const gallery = page.getByRole('group', { name: 'Ảnh thử đồ của công ty' });
  await expect(gallery.getByRole('img').first()).toBeVisible();
  await expect.poll(() => gallery.getByRole('img').first().evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0)).toBe(true); // decoded, not just in the DOM
  // The company's results lead the fixed samples: the first tile of the first column is one of them.
  await expect(gallery.locator('.masonry-col').first().locator('.gallery-item a').first()).toHaveAttribute('href', /^\/api\/assets\//);
  await page.getByRole('tab', { name: 'Giới thiệu' }).click();
  await expect(page.getByRole('heading', { name: 'Thử đồ trên người mẫu' })).toBeVisible();

  // The two try-on jobs of this user must not show in Create's video history (an unfiltered Tray would list them).
  await nav(page).getByRole('link', { name: 'Tạo video' }).click();
  await expect(page).toHaveURL(/\/create$/); // Try On has a History tab too; wait for Create's
  await page.getByRole('tab', { name: 'Lịch sử' }).click();
  await expect(page.getByText('Chưa có lượt tạo nào.')).toBeVisible();
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
    for (const [name, data, type] of files) await settled(() => each(name, data, type), name);
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
    await expect(detail.getByRole('list', { name: 'Ảnh đầu vào' }).getByRole('listitem')).toHaveCount(3);
    await expect(detail.locator('.job-text')).toHaveText(details.brief);
    await expect(detail.locator('.job-chips')).toHaveText(['1K3:4', 'Seamless White']);
    await expect(detail.locator('.lightbox-media img')).toHaveAttribute('src', '/api/samples/try-on-example-1.jpg');

    // As on Fash, each piece goes on the form on its own, with a note: a garment, the background, the words, a chip, the result as the model photo.
    const note = (text: string) => page.getByRole('region', { name: 'Thông báo' }).getByText(text);
    await detail.getByRole('button', { name: 'Ảnh đầu vào 2' }).click();
    await expect(note('Đã thêm trang phục')).toBeVisible();
    await expect(page.getByLabel('Trang phục: ảnh đã chọn').getByRole('img', { name: 'try-on-example-1-garment-1.png' })).toBeVisible();
    await detail.getByRole('button', { name: 'Seamless White' }).click();
    await expect(note('Đã chọn bối cảnh')).toBeVisible();
    await expect(page.getByLabel('Bối cảnh (tuỳ chọn): ảnh đã chọn').getByRole('img', { name: 'try-on-bg-test.jpg' })).toBeVisible();
    await detail.getByRole('button', { name: 'Chép vào ô mô tả' }).click();
    await expect(page.getByRole('textbox', { name: 'Mô tả (tuỳ chọn)' })).toHaveValue(details.brief);
    await detail.getByRole('button', { name: '3:4', exact: true }).click();
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
    await expect(page.getByRole('textbox', { name: 'Mô tả (tuỳ chọn)' })).toHaveValue(details.brief);
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
    for (const [name, data, type] of files) await settled(() => each(name, data, type), name);
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
    const chosen = page.getByRole('list', { name: 'Ảnh tham chiếu: ảnh đã chọn' });
    await detail.getByRole('button', { name: 'Ảnh đầu vào 1' }).click();
    await expect(chosen.getByRole('img', { name: 'image-example-1-input-1.png' })).toBeVisible();
    await detail.getByRole('button', { name: 'Dùng kết quả' }).click(); // the result as one more input
    await expect(chosen.getByRole('img')).toHaveCount(2);
    await detail.getByRole('button', { name: 'Dùng lại' }).click();
    await expect(page.getByRole('textbox', { name: 'Mô tả', exact: true })).toHaveValue(details.prompt);
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
    await page.getByRole('textbox', { name: 'Mô tả', exact: true }).fill('');
    await tile.hover();
    await tile.getByRole('button', { name: 'Dùng lại' }).click();
    await expect(page.getByRole('textbox', { name: 'Mô tả', exact: true })).toHaveValue(details.prompt);
    await expect(chosen.getByRole('img')).toHaveCount(1);
  } finally {
    await asAdmin((name) => page.request.delete(`/api/admin/samples/${name}`));
  }
});

test('Image Generation: the form counts the prompt near the model limit, and a switch to a smaller limit keeps the text while Run waits', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signIn(page, 'imgp');
  await page.goto('/image-generation');
  const form = page.locator('.imagebar');
  const run = form.getByRole('button', { name: /^Tạo ảnh/ });
  const prompt = form.getByRole('textbox', { name: 'Mô tả', exact: true });
  const count = form.locator('.prompt-count'); // the prompt box's own count, as on Try On and Create video; nothing repeats it over Run
  await form.getByLabel('Ảnh tham chiếu', { exact: true }).setInputFiles(file('reference.png'));
  await expect(form.getByRole('img', { name: 'reference.png' })).toBeVisible();
  await expect(modelButton(page)).toContainText('Mock image E2E');
  await prompt.fill('x'.repeat(1500));
  await expect(count).toHaveText('1500/2000');
  await expect(count).not.toHaveAttribute('data-near'); // 75% of 2000
  await expect(form.locator('.form-message').getByText(/ký tự$/)).toHaveCount(0);
  const text = 'x'.repeat(1700);
  await prompt.fill(text);
  await expect(count).toHaveText('1700/2000');
  await expect(count).not.toHaveAttribute('data-near'); // 85%: the box marks the count from 90%
  await expect(run).toBeEnabled();

  await modelButton(page).click();
  await page.getByRole('option', { name: /Mock image Solo/ }).click();
  await expect(modelButton(page)).toContainText('Mock image Solo');
  await expect(prompt).toHaveValue(text);
  await expect(count).toHaveText('1700/1000');
  await expect(count).toHaveAttribute('data-near');
  await expect(run).toBeDisabled();
  await expect(form.locator('.form-message').getByRole('status')).toHaveText('Mô hình Mock image Solo nhận tối đa 1000 ký tự, hãy rút gọn hoặc chọn mô hình khác.');
});

test('Image Generation: the form needs a prompt (and an image only on a model with no text-to-image), every pill works by keyboard, and a mock run reaches History and the Tạo ảnh chip', async ({ page, browser }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signIn(page, 'member10');
  await nav(page).getByRole('link', { name: 'Tạo ảnh' }).click();
  await expect(page).toHaveURL(/\/image-generation$/);
  await expect(page.getByRole('tab', { name: 'Ví dụ' })).toHaveAttribute('aria-selected', 'true');

  const form = page.locator('.imagebar');
  const run = form.getByRole('button', { name: /^Tạo ảnh/ });
  const reason = form.locator('.form-message').getByRole('status');
  await expect(modelButton(page)).toContainText('Mock image E2E');
  await expect(run).toBeDisabled();
  await expect(reason).toHaveText('Nhập mô tả cảnh bạn muốn tạo.'); // the mock model makes a picture from words alone, as Fash's text-to-image examples
  await form.getByRole('textbox', { name: 'Mô tả', exact: true }).fill('a red shirt on a hanger');
  await expect(run).toBeEnabled();
  await expect(reason).toHaveCount(0);
  await form.getByLabel('Ảnh tham chiếu', { exact: true }).setInputFiles(file('reference.png'));
  await expect(form.getByRole('img', { name: 'reference.png' })).toBeVisible();
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
  await expect(form.getByRole('button', { name: 'Tải lên Ảnh tham chiếu' })).toHaveCount(0); // one image, and it is there
  await page.keyboard.press('Enter');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Enter');
  await expect(modelButton(page)).toContainText('Mock image E2E');
  await expect(ratio).toHaveAttribute('data-value', '1:1'); // back on the roomy model, the earlier choice returns

  // Enhance sits in the form, on by default; the job stores the member's choice (a mock job is never rewritten).
  const enhance = form.getByRole('button', { name: 'Cải thiện mô tả bằng AI' });
  await expect(enhance).toHaveAttribute('aria-pressed', 'true');
  await enhance.click();
  await expect(enhance).toHaveText('Cải thiện: tắt');

  await run.click();
  await expect(page.getByText('Đã gửi lượt tạo')).toBeVisible();
  const sent = ((await (await page.request.get('/api/jobs?mine')).json()) as { jobs: { id: string }[] }).jobs[0]!;
  expect(await (await page.request.get(`/api/jobs/${sent.id}`)).json()).toMatchObject({ prompt: 'a red shirt on a hanger', enhance: false, enhancedPrompt: null });
  // The same settings again ask first, as Fash's "Run Again?"; Huỷ sends nothing.
  await run.click();
  const again = page.getByRole('dialog', { name: 'Chạy lại đúng các cài đặt vừa gửi?' });
  await expect(again).toBeVisible();
  await again.getByRole('button', { name: 'Huỷ' }).click();
  await expect(again).toBeHidden();
  expect(((await (await page.request.get('/api/jobs?mine')).json()) as { jobs: unknown[] }).jobs).toHaveLength(1);
  await expect(page.getByRole('tab', { name: 'Lịch sử' })).toHaveAttribute('aria-selected', 'true');
  await expect(toast(page, 'Ảnh đã xong')).toBeVisible({ timeout: 60_000 });
  const tray = page.getByRole('complementary', { name: 'Lượt tạo của tôi' });
  await expect(tray.getByText('Hoàn tất')).toHaveCount(1);
  await expect(tray.locator('.job-chips').first().locator('button')).toHaveText(['2K', '1:1']);

  // Once an Admin put it there, Ví dụ holds the image, and the Library files it under Tạo ảnh and Tất cả ảnh, not under Thử đồ or the videos.
  await addExamples(browser, [sent.id]);
  await page.getByRole('tab', { name: 'Ví dụ' }).click();
  const gallery = page.getByRole('group', { name: 'Ảnh của công ty' });
  await expect(gallery.getByRole('img').first()).toBeVisible();
  await expect.poll(() => gallery.getByRole('img').first().evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0)).toBe(true); // decoded, not just in the DOM
  await libraryChip(page, 'Tạo ảnh');
  const mine = page.getByRole('article').filter({ hasText: 'E2E Member 10' });
  await expect(mine).toHaveCount(1);
  await expect(mine.getByText('Mock image E2E', { exact: true })).toBeVisible(); // the ratio and resolution are in its detail view
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
  const form = page.locator('.imagebar');
  await form.getByRole('textbox', { name: 'Mô tả', exact: true }).fill('a linen dress on a sunny balcony');
  await form.getByRole('button', { name: /^Tạo ảnh/ }).click();
  await page.getByRole('tab', { name: 'Lịch sử' }).click();
  const card = page.getByRole('complementary', { name: 'Lượt tạo của tôi' }).getByRole('listitem').filter({ hasText: 'a linen dress on a sunny balcony' });
  await expect(card.getByText('Hoàn tất')).toBeVisible({ timeout: 60_000 });

  await page.route(/\/api\/image-models\?feature=image/, async (r) => {
    const body = (await (await r.fetch()).json()) as { models: Record<string, unknown>[] };
    await r.fulfill({ json: { models: body.models.map((m) => ({ ...m, textToImage: false })) } });
  });
  await page.reload();
  await form.getByRole('textbox', { name: 'Mô tả', exact: true }).fill('a linen dress');
  await expect(form.locator('.form-message').getByRole('status')).toHaveText('Mô hình này cần ít nhất 1 ảnh tham chiếu.');
  await expect(form.getByRole('button', { name: /^Tạo ảnh/ })).toBeDisabled();
});

test('Image Generation: with words alone on a model that needs an image, one click picks the best model that makes pictures from words', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.route(/\/api\/image-models\?feature=image/, async (r) => {
    const body = (await (await r.fetch()).json()) as { models: { id: string }[] };
    await r.fulfill({ json: { models: body.models.map((m) => ({ ...m, textToImage: m.id === 'mock-image-solo', recommended: m.id === 'mock-image-e2e' })) } });
  });
  await signIn(page, 'member10');
  await page.goto('/image-generation');
  const form = page.locator('.imagebar');
  await expect(modelButton(page)).toContainText('Mock image E2E');
  await expect(form.locator('.form-message').getByRole('status')).toHaveText('Mô hình này cần ít nhất 1 ảnh tham chiếu.');
  await form.getByRole('button', { name: 'Dùng Mock image Solo' }).click(); // not switched silently: the member picks it
  await expect(modelButton(page)).toContainText('Mock image Solo');
  await expect(form.getByRole('button', { name: /^Dùng Mock/ })).toHaveCount(0);
  await form.getByRole('textbox', { name: 'Mô tả', exact: true }).fill('a linen dress on a sunny balcony');
  await expect(form.getByRole('button', { name: /^Tạo ảnh/ })).toBeEnabled();
});

test('Image Generation: a cap refusal shows its message in Vietnamese', async ({ page }) => {
  await signIn(page, 'member10');
  await page.route(/\/api\/jobs$/, (r) => (r.request().method() === 'POST' ? r.fulfill({ status: 429, json: { error: 'Bạn đã dùng hết hạn mức chi phí hôm nay' } }) : r.fallback()));
  await page.goto('/image-generation');
  const form = page.locator('.imagebar');
  await expect(form.getByLabel('Ảnh tham chiếu', { exact: true })).toBeEnabled(); // a fresh load: the input is disabled until hydration
  await form.getByLabel('Ảnh tham chiếu', { exact: true }).setInputFiles(file('reference.png'));
  await form.getByRole('textbox', { name: 'Mô tả', exact: true }).fill('a bottle');
  await form.getByRole('button', { name: /^Tạo ảnh/ }).click();
  await expect(form.getByRole('alert')).toHaveText('Bạn đã dùng hết hạn mức chi phí hôm nay');
});

test("geometry at 1440: the Try On card is 360 wide at x=288, and Image Generation's prompt bar floats 920 wide at the foot of the screen over its full-width gallery, whose last row ends above it", async ({ page, browser }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signIn(page, 'member11');
  // Ten images from the mock model, put on Ví dụ below, so the gallery is taller than the screen. Two each from five members: the queue runs two
  // per member at a time, so one member's ten queued in five rounds and took over a minute.
  const makers = [page];
  for (const who of ['geoa', 'geob', 'geoc', 'geod'] as const) {
    const maker = await (await browser.newContext()).newPage();
    await signIn(maker, who);
    makers.push(maker);
  }
  const ids: string[] = [];
  for (const [k, maker] of makers.entries()) {
    const up = await maker.request.post('/api/assets', { multipart: { file: file('ref.png') } });
    const assetId = ((await up.json()) as { assets: { id: string }[] }).assets[0]!.id;
    for (let i = 0; i < 2; i++) {
      const job = await maker.request.post('/api/jobs', { data: { feature: 'image', modelId: 'mock-image-e2e', assetIds: [assetId], prompt: `scene ${k * 2 + i}`, ratio: 'auto', params: { resolution: '1K' } } });
      expect(job.status()).toBe(201);
      ids.push(((await job.json()) as { id: string }).id);
    }
  }

  await page.goto('/try-on');
  const card = page.locator('.form-card');
  const c = await box(card);
  near(c.x, 288, 'card x');
  near(c.y, 16, 'card y');
  near(c.width, 360, 'card width');
  near(c.height, 976, 'card height');
  expect(await card.evaluate((el) => getComputedStyle(el).borderTopLeftRadius)).toBe('24px');
  const tabs = await box(page.getByRole('tablist'));
  expect(tabs.y).toBeLessThan(40);
  expect(tabs.x + tabs.width / 2).toBeGreaterThan(c.x + c.width);
  near((await box(page.locator('.runbar'))).height, 73, 'run wrapper height');
  // Three slots, then the model picker, the prompt, the resolution and the ratio, in the order of the reference.
  await expect(page.locator('.form-scroll .field-label')).toHaveText(['Trang phục', 'Người mẫu', 'Bối cảnh (tuỳ chọn)', 'Mô hình', 'Mô tả (tuỳ chọn)', 'Độ phân giải', 'Tỉ lệ']);
  for (const slot of await page.locator('.slot').all()) near((await box(slot)).width, 308, 'slot width');
  // The live rhythm: the when-to-use hint at the top of the form, the first label 12 px under it, 32 px between one picture tray and the next label.
  const labels = page.locator('.form-scroll .field-label'), slots = page.locator('.slot');
  const hint = await box(page.getByRole('complementary', { name: 'Khi nào dùng Thử đồ' }));
  near(hint.y, (await box(page.locator('.form-scroll'))).y, 'hint y', 1);
  near((await box(labels.first())).y, hint.y + hint.height + 12, 'first label y', 1);
  for (const i of [0, 1]) {
    const tray = await box(slots.nth(i));
    near((await box(labels.nth(i + 1))).y - (tray.y + tray.height), 32, 'tray to next label', 1);
  }
  near((await box(page.locator('.prompt-box'))).height, 161, 'prompt box height', 1); // the 76 px text, one row of starter chips and the toolbar

  const succeeded = async (maker: Page) => ((await (await maker.request.get('/api/jobs?mine')).json()) as { jobs: { id: string; status: string }[] }).jobs.filter((j) => ids.includes(j.id) && j.status === 'succeeded').length;
  await expect.poll(async () => (await Promise.all(makers.map(succeeded))).reduce((a, b) => a + b, 0), { timeout: 120_000 }).toBe(10);
  for (const maker of makers.slice(1)) await maker.context().close();
  await addExamples(browser, ids);
  await page.goto('/image-generation');
  const gallery = page.getByRole('group', { name: 'Ảnh của công ty' });
  await expect(gallery.getByRole('img').first()).toBeVisible();
  await expect.poll(() => gallery.getByRole('img').first().evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0)).toBe(true); // decoded, not just in the DOM
  // No left-column card: Fash's prompt bar, 920 wide and centred on the page's column (x 288 to 1392), 24 px off the foot of the screen, under tabs centred on the same column.
  await expect(page.locator('.form-card')).toHaveCount(0);
  const bar = page.locator('.imagebar');
  const f = await box(bar);
  near(f.width, 920, 'bar width');
  near(f.x + f.width / 2, 288 + 1104 / 2, 'bar centre');
  near(f.y + f.height, 1000 - 24, 'bar bottom');
  expect(await bar.evaluate((el) => getComputedStyle(el).borderTopLeftRadius)).toBe('24px');
  const imageTabs = await box(page.getByRole('tablist'));
  near(imageTabs.x + imageTabs.width / 2, 288 + 1104 / 2, 'tabs centre');
  // The bar is pinned while the gallery scrolls under it; at the end of the page the gallery spans the column and its last row is on screen above the bar.
  await page.evaluate(() => window.scrollTo(0, 400));
  near((await box(bar)).y, f.y, 'pinned bar y');
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const end = await box(bar);
  near(end.y + end.height, 1000 - 24, 'bar bottom at the end');
  const tiles = await page.locator('.gallery-item').evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).map((r) => ({ left: r.left, right: r.right, bottom: r.bottom })));
  near(Math.min(...tiles.map((t) => t.left)), 288, 'gallery left');
  expect(Math.max(...tiles.map((t) => t.right))).toBeLessThanOrEqual(1392 + 1);
  expect(Math.max(...tiles.map((t) => t.bottom))).toBeLessThanOrEqual(end.y);
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
      // Both pages stack into the Create-style tabs with their Run button inside the screen, across the card, which has 16 px gutters; Image
      // Generation's card is its prompt bar, whose Run spans the bar inside its 16 px padding and 1 px border.
      for (const [path, name] of [['/try-on', /^Thử đồ/], ['/image-generation', /^Tạo ảnh/]] as const) {
        await page.goto(path);
        await expect(page.getByRole('tab')).toHaveText(['Tạo', 'Lịch sử', 'Ví dụ', 'Giới thiệu']);
        const run = await box(page.getByRole('button', { name }));
        expect(run.y + run.height, path).toBeLessThanOrEqual(height);
        near(run.width, path === '/try-on' ? 358 : 358 - 2 * 17, `${path} run width`, 1);
      }
      // The model panel opens inside the screen.
      await modelButton(page).click();
      const panel = await box(page.getByRole('dialog', { name: 'Chọn mô hình' }));
      expect(panel.x).toBeGreaterThanOrEqual(0);
      expect(panel.x + panel.width).toBeLessThanOrEqual(390);
      expect(panel.y).toBeGreaterThanOrEqual(0);
      expect(panel.y + panel.height).toBeLessThanOrEqual(height);
    }
  });
}

test('Try On: the sample pictures in an empty slot upload like a picked file, and give way to the slot image until it is removed', async ({ page }) => {
  const names = ['try-on-garment-1.png', 'try-on-garment-2.png', 'try-on-model-1.png', 'try-on-background-1.png'];
  const asAdmin = async (each: (name: string) => Promise<{ ok(): boolean }>) => {
    await page.context().clearCookies();
    await signIn(page, 'admin');
    for (const name of names) await settled(() => each(name), name);
    await page.context().clearCookies();
  };
  await asAdmin((name) => page.request.put(`/api/admin/samples/${name}`, { data: png(), headers: { 'content-type': 'image/png' } }));
  try {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await signIn(page, 'member9');
    await gotoTryOn(page);
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
    const copied = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/assets/samples' && r.request().method() === 'POST');
    await page.getByRole('button', { name: 'Dùng ảnh mẫu 2 cho Trang phục' }).click();
    expect((await copied).status()).toBe(201); // copied on the server, not downloaded and uploaded back
    await expect(page.getByLabel('Trang phục: ảnh đã chọn').getByRole('img', { name: 'try-on-garment-2.png' })).toBeVisible();
    await expect(samplesOf('Trang phục')).toHaveCount(0);
    await expect(run).toBeDisabled();
    await page.getByRole('button', { name: 'Dùng ảnh mẫu 1 cho Người mẫu' }).click();
    await expect(page.getByLabel('Người mẫu: ảnh đã chọn').getByRole('img', { name: 'try-on-model-1.png' })).toBeVisible();
    await expect(run).toBeEnabled(); // the copies are the caller's own input assets, so they count as the run's images

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
    for (const name of names) await settled(() => each(name), name);
    await page.context().clearCookies();
  };
  await asAdmin((name) => page.request.put(`/api/admin/samples/${name}`, { data: jpg(), headers: { 'content-type': 'image/jpeg' } }));
  try {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await signIn(page, 'pickera');
    await page.goto('/try-on');
    const chosen = (slot: string) => page.getByLabel(`${slot}: ảnh đã chọn`).getByRole('img');
    // Each slot opens its picker once the sample list is in; until then it is an own-file upload.
    for (const slot of ['Người mẫu', 'Trang phục', 'Bối cảnh (tuỳ chọn)']) await expect(page.getByRole('button', { name: `Tải lên ${slot}` })).toHaveAttribute('aria-haspopup', 'dialog');

    // The tiles show small thumbnails of the samples; a pick still copies the full sample by its name.
    const thumbnail = page.waitForResponse((r) => r.url().endsWith('/api/samples/try-on-stock-model-10.jpg?thumb=1'));
    await page.getByRole('button', { name: 'Tải lên Người mẫu' }).click();
    const models = page.getByRole('dialog', { name: 'Chọn người mẫu' });
    await expect(models.getByRole('button', { name: 'Người mẫu có sẵn 1' }).locator('img')).toHaveAttribute('src', '/api/samples/try-on-stock-model-10.jpg?thumb=1');
    expect((await thumbnail).headers()['content-type']).toBe('image/webp');
    await models.getByRole('button', { name: 'Người mẫu có sẵn 1' }).click();
    const poses = page.getByRole('dialog', { name: 'Chọn tư thế' });
    await expect(poses.getByRole('button', { name: 'Tư thế 1' }).locator('img')).toHaveAttribute('src', '/api/samples/try-on-stock-model-10-pose-2.jpg?thumb=1');
    // A pose step takes no upload of one's own: the chosen model heads it, and "Không chọn tư thế" (the photo as it is) comes first.
    await expect(poses.getByText('Tải lên ảnh của bạn')).toHaveCount(0);
    await expect(poses.locator('.pose-head img')).toHaveAttribute('src', '/api/samples/try-on-stock-model-10.jpg?thumb=1');
    await expect(poses.locator('.model-grid > *').first()).toHaveAccessibleName('Không chọn tư thế');
    await poses.getByRole('button', { name: 'Quay lại' }).click(); // back to the models, as Fash's arrow
    await models.getByRole('button', { name: 'Người mẫu có sẵn 1' }).click();
    // The photo is copied on the server as the member's own input; a note says so until it is in, so a slow copy never looks like nothing happened.
    const loadingNote = page.getByRole('region', { name: 'Thông báo' }).getByText('Đang tải ảnh...');
    await page.route('**/api/assets/samples', async (r) => (r.request().method() === 'POST' ? (await new Promise((done) => setTimeout(done, 1500)), r.continue()) : r.continue()));
    const copied = (names: string[]) => page.waitForRequest((r) => new URL(r.url()).pathname === '/api/assets/samples' && r.method() === 'POST' && JSON.stringify(r.postDataJSON().names) === JSON.stringify(names));
    const pose = copied(['try-on-stock-model-10-pose-2.jpg']);
    await poses.getByRole('button', { name: 'Tư thế 1' }).click();
    await pose;
    await expect(poses).toBeHidden();
    await expect(loadingNote).toBeVisible();
    await expect(chosen('Người mẫu')).toHaveCount(1);
    await expect(loadingNote).toBeHidden();
    await page.unroute('**/api/assets/samples');

    await page.getByRole('button', { name: 'Tải lên Trang phục' }).click();
    await expect(page.getByRole('dialog', { name: 'Chọn trang phục' }).getByRole('button', { name: 'Áo' }).locator('img')).toHaveAttribute('src', '/api/samples/try-on-stock-top.jpg?thumb=1');
    await expect(page.getByRole('dialog', { name: 'Chọn trang phục' }).getByRole('button', { name: 'Áo' }).locator('.photo-caption')).toHaveText('Áo'); // a category's name on its tile
    await page.getByRole('dialog', { name: 'Chọn trang phục' }).getByRole('button', { name: 'Áo' }).click();
    const garment = copied(['try-on-stock-top-1.jpg']);
    await page.getByRole('dialog', { name: 'Áo' }).getByRole('button', { name: 'Áo 1' }).click();
    await garment;
    await expect(chosen('Trang phục')).toHaveCount(1);
    await page.getByRole('button', { name: 'Tải lên Trang phục' }).click(); // a slot with room opens the picker again
    await expect(page.getByRole('dialog', { name: 'Chọn trang phục' })).toBeVisible();
    await page.keyboard.press('Escape');

    await page.getByRole('button', { name: 'Tải lên Bối cảnh (tuỳ chọn)' }).click();
    await expect(page.getByRole('dialog', { name: 'Chọn bối cảnh' }).getByRole('button', { name: 'New York Streets' }).locator('img')).toHaveAttribute('src', '/api/samples/try-on-bg-new-york.jpg?thumb=1');
    await expect(page.getByRole('dialog', { name: 'Chọn bối cảnh' }).getByRole('button', { name: 'New York Streets' }).locator('.photo-caption')).toHaveText('New York Streets');
    const background = copied(['try-on-bg-new-york.jpg']);
    await page.getByRole('dialog', { name: 'Chọn bối cảnh' }).getByRole('button', { name: 'New York Streets' }).click();
    await background;
    await expect(chosen('Bối cảnh (tuỳ chọn)')).toHaveCount(1);
    await expect(page.getByRole('region', { name: 'Thông báo' }).getByText('Đã chọn bối cảnh')).toBeVisible();

    // My models, as on Fash: the model photo of an earlier Try On job, under its own heading in the model picker.
    const up = async (name: string) => ((await (await page.request.post('/api/assets', { multipart: { file: { name, mimeType: 'image/png', buffer: png() } } })).json()) as { assets: { id: string }[] }).assets[0]!.id;
    const done = await page.request.post('/api/jobs', { data: { feature: 'try_on', modelId: 'mock-image-e2e', assetIds: [await up('my-model.png'), await up('my-garment.png')], ratio: 'auto', prompt: '', enhance: false, params: { resolution: '1K', garments: '1' } } });
    expect(done.status(), await done.text()).toBe(201);
    await page.reload();
    await expect(page.getByRole('button', { name: 'Tải lên Người mẫu' })).toHaveAttribute('aria-haspopup', 'dialog');
    await page.getByRole('button', { name: 'Tải lên Người mẫu' }).click();
    const mine = page.getByRole('dialog', { name: 'Chọn người mẫu' }).getByRole('region', { name: 'Người mẫu của tôi' });
    await mine.getByRole('button', { name: 'Dùng lại my-model.png' }).click();
    await expect(page.getByLabel('Người mẫu: ảnh đã chọn').getByRole('img', { name: 'my-model.png' })).toBeVisible();
  } finally {
    await asAdmin((name) => page.request.delete(`/api/admin/samples/${name}`));
  }
});

test("Try On, as Fash's model catalog: the filter chips narrow the named portraits, a portrait goes on to the pose step, the pose rides the run's prompt and params, and the pose chip opens the same pictures, every pose by name where it has none", async ({ page }) => {
  const names = ['try-on-portrait-woman-isla.jpg', 'try-on-portrait-man-kai.jpg', 'try-on-pose-woman-front.jpg', 'try-on-pose-woman-hand-on-hip.jpg'];
  const asAdmin = async (each: (name: string) => Promise<{ ok(): boolean }>) => {
    await page.context().clearCookies();
    await signIn(page, 'admin');
    for (const name of names) await settled(() => each(name), name);
    await page.context().clearCookies();
  };
  await asAdmin((name) => page.request.put(`/api/admin/samples/${name}`, { data: jpg(), headers: { 'content-type': 'image/jpeg' } }));
  try {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await signIn(page, 'tryposea');
    await gotoTryOn(page);
    // The pose chip in the Model slot is a button that opens the pose step's pictures (named "Tư thế: <pose>").
    const poseChip = page.getByRole('group', { name: 'Người mẫu', exact: true }).getByRole('button', { name: /^Tư thế: / });
    await expect(page.getByRole('button', { name: 'Tải lên Người mẫu' })).toHaveAttribute('aria-haspopup', 'dialog');
    await expect(poseChip).toHaveCount(0); // no model photo yet

    await page.getByRole('button', { name: 'Tải lên Người mẫu' }).click();
    const models = page.getByRole('dialog', { name: 'Chọn người mẫu' });
    await expect(models.getByRole('button', { name: /^Người mẫu (Isla|Kai)$/ })).toHaveCount(2);
    await expect(models.getByRole('button', { name: 'Người mẫu Isla' }).locator('.photo-caption')).toHaveText('Isla'); // the model's name on its card, as Fash's
    // Fash's filters are compact chips that name the filter until a value is picked.
    await expect(select(page, 'Giới tính')).toHaveText('Giới tính');
    await selectValue(page, 'Giới tính', 'man');
    await expect(select(page, 'Giới tính')).toHaveText('Nam');
    await expect(models.getByRole('button', { name: 'Người mẫu Isla' })).toHaveCount(0);
    await expect(models.getByRole('button', { name: 'Người mẫu Kai' })).toHaveCount(1);
    await selectValue(page, 'Giới tính', '');
    await models.getByRole('button', { name: 'Người mẫu Isla' }).click();

    // Fash's pose step: the chosen model beside the question, "Không chọn tư thế" first, then every pose, each named: a picture where her gender has one.
    const poses = page.getByRole('dialog', { name: 'Chọn tư thế' });
    await expect(poses.getByText('Người mẫu tạo dáng thế nào?')).toBeVisible();
    await expect(poses.locator('.pose-head img')).toHaveAttribute('src', '/api/samples/try-on-portrait-woman-isla.jpg?thumb=1');
    await expect(poses.getByText('Tải lên ảnh của bạn')).toHaveCount(0); // a pose is no photo of one's own
    await expect(poses.locator('.model-grid > *').first()).toHaveAccessibleName('Không chọn tư thế');
    await expect(poses.getByRole('button', { name: 'Không chọn tư thế' })).toHaveAccessibleDescription('Bạn có thể tả tư thế trong ô Mô tả. (Tuỳ chọn)');
    await expect(poses.getByRole('button', { name: 'Không chọn tư thế' })).toHaveAttribute('aria-pressed', 'true'); // no pose yet
    await expect(poses.getByRole('button', { name: /^(Mặt trước|Tay chống hông)$/ })).toHaveCount(2);
    await expect(poses.getByRole('button', { name: 'Tay chống hông' }).locator('.photo-caption')).toHaveText('Tay chống hông');
    await expect(poses.getByRole('button', { name: 'Mặt trước' }).locator('img')).toHaveAttribute('src', '/api/samples/try-on-pose-woman-front.jpg?thumb=1');
    await expect(poses.locator('.model-grid > button')).toHaveCount(POSES.length + 1); // no pose is left out for want of a picture
    await expect(poses.getByRole('button', { name: 'Quỳ một gối' })).toHaveClass('photo-name'); // no picture yet: its name
    await expect(poses.getByRole('button', { name: 'Quỳ một gối' })).toHaveText('Quỳ một gối');
    await poses.getByRole('button', { name: 'Tay chống hông' }).click();
    await expect(poses).toBeHidden();
    await expect(page.getByLabel('Người mẫu: ảnh đã chọn').getByRole('img', { name: 'try-on-portrait-woman-isla.jpg' })).toBeVisible();
    await expect(poseChip).toHaveAttribute('data-value', 'hand-on-hip');
    // The pose is a chip beside the photo in the Model slot, as Fash's "Hand on Hip x".
    await expect(poseChip).toHaveAccessibleName('Tư thế: Tay chống hông');

    await page.getByLabel('Ảnh trang phục').setInputFiles({ name: 'pose-garment.png', mimeType: 'image/png', buffer: png() });
    await page.getByRole('button', { name: /^Thử đồ/ }).click();
    await expect(page.getByText('Đã gửi lượt tạo')).toBeVisible();
    const sent = ((await (await page.request.get('/api/jobs?mine')).json()) as { jobs: { id: string }[] }).jobs[0]!;
    const job = (await (await page.request.get(`/api/jobs/${sent.id}`)).json()) as { prompt: string; pose: string };
    expect(job.pose).toBe('hand-on-hip');
    expect(job.prompt).toContain('show them in this pose and framing: standing facing the camera with one hand on the hip');

    // The chip's x drops the pose and keeps the focus on the chip, which offers a pose again.
    await page.getByRole('button', { name: 'Bỏ tư thế' }).click();
    await expect(poseChip).toHaveAttribute('data-value', '');
    await expect(poseChip).toHaveAccessibleName('Tư thế: Chọn tư thế');
    await expect(poseChip).toBeFocused();
    // From the keyboard, the chip opens the pose step's pictures for the photo already in the slot: a pick sets the pose and copies no photo again.
    const copies: string[] = [];
    page.on('request', (r) => void (r.method() === 'POST' && new URL(r.url()).pathname === '/api/assets/samples' && copies.push(r.url())));
    await page.keyboard.press('Enter');
    await expect(poses).toBeVisible();
    await expect(poses.getByRole('button', { name: 'Quay lại' })).toHaveCount(0); // opened from the chip: nothing to go back to
    await expect(poses.locator('.pose-head img')).toBeVisible(); // the slot's own photo
    await expect(poses.getByRole('button', { name: 'Không chọn tư thế' })).toHaveAttribute('aria-pressed', 'true');
    await poses.getByRole('button', { name: 'Tay chống hông' }).click();
    await expect(poses).toBeHidden();
    await expect(poseChip).toHaveAttribute('data-value', 'hand-on-hip');
    await expect(poseChip).toBeFocused(); // the dialog hands the focus back to the chip
    await expect(page.getByLabel('Người mẫu: ảnh đã chọn').getByRole('img', { name: 'try-on-portrait-woman-isla.jpg' })).toBeVisible();
    expect(copies).toEqual([]);
    // Opened again, the chosen pose is the marked one.
    await poseChip.click();
    await expect(poses.getByRole('button', { name: 'Tay chống hông' })).toHaveAttribute('aria-pressed', 'true');
    await expect(poses.getByRole('button', { name: 'Không chọn tư thế' })).toHaveAttribute('aria-pressed', 'false');
    await page.keyboard.press('Escape');
    await expect(poses).toBeHidden();
    await expect(poseChip).toHaveAttribute('data-value', 'hand-on-hip');

    // Không chọn tư thế keeps the portrait and drops the pose; the full one-photo slot is emptied first, so it opens the picker again.
    await page.getByRole('button', { name: 'Bỏ ảnh try-on-portrait-woman-isla.jpg' }).click();
    await page.getByRole('button', { name: 'Tải lên Người mẫu' }).click();
    await models.getByRole('button', { name: 'Người mẫu Isla' }).click();
    await poses.getByRole('button', { name: 'Không chọn tư thế' }).click();
    await expect(poses).toBeHidden();
    await expect(page.getByLabel('Người mẫu: ảnh đã chọn').getByRole('img', { name: 'try-on-portrait-woman-isla.jpg' })).toBeVisible();
    await expect(poseChip).toHaveAttribute('data-value', '');

    // Kai is a man, and no man's pose has a picture here: his pick goes straight to the slot, and the chip still offers every pose by its name.
    await page.getByRole('button', { name: 'Bỏ ảnh try-on-portrait-woman-isla.jpg' }).click();
    await page.getByRole('button', { name: 'Tải lên Người mẫu' }).click();
    await models.getByRole('button', { name: 'Người mẫu Kai' }).click();
    await expect(page.getByLabel('Người mẫu: ảnh đã chọn').getByRole('img', { name: 'try-on-portrait-man-kai.jpg' })).toBeVisible();
    await poseChip.click();
    await expect(poses.locator('.model-grid > button')).toHaveCount(POSES.length + 1);
    await expect(poses.locator('.model-grid img')).toHaveCount(0);
    const hip = poses.getByRole('button', { name: 'Tay chống hông' });
    await expect(hip).toHaveClass('photo-name');
    await hip.click();
    await expect(poses).toBeHidden();
    await expect(poseChip).toHaveAttribute('data-value', 'hand-on-hip');
    await expect(poseChip).toHaveAccessibleName('Tư thế: Tay chống hông');
    await expect(poseChip).toBeFocused(); // a click focused the chip, so the dialog handed the focus back to it

    // On a 390 px phone: the filter chips stay inside the dialog, 2 tiles a row, and no tile's words are cut nor a caption hides the photo.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('tab', { name: 'Tạo' }).click(); // the narrow page's form tab (the run above opened History)
    await page.getByRole('button', { name: 'Bỏ ảnh try-on-portrait-man-kai.jpg' }).click();
    await page.getByRole('button', { name: 'Tải lên Người mẫu' }).click();
    const inside = async (dialog: Locator, items: Locator) => {
      const d = await box(dialog);
      for (const item of await items.all()) {
        const b = await box(item);
        expect(b.x >= d.x && b.x + b.width <= d.x + d.width + 0.5, `${await item.innerText()} at ${b.x}+${b.width} in ${d.x}+${d.width}`).toBe(true);
      }
    };
    const unclipped = (loc: Locator) => loc.evaluate((el) => el.scrollWidth <= el.clientWidth + 1 && el.scrollHeight <= el.clientHeight + 1);
    const noSideways = (loc: Locator) => loc.evaluate((el) => el.scrollWidth <= el.clientWidth + 1);
    const captionShare = async (tile: Locator) => (await box(tile.locator('.photo-caption'))).height / (await box(tile)).height;
    await expect(models.locator('.portrait-filter .select-trigger')).toHaveCount(4);
    await inside(models, models.locator('.portrait-filter .select-trigger'));
    expect(await noSideways(models)).toBe(true);
    expect(await captionShare(models.getByRole('button', { name: 'Người mẫu Isla' }))).toBeLessThan(0.5);
    for (const tile of await models.locator('.model-upload, .model-grid > button:not(:has(img))').all()) expect(await unclipped(tile), await tile.innerText()).toBe(true); // the upload and create tiles
    await models.getByRole('button', { name: 'Người mẫu Isla' }).click();
    const tops = await poses.locator('.model-grid > button').evaluateAll((els) => els.slice(0, 3).map((el) => Math.round(el.getBoundingClientRect().top)));
    expect(tops[1] === tops[0] && tops[2]! > tops[0]!, `tile tops ${tops.join(', ')}`).toBe(true); // 2 a row
    expect(await unclipped(poses.getByRole('button', { name: 'Không chọn tư thế' }))).toBe(true);
    for (const tile of await poses.locator('.model-grid > button.photo-name').all()) expect(await unclipped(tile), await tile.innerText()).toBe(true);
    expect(await captionShare(poses.getByRole('button', { name: 'Tay chống hông' }))).toBeLessThan(0.5);
    expect(await noSideways(poses)).toBe(true);
    await page.keyboard.press('Escape');
    await expect(poses).toBeHidden();
    // Kai's poses are words alone: two a row as well, none cut.
    await page.getByRole('button', { name: 'Tải lên Người mẫu' }).click();
    await models.getByRole('button', { name: 'Người mẫu Kai' }).click();
    await poseChip.click();
    const wordTops = await poses.locator('.model-grid > button').evaluateAll((els) => els.slice(0, 3).map((el) => Math.round(el.getBoundingClientRect().top)));
    expect(wordTops[1] === wordTops[0] && wordTops[2]! > wordTops[0]!, `tile tops ${wordTops.join(', ')}`).toBe(true);
    for (const tile of await poses.locator('.model-grid > button').all()) expect(await unclipped(tile), await tile.innerText()).toBe(true);
    await page.keyboard.press('Escape');
    await expect(poses).toBeHidden();
  } finally {
    await asAdmin((name) => page.request.delete(`/api/admin/samples/${name}`));
  }
});

test('an upload says why it failed: a wrong format or a file over 10 MB before anything is sent, the server reading the bytes, or the network', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signIn(page, 'loada');
  const posts: string[] = [];
  page.on('request', (r) => void (r.method() === 'POST' && new URL(r.url()).pathname === '/api/assets' && posts.push(r.url())));
  await page.goto('/image-generation');
  const form = page.locator('.imagebar');
  const input = form.getByLabel('Ảnh tham chiếu', { exact: true });
  await expect(modelButton(page)).toContainText('Mock image E2E');
  await input.setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') });
  await expect(form.getByRole('alert')).toHaveText('Ảnh "notes.txt" không đúng định dạng: chỉ nhận JPEG, PNG hoặc WebP.');
  await input.setInputFiles({ name: 'big.png', mimeType: 'image/png', buffer: Buffer.alloc(10 * 1024 * 1024 + 1) });
  await expect(form.getByRole('alert')).toHaveText('Ảnh "big.png" quá lớn: tối đa 10 MB.');
  expect(posts).toEqual([]); // both refused in the browser

  await input.setInputFiles({ name: 'fake.png', mimeType: 'image/png', buffer: Buffer.from('not a picture') });
  await expect(form.getByRole('alert')).toHaveText('Ảnh không đúng định dạng: chỉ nhận JPEG, PNG hoặc WebP.'); // the server's 415
  expect(posts).toHaveLength(1);

  await page.route('**/api/assets', (r) => r.abort());
  await input.setInputFiles(file('ok.png'));
  await expect(form.getByRole('alert')).toHaveText('Không tải ảnh lên được do lỗi mạng hoặc máy chủ. Hãy thử lại.');
  await expect(form.getByRole('img', { name: 'ok.png' })).toHaveCount(0);
});
