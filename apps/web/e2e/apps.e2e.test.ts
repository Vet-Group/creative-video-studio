import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import { expectOptions, jpg, modelButton, openTab, png, select, selectValue, settled, signIn } from './support.test';

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

test('the index lists eighteen apps, and the search box and the chips filter the cards', async ({ page }) => {
  await signIn(page, 'appsa');
  await nav(page).getByRole('link', { name: 'Ứng dụng' }).click();
  await expect(page).toHaveURL(/\/apps$/);
  await expect(page.getByRole('heading', { name: 'Ứng dụng', level: 1 })).toBeVisible();
  await expect(nav(page).getByRole('link', { name: 'Ứng dụng' })).toHaveAttribute('aria-current', 'page');
  await expect(cards(page).locator('strong')).toHaveText([
    'Đổi nhân vật', 'Đổi người mẫu', 'Đổi nền', 'Đổi khung hình', 'Tăng độ phân giải', 'Đổi khuôn mặt', 'Xoá nền', 'Điều khiển chuyển động', 'Tối ưu media', 'Thử trang sức', 'Thử đồ lót', 'Tạo người mẫu AI', 'Ảnh nhiều góc', 'Đổi giống chó hàng loạt', 'Chân dung thú cưng', 'Mockup hàng loạt', 'Đổi tên hàng loạt', 'Tạo tư thế người mẫu',
  ]);
  await expect(cards(page).filter({ hasText: 'Sắp có' })).toHaveCount(0);

  const chips = page.getByRole('group', { name: 'Danh mục' });
  await expect(chips.getByRole('button')).toHaveText(['Tất cả', 'Thời trang', 'Chỉnh ảnh', 'Video', 'Tiện ích']);
  const filter = async (name: string, expected: string[]) => {
    await chips.getByRole('button', { name, exact: true }).click();
    await expect(chips.getByRole('button', { name, exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(cards(page).locator('strong')).toHaveText(expected);
  };
  await filter('Thời trang', ['Đổi nhân vật', 'Đổi người mẫu', 'Đổi khuôn mặt', 'Thử trang sức', 'Thử đồ lót', 'Tạo người mẫu AI', 'Tạo tư thế người mẫu']);
  await filter('Chỉnh ảnh', ['Đổi nền', 'Đổi khung hình', 'Tăng độ phân giải', 'Xoá nền', 'Ảnh nhiều góc', 'Đổi giống chó hàng loạt', 'Chân dung thú cưng', 'Mockup hàng loạt', 'Đổi tên hàng loạt']);
  await filter('Video', ['Điều khiển chuyển động']);
  await filter('Tiện ích', ['Tối ưu media']);
  await filter('Tất cả', ['Đổi nhân vật', 'Đổi người mẫu', 'Đổi nền', 'Đổi khung hình', 'Tăng độ phân giải', 'Đổi khuôn mặt', 'Xoá nền', 'Điều khiển chuyển động', 'Tối ưu media', 'Thử trang sức', 'Thử đồ lót', 'Tạo người mẫu AI', 'Ảnh nhiều góc', 'Đổi giống chó hàng loạt', 'Chân dung thú cưng', 'Mockup hàng loạt', 'Đổi tên hàng loạt', 'Tạo tư thế người mẫu']);

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
  await filter('Tất cả', ['Đổi nhân vật', 'Đổi người mẫu', 'Đổi nền', 'Đổi khung hình', 'Tăng độ phân giải', 'Đổi khuôn mặt', 'Xoá nền', 'Điều khiển chuyển động', 'Tối ưu media', 'Thử trang sức', 'Thử đồ lót', 'Tạo người mẫu AI', 'Ảnh nhiều góc', 'Đổi giống chó hàng loạt', 'Chân dung thú cưng', 'Mockup hàng loạt', 'Đổi tên hàng loạt', 'Tạo tư thế người mẫu']);
});

test('an unknown app is a 404, and Media Optimizer opens its image tool', async ({ page }) => {
  await signIn(page, 'appsa');
  const missing = await page.goto('/apps/no-such-app');
  expect(missing?.status()).toBe(404);
  await expect(runButton(page)).toHaveCount(0);

  await page.goto('/apps');
  await cards(page).filter({ hasText: 'Tối ưu media' }).click();
  await expect(page).toHaveURL(/\/apps\/media-optimizer$/);
  await expect(page.getByRole('heading', { name: 'Tối ưu media', level: 1 })).toBeAttached();
  await expect(page.getByText('Ảnh được xử lý ngay trên thiết bị, không tải lên máy chủ. Chưa hỗ trợ video MP4/WEBM.', { exact: true })).toBeVisible();
});

test('Media Optimizer: the app layout with a Free Run, a session-only History tab and the long About', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signIn(page, 'appsa');
  await page.goto('/apps/media-optimizer');
  const width = page.getByLabel('Chiều rộng (px)');
  await expect(page.getByRole('button', { name: 'Đổi ứng dụng' })).toBeVisible();
  await expect(page.getByRole('tab')).toHaveText(['Lịch sử', 'Giới thiệu']);
  await expect(page.getByRole('heading', { name: 'Nén, đổi cỡ và đổi định dạng ảnh ngay trên thiết bị' })).toBeVisible();
  await expect(runButton(page)).toBeDisabled();
  await expect(runButton(page)).toContainText('Miễn phí');
  await expect(reasonOf(page)).toHaveText('Thêm một ảnh để bắt đầu.');
  await expect(width).toBeDisabled();

  await page.getByLabel('Ảnh cần tối ưu').setInputFiles(file('shot.png'));
  await expect(page.getByRole('img', { name: 'shot.png' })).toBeVisible();
  await expect(width).toHaveValue('8');
  await width.fill('4');
  await expect(page.getByLabel('Chiều cao (px)')).toHaveValue('4'); // the ratio is kept
  await runButton(page).click();
  await expect(page.getByRole('tab', { name: 'Lịch sử' })).toHaveAttribute('aria-selected', 'true');
  const history = page.getByRole('complementary', { name: 'Kết quả trong phiên này' });
  await expect(history).toContainText('không lưu vào Thư viện');
  await expect(history.getByRole('link', { name: 'Tải xuống' })).toHaveAttribute('download', 'shot-optimized.webp');
  await expect(history).toContainText('4 × 4 px');

  await page.getByRole('tab', { name: 'Giới thiệu' }).click();
  await runButton(page).click(); // a second run, at the same size
  await expect(history.getByRole('link', { name: 'Tải xuống' })).toHaveCount(2);

  await page.setViewportSize({ width: 390, height: 900 });
  await expect(page.getByRole('tab')).toHaveText(['Tạo', 'Lịch sử', 'Giới thiệu']);
  expect(await fits(page)).toBe(true);
});

test('Media Optimizer: removing the image during a run frees the form instead of leaving Run busy', async ({ page }) => {
  await page.addInitScript(() => {
    // A slow encoder, so the image can be removed while the run is still in flight.
    const encode = HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.toBlob = function (this: HTMLCanvasElement, ...args: Parameters<typeof encode>) {
      setTimeout(() => encode.apply(this, args), 1500);
    };
  });
  await signIn(page, 'appsa');
  await page.goto('/apps/media-optimizer');
  // Hydrated first: a file set while the page hydrates is dropped, or (before the app fix) its decode was dropped by the dev-only effect re-run.
  await expect(page.getByLabel('Ảnh cần tối ưu')).toBeEnabled();
  await page.getByLabel('Ảnh cần tối ưu').setInputFiles(file('shot.png'));
  await expect(runButton(page)).toBeEnabled();
  await runButton(page).click();
  const busy = page.getByRole('button', { name: 'Đang xử lý…' });
  await expect(busy).toBeVisible();
  await page.getByRole('button', { name: 'Bỏ ảnh shot.png' }).click();
  await expect(busy).toHaveCount(0);
  await expect(runButton(page)).toBeVisible();
  await expect(reasonOf(page)).toHaveText('Thêm một ảnh để bắt đầu.');
  await page.getByLabel('Ảnh cần tối ưu').setInputFiles(file('shot.png'));
  await expect(runButton(page)).toBeEnabled(); // the next image runs again
});

test('Background Remover takes several photos: one shows whole with a corner tile to add more, and Run sends one job per photo under one batch id', async ({ page }) => {
  await signIn(page, 'bulka');
  await openApp(page, 'Xoá nền', 'background-remover');
  const slot = page.getByRole('group', { name: 'Ảnh', exact: true });
  await page.getByLabel('Ảnh cần xoá nền').setInputFiles(file('product.png'));
  await expect(slot.getByRole('img', { name: 'product.png' })).toBeVisible();
  await expect(page.locator('.slot[data-one]')).toHaveCount(1); // one photo shows whole, as on a one-photo app
  await expect(slot.getByRole('button', { name: 'Tải lên Ảnh' })).toBeVisible(); // and its corner tile adds more
  await expect(page.getByText('1/25')).toBeVisible();
  await expect(page.getByText(/ảnh ×/)).toHaveCount(0); // one photo is one job, priced as before

  await page.getByLabel('Ảnh cần xoá nền').setInputFiles([file('small.png'), file('model.png')]);
  await expect(page.locator('.slot[data-one]')).toHaveCount(0);
  await expect(page.getByText('3/25')).toBeVisible();
  await expect(page.getByText('3 ảnh × $0.00 = $0.00')).toBeVisible();
  await runButton(page).click();
  await expect(page.getByText('Đã gửi lượt tạo')).toBeVisible();
  const jobs = (await (await page.request.get('/api/jobs?mine')).json()) as { jobs: { feature: string; batch: string | null }[] };
  expect(jobs.jobs.map((j) => j.feature)).toEqual(['background_remover', 'background_remover', 'background_remover']);
  expect(new Set(jobs.jobs.map((j) => j.batch)).size).toBe(1);
  expect(jobs.jobs[0]!.batch).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
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
  await expect(runButton(page)).toContainText('$0.00'); // a mock model books nothing
  await runButton(page).click();
  await expect(page.getByText('Đã gửi lượt tạo')).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Lịch sử' })).toHaveAttribute('aria-selected', 'true');
  await expect(toast(page, 'Ảnh đã xong')).toBeVisible({ timeout: 60_000 });
  const tray = page.getByRole('complementary', { name: 'Lượt tạo của tôi' });
  await expect(tray.getByText('Hoàn tất')).toHaveCount(1);

  const jobs = (await (await page.request.get('/api/jobs?mine')).json()) as { jobs: { id: string; feature: string }[] };
  expect(jobs.jobs.map((j) => j.feature)).toEqual(['background_remover']);
  const detail = (await (await page.request.get(`/api/jobs/${jobs.jobs[0]!.id}`)).json()) as { prompt: string };
  expect(detail.prompt).toBe('Remove the background.');
  // Use Result puts the result, copied as a new input, in the app's slot, and the card offers the other photo tools.
  await expect(tray.getByRole('button', { name: 'Đổi khung hình' })).toBeVisible();
  await tray.getByRole('button', { name: 'Dùng kết quả' }).click();
  await expect(page.getByRole('group', { name: 'Ảnh', exact: true }).getByRole('img', { name: /^history-\w{8}\.(png|jpg|webp)$/ })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Ảnh', exact: true }).getByRole('img', { name: 'product.png' })).toHaveCount(0);

  await libraryApps(page);
  const mine = page.getByRole('article').filter({ hasText: 'E2E Apps A' });
  await expect(mine).toHaveCount(1);
  await expect(mine.getByText('Xoá nền', { exact: true })).toBeVisible();
  await expect(mine.locator('img.output')).toBeVisible();

  const perApp = page.getByRole('group', { name: 'Theo ứng dụng' });
  await perApp.getByRole('button', { name: 'Xoá nền', exact: true }).click();
  await expect(page).toHaveURL(/kind=background_remover/);
  await expect(mine).toHaveCount(1);
  await perApp.getByRole('button', { name: 'Đổi nền', exact: true }).click();
  await expect(mine).toHaveCount(0);
});

test('Jewelry Try-On takes several pieces and then the person; a mock job sends them in that order with the fixed instruction', async ({ page }) => {
  await signIn(page, 'appsa');
  await openApp(page, 'Thử trang sức', 'jewelry-try-on');
  await expect(reasonOf(page)).toHaveText('Tải lên ảnh: Trang sức.');
  await page.getByLabel('Ảnh trang sức').setInputFiles([file('ring.png'), file('earring.png')]);
  await expect(page.getByRole('group', { name: 'Trang sức' }).locator('img')).toHaveCount(2);
  // The many-photo slot counts its photos against its cap, and each slot offers the member's earlier uploads.
  await expect(page.getByRole('group', { name: 'Trang sức' })).toHaveAccessibleDescription(/^2 trên \d+ ảnh trang sức$/);
  await expect(page.getByRole('button', { name: 'Ảnh đã tải cho Người đeo' })).toBeVisible();
  await expect(reasonOf(page)).toHaveText('Tải lên ảnh: Người đeo.');
  await page.locator('input[type=file][aria-label="Ảnh người đeo"]').setInputFiles(file('wearer.png'));
  await expect(runButton(page)).toBeEnabled();
  await runButton(page).click();
  await expect(toast(page, 'Ảnh đã xong')).toBeVisible({ timeout: 60_000 });

  const jobs = (await (await page.request.get('/api/jobs?mine')).json()) as { jobs: { id: string; feature: string }[] };
  const job = jobs.jobs.find((j) => j.feature === 'jewelry_try_on')!;
  const detail = (await (await page.request.get(`/api/jobs/${job.id}`)).json()) as { prompt: string; images: { filename: string }[] };
  expect(detail.images.map((i) => i.filename)).toEqual(['ring.png', 'earring.png', 'wearer.png']);
  expect(detail.prompt).toMatch(/^Put the jewelry from every image but the last on the person in the last image/);

  // Dùng lại puts the two pieces back in Trang sức and the person in Người đeo.
  await page.goto(`/apps/jewelry-try-on?reuse=${job.id}`);
  await expect(page.getByRole('group', { name: 'Trang sức' }).locator('img')).toHaveCount(2);
  await expect(page.getByRole('group', { name: 'Người đeo' }).getByRole('img', { name: 'wearer.png' })).toBeVisible();
});

test('Jewelry Try-On: the Ví dụ tab lists the uploaded samples, and Dùng lại refills the pieces and the wearer from the details file', async ({ page }) => {
  const base = 'jewelry-try-on-example-1';
  const details = { feature: 'jewelry_try_on', images: [{ sample: `${base}-jewelry-1.jpg` }, { sample: `${base}-jewelry-2.jpg` }, { sample: `${base}-template.jpg` }], resolution: '1K', date: '2026-11-12' };
  const files: [string, Buffer, string][] = [
    [`${base}.jpg`, jpg(), 'image/jpeg'], [`${base}.json`, Buffer.from(JSON.stringify(details)), 'application/json'],
    [`${base}-jewelry-1.jpg`, jpg(), 'image/jpeg'], [`${base}-jewelry-2.jpg`, jpg(), 'image/jpeg'], [`${base}-template.jpg`, jpg(), 'image/jpeg'],
    ['jewelry-try-on-example-2.jpg', jpg(), 'image/jpeg'], // no details file: a plain picture
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
    await signIn(page, 'appexa');
    await page.route(/\/api\/library\?kind=jewelry_try_on/, (r) => r.fulfill({ json: { hasMore: false, isAdmin: false, creators: [], clips: [] } }));
    await page.goto('/apps/jewelry-try-on');
    await expect(page.getByRole('tab')).toHaveText(['Lịch sử', 'Ví dụ', 'Giới thiệu']);
    await openTab(page, 'Ví dụ');
    const gallery = page.getByRole('group', { name: 'Ảnh thử trang sức của công ty' });
    await expect(gallery.getByRole('link', { name: 'Xem chi tiết ảnh mẫu' })).toHaveCount(1);
    await expect(gallery.getByRole('img', { name: 'Ảnh mẫu' })).toHaveCount(2); // the example's photos and the template are not tiles

    await gallery.getByRole('link', { name: 'Xem chi tiết ảnh mẫu' }).click();
    const detail = page.getByRole('dialog', { name: 'Chi tiết: Thử trang sức' });
    await expect(detail.getByRole('list', { name: 'Ảnh đầu vào' }).getByRole('listitem')).toHaveCount(3);
    await expect(detail.locator('.job-chips')).toHaveText('1K'); // the app has no ratio field, so the file names none
    await detail.getByRole('button', { name: 'Dùng lại' }).click();
    const pieces = page.getByRole('group', { name: 'Trang sức' });
    const wearer = page.getByRole('group', { name: 'Người đeo' });
    await expect(pieces.locator('img')).toHaveCount(2);
    await expect(pieces.getByRole('img', { name: `${base}-jewelry-1.jpg` })).toBeVisible();
    await expect(wearer.getByRole('img', { name: `${base}-template.jpg` })).toBeVisible();
    await expect(page).toHaveURL(/\/apps\/jewelry-try-on$/);

    // The same file opens the page refilled from a link (?example=).
    await page.goto(`/apps/jewelry-try-on?example=${base}`);
    await expect(pieces.locator('img')).toHaveCount(2);
    await expect(wearer.getByRole('img', { name: `${base}-template.jpg` })).toBeVisible();
    await expect(page).toHaveURL(/\/apps\/jewelry-try-on$/); // the query is dropped once the form is filled
  } finally {
    await asAdmin((name) => page.request.delete(`/api/admin/samples/${name}`));
  }
});

test('Face Swap (two slots): each required slot has its reason, and a mock job takes the source face, then the target', async ({ page }) => {
  await signIn(page, 'appsa');
  await openApp(page, 'Đổi khuôn mặt', 'face-swap');
  await expect(page.locator('.slot')).toHaveCount(2);
  await expect(page.getByRole('group', { name: 'Khuôn mặt nguồn' })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Ảnh cần đổi khuôn mặt' })).toBeVisible();
  await expect(page.getByText('Thêm 1 ảnh có khuôn mặt cần thay', { exact: true })).toBeVisible(); // each half-width tile says what photo it wants
  await expect(runButton(page)).toBeDisabled();
  await expect(reasonOf(page)).toHaveText('Tải lên ảnh: Khuôn mặt nguồn.');

  await page.getByLabel('Ảnh khuôn mặt nguồn').setInputFiles(file('source.png'));
  await expect(page.getByRole('img', { name: 'source.png' })).toBeVisible();
  await expect(runButton(page)).toBeDisabled();
  // Filled, a half tile shows its photo whole with its name bottom left, and the uploads link moves to the top left, off the name.
  const filled = page.locator('.app-slots > .field').first();
  const [chip, link] = await Promise.all([filled.locator('.slot-chip').boundingBox(), filled.locator('.uploads-link').boundingBox()]);
  expect(link!.y + link!.height).toBeLessThan(chip!.y);
  expect((await page.getByRole('img', { name: 'source.png' }).boundingBox())!.height).toBeGreaterThan(150);
  await expect(reasonOf(page)).toHaveText('Tải lên ảnh: Ảnh cần đổi khuôn mặt.');

  await page.locator('input[type=file][aria-label="Ảnh cần đổi khuôn mặt"]').setInputFiles(file('target.png'));
  await expect(page.getByRole('img', { name: 'target.png' })).toBeVisible();
  await expect(runButton(page)).toBeEnabled();
  await runButton(page).click();
  await expect(toast(page, 'Ảnh đã xong')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole('complementary', { name: 'Lượt tạo của tôi' }).getByText('Hoàn tất')).toHaveCount(1);

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
  // The ratio chip sets the form's ratio, as on Try On; Reframe takes no resolution, so that chip stays text.
  const chips = page.getByRole('complementary', { name: 'Lượt tạo của tôi' }).locator('.job-chips').first();
  await expect(chips.locator('span')).toHaveText(['1K']);
  await chips.getByRole('button', { name: '1:1' }).click();
  await expect(toast(page, 'Đã chọn tỉ lệ 1:1')).toBeVisible();
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
  // The reference photo stands in for the description: its box is off with the reason, the starters are gone and the typed words wait in it, unsent.
  await expect(description).toBeDisabled();
  await expect(description).toHaveAttribute('placeholder', 'Đang dùng ảnh tham chiếu');
  await expect(runButton(page)).toBeEnabled();
  // Removing the photo gives the box back with its words intact.
  await page.getByRole('button', { name: 'Bỏ ảnh cafe.png' }).click();
  await expect(description).toBeEnabled();
  await expect(description).toHaveValue('một quán cà phê đầy nắng');
  await description.fill('');
  await expect(page.getByRole('group', { name: 'Gợi ý nhanh' })).toBeVisible();
  await expect(runButton(page)).toBeDisabled();
  await expect(reasonOf(page)).toHaveText('Nhập mô tả nền mới hoặc tải lên ảnh nền tham chiếu.');
  await page.locator('input[type=file][aria-label="Ảnh nền tham chiếu"]').setInputFiles(file('cafe.png'));
  await expect(description).toBeDisabled();
  await expect(page.getByRole('group', { name: 'Gợi ý nhanh' })).toHaveCount(0);
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
  await expect(runButton(page)).toContainText('$0.08');
  await selectValue(page, 'Độ phân giải', '4K');
  await expect(runButton(page)).toContainText('$0.08');
  await runButton(page).click();
  await expect(page.getByText('Đã gửi lượt tạo')).toBeVisible();
  await expect.poll(async () => (await jobs()).filter((j) => j.feature === 'image_upscale').map((j) => j.resolution)).toEqual(['4K']);

  await openApp(page, 'Đổi khung hình', 'reframe');
  await pickPriced();
  await expectOptions(page, 'Tỉ lệ', ['1:1', '16:9']); // no "Tự động": Reframe needs a target ratio
  await expect(select(page, 'Tỉ lệ')).toHaveAttribute('data-value', '1:1');
  await page.getByLabel('Ảnh cần đổi khung').setInputFiles(file('photo.png'));
  await expect(runButton(page)).toContainText('$0.08');
  await selectValue(page, 'Tỉ lệ', '16:9');
  await runButton(page).click();
  await expect(page.getByText('Đã gửi lượt tạo')).toBeVisible();
  await expect.poll(async () => (await jobs()).filter((j) => j.feature === 'reframe').map((j) => [j.ratio, j.resolution])).toEqual([['16:9', '2K']]);
});

test('the swaps take an optional prompt that is added to their fixed instruction', async ({ page }) => {
  await signIn(page, 'appsc');
  await openApp(page, 'Đổi nhân vật', 'character-swap');
  const prompt = page.getByRole('textbox', { name: 'Mô tả (tuỳ chọn)' });
  await page.locator('input[type=file][aria-label="Ảnh nhân vật mới"]').setInputFiles(file('new.png'));
  await page.locator('input[type=file][aria-label="Ảnh cần thay người"]').setInputFiles(file('target.png'));
  await expect(runButton(page)).toBeEnabled(); // the prompt is not required
  const preview = page.locator('.prompt-preview p');
  await expect(preview).toHaveText('replace the whole person in the second image with the person from the first image, keep the background'); // the instruction alone
  await prompt.fill('keep the red hat');
  await expect(preview).toHaveText('replace the whole person in the second image with the person from the first image, keep the background. keep the red hat');
  // Two Translate buttons, each with a name of its own: the box's and the sent prompt's.
  await expect(page.getByRole('button', { name: 'Dịch', exact: true })).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Dịch prompt gửi đi', exact: true })).toHaveCount(1);
  await runButton(page).click();
  await expect(page.getByText('Đã gửi lượt tạo')).toBeVisible();
  const mine = (await (await page.request.get('/api/jobs?mine')).json()) as { jobs: { id: string; feature: string }[] };
  const detail = (await (await page.request.get(`/api/jobs/${mine.jobs.find((j) => j.feature === 'character_swap')!.id}`)).json()) as { prompt: string };
  expect(detail.prompt).toBe(await preview.innerText()); // the prompt preview shows what the server stored
  await openApp(page, 'Đổi người mẫu', 'model-swap');
  await expect(page.getByRole('textbox', { name: 'Mô tả (tuỳ chọn)' })).toBeVisible();
  await openApp(page, 'Đổi khuôn mặt', 'face-swap');
  await expect(page.getByRole('textbox')).toHaveCount(0);
});

test('an app About at 1440 reads like the live article: 24 px from the form, 56 then 64 px before sections, semibold titles, no column rules', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signIn(page, 'appsc');
  await openApp(page, 'Đổi nhân vật', 'character-swap');
  await page.getByRole('tab', { name: 'Giới thiệu' }).click();
  const about = page.locator('.about-long');
  const box = async (sel: string, i = 0) => (await about.locator(sel).nth(i).boundingBox())!;
  const form = (await page.locator('.form-card').boundingBox())!;
  expect(Math.round((await about.boundingBox())!.x - (form.x + form.width))).toBe(24);
  const title = await box(':scope > h2'), first = await box(':scope > section'), second = await box(':scope > section', 1);
  expect(Math.round(first.y - (title.y + title.height))).toBe(56);
  expect(Math.round(second.y - (first.y + first.height))).toBe(64);
  expect(await about.locator('h3').first().evaluate((e) => getComputedStyle(e).fontWeight)).toBe('600');
  expect(await about.locator('.about-table td').first().evaluate((e) => getComputedStyle(e).borderLeftWidth)).toBe('0px');
});

test("an app's card art tops its About and fills its empty History; an app without art keeps the plain pages", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signIn(page, 'appart');
  // The e2e bucket holds no samples: one app gets art, as an Admin upload would give it.
  const art = 'app-background-changer.jpg';
  await page.route('**/api/samples', async (r) => r.fulfill({ json: { samples: [...((await (await r.fetch()).json()) as { samples: { name: string }[] }).samples, { name: art, bytes: 1 }] } }));
  await page.route(`**/api/samples/${art}`, (r) => r.fulfill({ body: readFileSync(fileURLToPath(new URL('../public/fixtures/examples/example-1.jpg', import.meta.url))), contentType: 'image/jpeg' }));
  const side = page.locator('.side');

  await page.goto('/apps/background-changer');
  const top = side.locator('.app-art[data-page]');
  await expect(top.locator('img')).toHaveAttribute('src', `/api/samples/${art}`);
  await expect(top.locator('img')).toHaveAttribute('loading', 'lazy');
  await expect(top).toHaveAttribute('aria-hidden', 'true');
  await expect(side.locator('> *').first()).toHaveClass(/app-art/); // the art, then the article
  await expect(side.getByRole('heading', { level: 2 }).first()).toBeVisible();
  await page.getByRole('tab', { name: 'Lịch sử' }).click();
  const empty = side.locator('.library-empty');
  await expect(empty.locator('.app-art[data-page] img')).toHaveAttribute('src', `/api/samples/${art}`);
  await expect(empty.locator('.library-art')).toHaveCount(0); // the app's art stands in for the generic picture
  await expect(empty.getByText('Chưa có lượt tạo nào.')).toBeVisible();
  await expect(empty.getByRole('button', { name: 'Bắt đầu ngay' })).toBeVisible();
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    // The colours a theme switch fades (the current nav item's background, for one) settle before axe reads them.
    await page.evaluate(() => Promise.all(document.getAnimations().filter((a) => a instanceof CSSTransition).map((a) => a.finished.catch(() => {}))));
    expect((await new AxeBuilder({ page }).exclude('nextjs-portal').analyze()).violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id)).toEqual([]); // as e2e/a11y
  }

  // No art (the multi-angle app has only its category tile on the index): no empty box, and the generic picture stays.
  await page.goto('/apps/multi-angle');
  await expect(side.getByRole('heading', { level: 2 }).first()).toBeVisible();
  await expect(page.locator('.app-art[data-page]')).toHaveCount(0);
  await page.getByRole('tab', { name: 'Lịch sử' }).click();
  await expect(side.locator('.library-empty .library-art')).toBeVisible();
  await expect(side.locator('.library-empty').getByRole('button', { name: 'Bắt đầu ngay' })).toBeVisible();
  await expect(page.locator('.app-art[data-page]')).toHaveCount(0);
  await page.unrouteAll({ behavior: 'ignoreErrors' });
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

test('each upload button names its slot, and the tray stays off the image-only optimizer', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signIn(page, 'appsc');
  const tray = page.getByRole('complementary', { name: 'Lượt tạo của tôi' });
  await page.goto('/apps/face-swap');
  await expect(page.getByRole('button', { name: 'Tải lên Khuôn mặt nguồn' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Tải lên Ảnh cần đổi khuôn mặt' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Tải lên', exact: true })).toHaveCount(0);
  await expect(tray).toHaveCount(0); // the page has its own History tab

  await page.goto('/apps');
  await expect(page.getByRole('list', { name: 'Danh sách ứng dụng' })).toBeVisible();
  await expect(tray).toHaveCount(0); // the card grid takes the full width, as on the live site
  await page.goto('/apps/media-optimizer');
  await expect(page.getByRole('heading', { name: 'Tối ưu media', level: 1 })).toBeAttached();
  await expect(tray).toHaveCount(0);
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
  const model = (id: string, label: string, usd: string) => ({ id, label, pairIds: [id], isMock: false, supported: true, estimateUsd: usd, durationsSec, score: 50, recommended: false });
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
  await expect(reasonOf(page)).toHaveText('Tải lên video chuyển động.');
  await expect(runButton(page)).toContainText('$0.126/giây'); // before a video, the Standard model's price per second

  await page.getByLabel('Tệp video chuyển động').setInputFiles({ name: 'short.mp4', mimeType: 'video/mp4', buffer: mp4(1900) });
  await expect(page.getByText('short.mp4 · 1.9 giây')).toBeVisible();
  await expect(reasonOf(page)).toHaveText('Video chuyển động phải dài từ 3 đến 30 giây.');
  await expect(runButton(page)).toBeDisabled();

  await page.getByRole('button', { name: 'Bỏ video short.mp4' }).click();
  await page.getByLabel('Tệp video chuyển động').setInputFiles({ name: 'dance.mp4', mimeType: 'video/mp4', buffer: mp4(5400) });
  await expect(page.getByText('dance.mp4 · 5.4 giây')).toBeVisible();
  await expect(reasonOf(page)).toHaveCount(0);
  await expect(runButton(page)).toHaveText(/\$0\.756/); // the recommended Standard model, 6 s
  // The long model name stays inside the form: the picker is a grid item, which would otherwise grow to its text.
  const picker = (await page.locator('.select-trigger').boundingBox())!;
  const form = (await page.locator('.form-scroll').boundingBox())!;
  expect(picker.x + picker.width).toBeLessThanOrEqual(form.x + form.width);
  await expect(page.getByRole('radio', { name: 'Theo video (tối đa 30 giây)' })).toBeChecked();
  await page.getByText('Theo ảnh (tối đa 10 giây)').click();
  await runButton(page).click();
  await expect(page.getByText('Đã gửi lượt tạo. Theo dõi trong tab "Lịch sử".')).toBeVisible();
  expect(sent).toMatchObject({ feature: 'motion_control', modelId: 'kling-v3-motion-standard', ratio: 'auto', params: { orientation: 'image' } });
  expect((sent as unknown as { assetIds: string[] }).assetIds).toHaveLength(2);
  expect(sent).not.toHaveProperty('prompt');
});

test("Motion Control: Dùng lại keeps the job's model even when the remembered model answers later", async ({ page }) => {
  await signIn(page, 'appsa');
  const model = (id: string, label: string) => ({ id, label, pairIds: [id], isMock: false, supported: true, estimateUsd: '0.8400', durationsSec: [5], score: 50, recommended: false });
  await page.route(/\/api\/models\?feature=motion_control/, (r) =>
    r.fulfill({ json: { models: [model('kling-v3-motion-pro', 'Kling V3 Motion Control Pro'), model('kling-v3-motion-standard', 'Kling V3 Motion Control Standard')], defaultModelId: 'kling-v3-motion-standard' } }),
  );
  await page.route('**/api/jobs/motion-old', (r) =>
    r.fulfill({ json: { feature: 'motion_control', images: [], prompt: 'stage light', brief: null, garments: null, enhance: null, ratio: 'auto', resolution: null, modelId: 'kling-v3-motion-pro', orientation: 'image' } }),
  );
  let recalled = false;
  await page.route(/\/api\/recall\?feature=motion_control/, async (r) => {
    recalled = true;
    await new Promise((done) => setTimeout(done, 1500)); // the memory answers after the refill
    await r.fulfill({ json: { settings: { modelId: 'kling-v3-motion-standard', ratio: 'auto', durationSec: null, resolution: null, audio: null, enhance: null, storeId: null } } });
  });
  await page.goto('/apps/motion-control?reuse=motion-old');
  await expect(page.locator('.select-trigger')).toContainText('Kling V3 Motion Control Pro');
  await page.waitForTimeout(2500);
  await expect(page.locator('.select-trigger')).toContainText('Kling V3 Motion Control Pro');
  expect(recalled).toBe(false); // a refill skips the memory
  await expect(page.getByRole('radio', { name: 'Theo ảnh (tối đa 10 giây)' })).toBeChecked(); // the job's orientation comes back
});

test('Run is disabled with a reason when the app has no enabled model, and "Đổi ứng dụng" switches app with a fresh form', async ({ page }) => {
  await signIn(page, 'appsb');
  await page.route(/\/api\/image-models\?feature=model_swap/, (r) => r.fulfill({ json: { models: [] } }));
  await openApp(page, 'Đổi người mẫu', 'model-swap');
  await expect(reasonOf(page)).toHaveText('Ứng dụng này chưa được Admin bật');
  await expect(runButton(page)).toBeDisabled();
  await page.getByLabel('Ảnh người mẫu mới').setInputFiles(file('a.png'));
  await page.locator('input[type=file][aria-label="Ảnh cần thay người mẫu"]').setInputFiles(file('b.png'));
  await expect(page.getByRole('img', { name: 'b.png' })).toBeVisible();
  await expect(reasonOf(page)).toHaveText('Ứng dụng này chưa được Admin bật');
  await expect(runButton(page)).toBeDisabled();

  const change = page.getByRole('button', { name: 'Đổi ứng dụng' });
  await expect(async () => {
    await change.click();
    await expect(change).toHaveAttribute('aria-expanded', 'true', { timeout: 1_000 });
  }).toPass();
  const list = page.getByRole('list', { name: 'Ứng dụng' });
  await expect(list.getByRole('link')).toHaveCount(18);
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
    await expect(cards(page)).toHaveCount(18);
    const lefts = await cards(page).evaluateAll((els) => new Set(els.map((e) => Math.round(e.getBoundingClientRect().left))).size);
    expect(lefts).toBe(columns);
    expect(await fits(page)).toBe(true);

    const heads = new Set<number>(); // the banner keeps one height across apps, whatever the name
    for (const slug of ['character-swap', 'model-swap', 'background-changer', 'reframe', 'motion-control']) {
      await page.goto(`/apps/${slug}`);
      await expect(page.getByRole('tab').first()).toBeVisible();
      heads.add(Math.round((await page.locator('.app-head').boundingBox())!.height));
      for (const tab of await page.getByRole('tab').all()) {
        await tab.click();
        expect(await fits(page), `${slug} ${await tab.textContent()}`).toBe(true);
      }
    }
    expect([...heads]).toHaveLength(1);

    // On a phone the form says what the app does, as About is a tab away; beside About it is not repeated.
    await page.goto('/apps/character-swap');
    await expect(page.locator('.app-lede')).toHaveCount(width < 1024 ? 1 : 0);

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
