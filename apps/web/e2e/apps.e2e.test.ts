import { expect, type Page, test } from '@playwright/test';
import { expectOptions, modelButton, png, select, selectValue, signIn } from './support.test';

const nav = (page: Page) => page.getByRole('navigation', { name: 'Điều hướng chính' });
const file = (name: string) => ({ name, mimeType: 'image/png', buffer: png() });
const toast = (page: Page, text: string) => page.getByRole('region', { name: 'Thông báo' }).getByText(text);
const cards = (page: Page) => page.getByRole('list', { name: 'Danh sách ứng dụng' }).getByRole('link');
const fits = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
const runButton = (page: Page) => page.getByRole('button', { name: /^Chạy/ });

/** The Run button's reason, shown under the form. */
const reasonOf = (page: Page) => page.locator('.form-message').getByRole('status');

/** Opens an app by its card on the index; the first click can land before hydration, so the URL is awaited. */
async function openApp(page: Page, name: string, slug: string): Promise<void> {
  await nav(page).getByRole('link', { name: 'Ứng dụng' }).click();
  await expect(page).toHaveURL(/\/apps$/);
  await cards(page).filter({ hasText: name }).first().click();
  await expect(page).toHaveURL(new RegExp(`/apps/${slug}$`));
  await expect(runButton(page)).toBeVisible();
}

async function libraryApps(page: Page): Promise<void> {
  await nav(page).getByRole('link', { name: 'Thư viện' }).click();
  const chip = page.getByRole('group', { name: 'Loại' }).getByRole('button', { name: 'Ứng dụng', exact: true });
  await chip.click();
  await expect(chip).toHaveAttribute('aria-pressed', 'true');
}

test('the index lists nine apps, and the search box and the chips filter the cards', async ({ page }) => {
  await signIn(page, 'appsa');
  await nav(page).getByRole('link', { name: 'Ứng dụng' }).click();
  await expect(page).toHaveURL(/\/apps$/);
  await expect(page.getByRole('heading', { name: 'Ứng dụng', level: 1 })).toBeVisible();
  await expect(nav(page).getByRole('link', { name: 'Ứng dụng' })).toHaveAttribute('aria-current', 'page');
  await expect(cards(page).locator('strong')).toHaveText([
    'Đổi nhân vật', 'Đổi người mẫu', 'Đổi nền', 'Đổi khung hình', 'Tăng độ phân giải', 'Đổi khuôn mặt', 'Xoá nền', 'Điều khiển chuyển động', 'Tối ưu media',
  ]);
  await expect(cards(page).filter({ hasText: 'Sắp có' })).toHaveCount(1);

  const chips = page.getByRole('group', { name: 'Danh mục' });
  await expect(chips.getByRole('button')).toHaveText(['Tất cả', 'Thời trang', 'Chỉnh ảnh', 'Video', 'Tiện ích']);
  const filter = async (name: string, expected: string[]) => {
    await chips.getByRole('button', { name, exact: true }).click();
    await expect(chips.getByRole('button', { name, exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(cards(page).locator('strong')).toHaveText(expected);
  };
  await filter('Thời trang', ['Đổi nhân vật', 'Đổi người mẫu', 'Đổi khuôn mặt']);
  await filter('Chỉnh ảnh', ['Đổi nền', 'Đổi khung hình', 'Tăng độ phân giải', 'Xoá nền']);
  await filter('Video', ['Điều khiển chuyển động']);
  await filter('Tiện ích', ['Tối ưu media']);
  await filter('Tất cả', ['Đổi nhân vật', 'Đổi người mẫu', 'Đổi nền', 'Đổi khung hình', 'Tăng độ phân giải', 'Đổi khuôn mặt', 'Xoá nền', 'Điều khiển chuyển động', 'Tối ưu media']);

  // The search matches the name and the description, with or without accents, and combines with a chip.
  const search = page.getByRole('searchbox', { name: 'Tìm ứng dụng' });
  await search.fill('doi nen');
  await expect(cards(page).locator('strong')).toHaveText(['Đổi nền']);
  await search.fill('PNG trong suốt');
  await expect(cards(page).locator('strong')).toHaveText(['Xoá nền']);
  await search.fill('khuôn mặt');
  await filter('Thời trang', ['Đổi khuôn mặt']);
  await filter('Video', []);
  await expect(page.getByText('Không có ứng dụng nào khớp.')).toBeVisible();
  await search.fill('');
  await filter('Tất cả', ['Đổi nhân vật', 'Đổi người mẫu', 'Đổi nền', 'Đổi khung hình', 'Tăng độ phân giải', 'Đổi khuôn mặt', 'Xoá nền', 'Điều khiển chuyển động', 'Tối ưu media']);
});

test('an unknown app is a 404, and the app that is not built says "Sắp có" and why', async ({ page }) => {
  await signIn(page, 'appsa');
  const missing = await page.goto('/apps/no-such-app');
  expect(missing?.status()).toBe(404);
  await expect(runButton(page)).toHaveCount(0);

  await page.goto('/apps');
  await cards(page).filter({ hasText: 'Tối ưu media' }).click();
  await expect(page).toHaveURL(/\/apps\/media-optimizer$/);
  await expect(page.getByText('Sắp có')).toBeVisible();
  await expect(page.getByText(/bản cập nhật kế tiếp/)).toBeVisible();
});

test('Background Remover (one slot): Run needs the image, a mock job reaches History and the Library under Ứng dụng with the app name', async ({ page }) => {
  await signIn(page, 'appsa');
  await openApp(page, 'Xoá nền', 'background-remover');
  await expect(page.getByRole('group', { name: 'Ảnh', exact: true })).toBeVisible();
  await expect(page.locator('.slot')).toHaveCount(1);
  await expect(runButton(page)).toBeDisabled();
  await expect(reasonOf(page)).toHaveText('Tải lên ảnh: Ảnh.');
  await expect(page.getByRole('combobox')).toHaveCount(0); // no ratio or resolution field, and one model needs no picker
  await expect(page.getByRole('textbox')).toHaveCount(0);

  await page.getByLabel('Ảnh cần xoá nền').setInputFiles(file('product.png'));
  await expect(page.getByRole('img', { name: 'product.png' })).toBeVisible();
  await expect(runButton(page)).toBeEnabled();
  await expect(runButton(page)).toContainText('$0.0000'); // a mock model books nothing
  await runButton(page).click();
  await expect(page.getByText('Đã gửi job')).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Lịch sử' })).toHaveAttribute('aria-selected', 'true');
  await expect(toast(page, 'Ảnh đã xong')).toBeVisible({ timeout: 60_000 });
  const tray = page.getByRole('complementary', { name: 'Job của tôi' });
  await expect(tray.getByText('Hoàn tất')).toHaveCount(1);

  const jobs = (await (await page.request.get('/api/jobs?mine')).json()) as { jobs: { id: string; feature: string }[] };
  expect(jobs.jobs.map((j) => j.feature)).toEqual(['background_remover']);
  const detail = (await (await page.request.get(`/api/jobs/${jobs.jobs[0]!.id}`)).json()) as { prompt: string };
  expect(detail.prompt).toBe('Remove the background.');

  await libraryApps(page);
  const mine = page.getByRole('article').filter({ hasText: 'E2E Apps A' });
  await expect(mine).toHaveCount(1);
  await expect(mine.getByText('Xoá nền', { exact: true })).toBeVisible();
  await expect(mine.locator('img.output')).toBeVisible();
});

test('Face Swap (two slots): each required slot has its reason, and a mock job takes the source face, then the target', async ({ page }) => {
  await signIn(page, 'appsa');
  await openApp(page, 'Đổi khuôn mặt', 'face-swap');
  await expect(page.locator('.slot')).toHaveCount(2);
  await expect(page.getByRole('group', { name: 'Khuôn mặt nguồn' })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Ảnh đích' })).toBeVisible();
  await expect(runButton(page)).toBeDisabled();
  await expect(reasonOf(page)).toHaveText('Tải lên ảnh: Khuôn mặt nguồn.');

  await page.getByLabel('Ảnh khuôn mặt nguồn').setInputFiles(file('source.png'));
  await expect(page.getByRole('img', { name: 'source.png' })).toBeVisible();
  await expect(runButton(page)).toBeDisabled();
  await expect(reasonOf(page)).toHaveText('Tải lên ảnh: Ảnh đích.');

  await page.locator('input[type=file][aria-label="Ảnh đích"]').setInputFiles(file('target.png'));
  await expect(page.getByRole('img', { name: 'target.png' })).toBeVisible();
  await expect(runButton(page)).toBeEnabled();
  await runButton(page).click();
  await expect(toast(page, 'Ảnh đã xong')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole('complementary', { name: 'Job của tôi' }).getByText('Hoàn tất')).toHaveCount(1);

  const jobs = (await (await page.request.get('/api/jobs?mine')).json()) as { jobs: { id: string; feature: string }[] };
  const job = jobs.jobs.find((j) => j.feature === 'face_swap')!;
  const detail = (await (await page.request.get(`/api/jobs/${job.id}`)).json()) as { prompt: string; images: { filename: string }[] };
  expect(detail.images.map((i) => i.filename)).toEqual(['source.png', 'target.png']);
  expect(detail.prompt).toBe('Swap the face from the first image onto the person in the second image.');

  await libraryApps(page);
  await expect(page.getByRole('article').filter({ hasText: 'E2E Apps A' }).filter({ hasText: 'Đổi khuôn mặt' })).toHaveCount(1);
});

test('Reframe (a field): the ratio field comes from the model, and the chosen ratio is the one the job carries', async ({ page }) => {
  await signIn(page, 'appsb');
  await openApp(page, 'Đổi khung hình', 'reframe');
  await expect(page.locator('.slot')).toHaveCount(1);
  await expect(select(page, 'Tỉ lệ')).toBeVisible();
  await expect(select(page, 'Độ phân giải')).toHaveCount(0);
  await expect(runButton(page)).toBeDisabled();
  await expect(reasonOf(page)).toHaveText('Tải lên ảnh: Ảnh.');

  await page.getByLabel('Ảnh cần đổi khung').setInputFiles(file('photo.png'));
  await selectValue(page, 'Tỉ lệ', '1:1');
  await expect(select(page, 'Tỉ lệ')).toHaveAttribute('data-value', '1:1');
  await runButton(page).click();
  await expect(toast(page, 'Ảnh đã xong')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole('complementary', { name: 'Job của tôi' }).getByText(/^1:1 · 1K · /)).toBeVisible();
  const jobs = (await (await page.request.get('/api/jobs?mine')).json()) as { jobs: { feature: string; ratio: string }[] };
  expect(jobs.jobs.map((j) => [j.feature, j.ratio])).toEqual([['reframe', '1:1']]);
});

test('Image Upscale shows the resolution field and Background Changer follows its prompt-or-reference rule', async ({ page }) => {
  await signIn(page, 'appsb');
  await openApp(page, 'Tăng độ phân giải', 'image-upscale');
  await expect(select(page, 'Độ phân giải')).toBeVisible();
  await expect(select(page, 'Tỉ lệ')).toHaveCount(0);
  await page.getByLabel('Ảnh cần tăng độ phân giải').setInputFiles(file('small.png'));
  await selectValue(page, 'Độ phân giải', '4K');
  await expect(select(page, 'Độ phân giải')).toHaveAttribute('data-value', '4K');

  await openApp(page, 'Đổi nền', 'background-changer');
  await expect(page.locator('.slot')).toHaveCount(2);
  const description = page.getByRole('textbox', { name: 'Mô tả nền (tuỳ chọn)' });
  await page.getByLabel('Ảnh cần đổi nền').setInputFiles(file('model.png'));
  await expect(page.getByRole('img', { name: 'model.png' })).toBeVisible();
  await expect(runButton(page)).toBeDisabled();
  await expect(reasonOf(page)).toHaveText('Nhập mô tả nền mới hoặc tải lên ảnh nền tham chiếu.');
  await description.fill('một quán cà phê đầy nắng');
  await expect(runButton(page)).toBeEnabled();
  await page.locator('input[type=file][aria-label="Ảnh nền tham chiếu"]').setInputFiles(file('cafe.png'));
  await expect(page.getByRole('img', { name: 'cafe.png' })).toBeVisible();
  await expect(runButton(page)).toBeDisabled();
  await expect(reasonOf(page)).toHaveText('Chọn mô tả nền hoặc ảnh nền tham chiếu, không dùng cả hai.');
  await description.fill('');
  await expect(runButton(page)).toBeEnabled();
});

test('a priced model: Upscale shows its price and stores the chosen resolution, Reframe offers its own ratios and stores the chosen one', async ({ page }) => {
  await signIn(page, 'appsc');
  const jobs = async () => ((await (await page.request.get('/api/jobs?mine')).json()) as { jobs: { feature: string; ratio: string; resolution: string | null }[] }).jobs;
  const pickPriced = async () => {
    await modelButton(page).click();
    await page.getByRole('option', { name: /Mock apps priced/ }).click();
    await expect(modelButton(page)).toContainText('Mock apps priced');
  };

  await openApp(page, 'Tăng độ phân giải', 'image-upscale');
  await expect(modelButton(page)).toContainText('Mock apps E2E'); // the free model sorts first, so the other specs keep it
  await pickPriced();
  await page.getByLabel('Ảnh cần tăng độ phân giải').setInputFiles(file('small.png'));
  await expectOptions(page, 'Độ phân giải', ['2K', '4K']);
  await expect(select(page, 'Độ phân giải')).toHaveAttribute('data-value', '2K');
  await expect(runButton(page)).toContainText('$0.0800');
  await selectValue(page, 'Độ phân giải', '4K');
  await expect(runButton(page)).toContainText('$0.0800');
  await runButton(page).click();
  await expect(page.getByText('Đã gửi job')).toBeVisible();
  await expect.poll(async () => (await jobs()).filter((j) => j.feature === 'image_upscale').map((j) => j.resolution)).toEqual(['4K']);

  await openApp(page, 'Đổi khung hình', 'reframe');
  await pickPriced();
  await expectOptions(page, 'Tỉ lệ', ['1:1', '16:9']); // no "Tự động": Reframe needs a target ratio
  await expect(select(page, 'Tỉ lệ')).toHaveAttribute('data-value', '1:1');
  await page.getByLabel('Ảnh cần đổi khung').setInputFiles(file('photo.png'));
  await expect(runButton(page)).toContainText('$0.0800');
  await selectValue(page, 'Tỉ lệ', '16:9');
  await runButton(page).click();
  await expect(page.getByText('Đã gửi job')).toBeVisible();
  await expect.poll(async () => (await jobs()).filter((j) => j.feature === 'reframe').map((j) => [j.ratio, j.resolution])).toEqual([['16:9', '2K']]);
});

test('the swaps take an optional prompt that is added to their fixed instruction', async ({ page }) => {
  await signIn(page, 'appsc');
  await openApp(page, 'Đổi nhân vật', 'character-swap');
  const prompt = page.getByRole('textbox', { name: 'Prompt (tuỳ chọn)' });
  await page.locator('input[type=file][aria-label="Ảnh nhân vật mới"]').setInputFiles(file('new.png'));
  await page.locator('input[type=file][aria-label="Ảnh đích"]').setInputFiles(file('target.png'));
  await expect(runButton(page)).toBeEnabled(); // the prompt is not required
  await prompt.fill('keep the red hat');
  await runButton(page).click();
  await expect(page.getByText('Đã gửi job')).toBeVisible();
  const mine = (await (await page.request.get('/api/jobs?mine')).json()) as { jobs: { id: string; feature: string }[] };
  const detail = (await (await page.request.get(`/api/jobs/${mine.jobs.find((j) => j.feature === 'character_swap')!.id}`)).json()) as { prompt: string };
  expect(detail.prompt).toBe('replace the whole person in the second image with the person from the first image, keep the background. keep the red hat');
  await openApp(page, 'Đổi người mẫu', 'model-swap');
  await expect(page.getByRole('textbox', { name: 'Prompt (tuỳ chọn)' })).toBeVisible();
  await openApp(page, 'Đổi khuôn mặt', 'face-swap');
  await expect(page.getByRole('textbox')).toHaveCount(0);
});

test('the change-app menu returns focus to its button on Escape, closes when focus leaves it, and shows a focus ring', async ({ page }) => {
  await signIn(page, 'appsc');
  await openApp(page, 'Đổi khuôn mặt', 'face-swap');
  const change = page.getByRole('button', { name: 'Đổi ứng dụng' });
  const list = page.getByRole('list', { name: 'Ứng dụng' });
  await expect(async () => {
    await change.focus();
    await page.keyboard.press('Enter');
    await expect(change).toHaveAttribute('aria-expanded', 'true', { timeout: 1_000 });
  }).toPass();
  await page.keyboard.press('Tab');
  await expect(list.getByRole('link').first()).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(list).toBeHidden();
  await expect(change).toBeFocused();
  expect(await change.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe('solid'); // the ring is drawn on the dark card
  expect(await change.evaluate((el) => getComputedStyle(el).outlineColor)).toBe('rgb(255, 255, 255)');

  await page.keyboard.press('Enter');
  await expect(list).toBeVisible();
  await page.getByRole('button', { name: 'Tải lên Khuôn mặt nguồn' }).focus(); // focus moves outside the menu
  await expect(list).toBeHidden();
});

test('each upload button names its slot, and the tray shows only beside the coming-soon pages', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signIn(page, 'appsc');
  const tray = page.getByRole('complementary', { name: 'Job của tôi' });
  await page.goto('/apps/face-swap');
  await expect(page.getByRole('button', { name: 'Tải lên Khuôn mặt nguồn' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Tải lên Ảnh đích' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Tải lên', exact: true })).toHaveCount(0);
  await expect(tray).toHaveCount(0); // the page has its own History tab

  await page.goto('/apps');
  await expect(page.getByRole('list', { name: 'Danh sách ứng dụng' })).toBeVisible();
  await expect(tray).toHaveCount(0); // the card grid takes the full width, as on the live site
  await page.goto('/apps/media-optimizer');
  await expect(page.getByText('Sắp có')).toBeVisible();
  await expect(tray).toBeVisible();
});

/** An MP4 whose header gives `ms` (ftyp, then moov holding a version 0 mvhd with timescale 1000): the server reads only the header. */
function mp4(ms: number): Buffer {
  const b = Buffer.alloc(64);
  const box = (at: number, len: number, type: string) => (b.writeUInt32BE(len, at), b.write(type, at + 4, 'latin1'));
  box(0, 16, 'ftyp');
  b.write('isom', 8, 'latin1');
  box(16, 36, 'moov');
  box(24, 28, 'mvhd');
  b.writeUInt32BE(1000, 44);
  b.writeUInt32BE(ms, 48);
  box(52, 12, 'mdat');
  return b;
}

test('Motion Control: the image and the reference video, a length check, and a Run that sends both with ratio auto', async ({ page }) => {
  await signIn(page, 'appsa');
  const durationsSec = Array.from({ length: 28 }, (_, i) => i + 3);
  const model = (id: string, label: string, usd: string) => ({ id, label, isMock: false, supported: true, estimateUsd: usd, durationsSec, score: 50, recommended: false });
  await page.route(/\/api\/models\?feature=motion_control/, (r) => {
    const seconds = Number(new URL(r.request().url()).searchParams.get('durationSec'));
    return r.fulfill({ json: { models: [model('kling-v3-motion-pro', 'Kling V3 Motion Control Pro', (0.168 * seconds).toFixed(4)), model('kling-v3-motion-standard', 'Kling V3 Motion Control Standard', (0.126 * seconds).toFixed(4))], defaultModelId: 'kling-v3-motion-standard' } });
  });
  let sent: Record<string, unknown> | null = null;
  await page.route('**/api/jobs', (r) => {
    if (r.request().method() !== 'POST') return r.fallback();
    sent = r.request().postDataJSON() as Record<string, unknown>;
    return r.fulfill({ status: 201, json: { id: 'motion-1', status: 'queued' } });
  });
  await openApp(page, 'Điều khiển chuyển động', 'motion-control');
  await expect(page.getByText('Sắp có')).toHaveCount(0);
  await expect(reasonOf(page)).toHaveText('Tải lên ảnh: Nhân vật.');
  await page.getByLabel('Ảnh nhân vật').setInputFiles(file('dancer.png'));
  await expect(page.getByRole('img', { name: 'dancer.png' })).toBeVisible();
  await expect(reasonOf(page)).toHaveText('Tải lên video mẫu.');

  await page.getByLabel('Video chuyển động mẫu').setInputFiles({ name: 'short.mp4', mimeType: 'video/mp4', buffer: mp4(1900) });
  await expect(page.getByText('short.mp4 · 1.9 giây')).toBeVisible();
  await expect(reasonOf(page)).toHaveText('Video mẫu phải dài từ 3 đến 30 giây.');
  await expect(runButton(page)).toBeDisabled();

  await page.getByRole('button', { name: 'Bỏ video short.mp4' }).click();
  await page.getByLabel('Video chuyển động mẫu').setInputFiles({ name: 'dance.mp4', mimeType: 'video/mp4', buffer: mp4(5400) });
  await expect(page.getByText('dance.mp4 · 5.4 giây')).toBeVisible();
  await expect(reasonOf(page)).toHaveCount(0);
  await expect(runButton(page)).toHaveText(/\$0\.7560/); // the recommended Standard model, 6 s
  // The long model name stays inside the form: the picker is a grid item, which would otherwise grow to its text.
  const picker = (await page.locator('.select-trigger').boundingBox())!;
  const form = (await page.locator('.form-scroll').boundingBox())!;
  expect(picker.x + picker.width).toBeLessThanOrEqual(form.x + form.width);
  await runButton(page).click();
  await expect(page.getByText('Đã gửi job. Theo dõi trong tab "Lịch sử".')).toBeVisible();
  expect(sent).toMatchObject({ feature: 'motion_control', modelId: 'kling-v3-motion-standard', ratio: 'auto' });
  expect((sent as unknown as { assetIds: string[] }).assetIds).toHaveLength(2);
  expect(sent).not.toHaveProperty('prompt');
});

test('Run is disabled with a reason when the app has no enabled model, and "Đổi ứng dụng" switches app with a fresh form', async ({ page }) => {
  await signIn(page, 'appsb');
  await page.route(/\/api\/image-models\?feature=model_swap/, (r) => r.fulfill({ json: { models: [] } }));
  await openApp(page, 'Đổi người mẫu', 'model-swap');
  await expect(reasonOf(page)).toHaveText('Ứng dụng này chưa được Admin bật');
  await expect(runButton(page)).toBeDisabled();
  await page.getByLabel('Ảnh người mẫu mới').setInputFiles(file('a.png'));
  await page.locator('input[type=file][aria-label="Ảnh đích"]').setInputFiles(file('b.png'));
  await expect(page.getByRole('img', { name: 'b.png' })).toBeVisible();
  await expect(reasonOf(page)).toHaveText('Ứng dụng này chưa được Admin bật');
  await expect(runButton(page)).toBeDisabled();

  const change = page.getByRole('button', { name: 'Đổi ứng dụng' });
  await expect(async () => {
    await change.click();
    await expect(change).toHaveAttribute('aria-expanded', 'true', { timeout: 1_000 });
  }).toPass();
  const list = page.getByRole('list', { name: 'Ứng dụng' });
  await expect(list.getByRole('link')).toHaveCount(9);
  await expect(list.getByRole('link', { name: 'Đổi người mẫu' })).toHaveAttribute('aria-current', 'page');
  await page.keyboard.press('Escape');
  await expect(list).toBeHidden();
  await change.click();
  await list.getByRole('link', { name: 'Đổi nhân vật' }).click();
  await expect(page).toHaveURL(/\/apps\/character-swap$/);
  await expect(page.getByRole('img', { name: 'a.png' })).toHaveCount(0); // a new app starts with empty slots
  await expect(reasonOf(page)).toHaveText('Tải lên ảnh: Nhân vật mới.');
});

for (const [width, height, columns] of [[390, 844, 2], [1024, 768, 2], [1440, 1000, 3], [800, 900, 2], [1920, 1080, 5]] as const) {
  test(`at ${width} px the index has ${columns} column(s) and the app pages fit the width in every tab`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await signIn(page, 'appsb');
    await page.goto('/apps');
    await expect(cards(page)).toHaveCount(9);
    const lefts = await cards(page).evaluateAll((els) => new Set(els.map((e) => Math.round(e.getBoundingClientRect().left))).size);
    expect(lefts).toBe(columns);
    expect(await fits(page)).toBe(true);

    for (const slug of ['character-swap', 'background-changer', 'reframe', 'motion-control']) {
      await page.goto(`/apps/${slug}`);
      await expect(page.getByRole('tab').first()).toBeVisible();
      for (const tab of await page.getByRole('tab').all()) {
        await tab.click();
        expect(await fits(page), `${slug} ${await tab.textContent()}`).toBe(true);
      }
    }

    if (width === 390) {
      // The form tab holds the header card, the slots and Run inside the screen.
      await page.goto('/apps/character-swap');
      await expect(page.getByRole('tab')).toHaveText(['Tạo', 'Lịch sử', 'Giới thiệu']);
      const run = await runButton(page).boundingBox();
      expect(run!.y + run!.height).toBeLessThanOrEqual(height);
      expect(run!.x + run!.width).toBeLessThanOrEqual(width);
    }
  });
}
