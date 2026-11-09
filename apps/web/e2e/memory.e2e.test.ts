import { type Browser, expect, type Page, test } from '@playwright/test';
import { clearMyJobs, modelButton, pickModel, png, select, selectValue, signIn } from './support.test';
import type { UserKey } from './users';

const file = (name: string) => ({ name, mimeType: 'image/png', buffer: png() });
/** Sets a photo once the input is enabled: it stays disabled until hydration, and a file set before that is dropped. */
async function upload(page: Page, label: string, name: string): Promise<void> {
  await expect(page.getByLabel(label)).toBeEnabled();
  await page.getByLabel(label).setInputFiles(file(name));
}
const sent = (page: Page) => expect(page.getByText('Đã gửi lượt tạo')).toBeVisible();
const enhance = (page: Page) => page.getByRole('button', { name: 'Cải thiện mô tả bằng AI' });

/** A fresh browser (no cookies) signed in as `who`: the memory is on the account, not in the browser. */
async function elsewhere(browser: Browser, who: UserKey): Promise<Page> {
  const page = await (await browser.newContext({ baseURL: test.info().project.use.baseURL })).newPage();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signIn(page, who);
  return page;
}

/** What each page shows once it has opened as the member last ran it. */
const pages: [string, (page: Page) => Promise<void>][] = [
  ['/image-generation', async (page) => {
    await expect(modelButton(page)).toContainText('Mock image E2E');
    await expect(select(page, 'Tỉ lệ')).toHaveAttribute('data-value', '3:4');
    await expect(select(page, 'Độ phân giải')).toHaveAttribute('data-value', '2K');
    await expect(enhance(page)).toHaveAttribute('aria-pressed', 'false');
  }],
  ['/create', async (page) => {
    await expect(modelButton(page)).toContainText('Mock E2E');
    await expect(select(page, 'Tỉ lệ khung hình')).toHaveAttribute('data-value', '1:1');
    await expect(select(page, 'Thời lượng')).toHaveAttribute('data-value', '5');
  }],
  ['/marketing-studio', async (page) => {
    await expect(modelButton(page)).toContainText('Mock E2E Wide');
    await expect(select(page, 'Tỉ lệ')).toHaveAttribute('data-value', '16:9');
    await expect(select(page, 'Thời lượng')).toHaveAttribute('data-value', '10');
  }],
  ['/try-on', async (page) => {
    await expect(modelButton(page)).toContainText('Mock image E2E');
    await expect(select(page, 'Tỉ lệ')).toHaveAttribute('data-value', '3:4');
    await expect(select(page, 'Độ phân giải')).toHaveAttribute('data-value', '2K');
  }],
  ['/apps/reframe', async (page) => {
    await expect(modelButton(page)).toContainText('Mock apps E2E');
    await expect(select(page, 'Tỉ lệ')).toHaveAttribute('data-value', '9:16');
  }],
];

test("each page opens with the model and settings of the member's last Run, after a reload and in another browser", async ({ page, browser }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signIn(page, 'rema');
  await clearMyJobs(page); // a retry opens on the defaults again, not on the first attempt's Runs

  await page.goto('/image-generation');
  const form = page.locator('.form-card');
  await form.getByRole('textbox', { name: 'Mô tả', exact: true }).fill('a red shirt on a hanger');
  await pickModel(page, /Mock image E2E/);
  await selectValue(page, 'Tỉ lệ', '3:4');
  await selectValue(page, 'Độ phân giải', '2K');
  await enhance(page).click();
  await form.getByRole('button', { name: /^Tạo ảnh/ }).click();
  await sent(page);

  await page.goto('/create');
  await upload(page, 'Ảnh sản phẩm', 'shirt.png');
  await page.getByLabel('Mô tả chuyển động').fill('Slow turn of the shirt.');
  await selectValue(page, 'Tỉ lệ khung hình', '1:1');
  await selectValue(page, 'Thời lượng', '5');
  await expect(modelButton(page)).toContainText('Mock E2E');
  await page.getByRole('button', { name: /^Tạo video/ }).click();
  await sent(page);

  await page.goto('/marketing-studio');
  await upload(page, 'Ảnh người mẫu', 'model.png');
  await upload(page, 'Ảnh sản phẩm', 'product.png');
  // The remembered settings land first (Run waits for them): a pick before that would be redrawn under the pointer.
  await expect(page.getByRole('button', { name: /^Tạo video/ })).toBeEnabled();
  await pickModel(page, /Mock E2E Wide/); // it moves the ratio and the duration to its own 16:9 and 10 s
  await expect(select(page, 'Tỉ lệ')).toHaveAttribute('data-value', '16:9');
  await page.getByRole('button', { name: /^Tạo video/ }).click();
  await sent(page);

  await page.goto('/try-on');
  await upload(page, 'Ảnh trang phục', 'garment.png');
  await upload(page, 'Ảnh người mẫu', 'person.png');
  await selectValue(page, 'Tỉ lệ', '3:4');
  await selectValue(page, 'Độ phân giải', '2K');
  await page.getByRole('button', { name: /^Thử đồ/ }).click();
  await sent(page);

  await page.goto('/apps/reframe');
  await upload(page, 'Ảnh cần đổi khung', 'photo.png');
  await expect(modelButton(page)).toContainText('Mock apps E2E');
  await selectValue(page, 'Tỉ lệ', '9:16');
  await page.getByRole('button', { name: /^Chạy/ }).click();
  await sent(page);

  for (const [path, remembered] of pages) {
    await page.goto(path);
    await page.reload();
    await remembered(page);
  }
  const other = await elsewhere(browser, 'rema');
  for (const [path, remembered] of pages) {
    await other.goto(path);
    await remembered(other);
  }
  await other.context().close();
});

test('a remembered model the Admin has switched off since is dropped: Create shows its defaults with no error', async ({ page, browser }) => {
  const admin = await elsewhere(browser, 'admin');
  const square = (enabled: boolean) => admin.request.put('/api/admin/settings', { data: { models: [{ id: 'mock-e2e-square', enabled }] } });
  await signIn(page, 'remc');
  expect((await square(true)).ok()).toBe(true);
  try {
    const up = await page.request.post('/api/assets', { multipart: { file: file('shirt.png') } });
    const { assets } = (await up.json()) as { assets: { id: string }[] };
    const job = await page.request.post('/api/jobs', { data: { assetIds: [assets[0]!.id], modelId: 'mock-e2e-square', prompt: 'Slow turn.', ratio: '1:1', durationSec: 5, params: { audio: 'off' } } });
    expect(job.status()).toBe(201);
    expect(((await (await page.request.get('/api/recall?feature=video')).json()) as { settings: { modelId: string } }).settings.modelId).toBe('mock-e2e-square');
  } finally {
    expect((await square(false)).ok()).toBe(true);
    await admin.context().close();
  }
  expect(await (await page.request.get('/api/recall?feature=video')).json()).toEqual({ settings: null });
  await page.goto('/create');
  await page.reload();
  await expect(modelButton(page)).toContainText('Mock E2E');
  await expect(modelButton(page)).not.toContainText('Square');
  await expect(select(page, 'Tỉ lệ khung hình')).toHaveAttribute('data-value', '9:16');
  await expect(select(page, 'Thời lượng')).toHaveAttribute('data-value', '8');
  await expect(page.locator('.form-card').getByRole('alert')).toHaveCount(0);
});

test("a refill wins over the memory: Dùng lại shows the job's settings, and a History picture on Create keeps the remembered ones; a member with no Run sees the defaults", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signIn(page, 'rema');
  const image = (ratio: string, resolution: string) =>
    page.request.post('/api/jobs', { data: { feature: 'image', assetIds: [], modelId: 'mock-image-e2e', prompt: 'a linen dress', ratio, params: { resolution } } });
  const earlier = (await (await image('1:1', '1K')).json()) as { id: string };
  expect((await image('3:4', '2K')).status()).toBe(201); // the memory: 3:4 at 2K
  const up = await page.request.post('/api/assets', { multipart: { file: file('shirt.png') } });
  const { assets } = (await up.json()) as { assets: { id: string }[] };
  expect((await page.request.post('/api/jobs', { data: { assetIds: [assets[0]!.id], modelId: 'mock-e2e', prompt: 'Slow turn.', ratio: '1:1', durationSec: 5, params: { audio: 'off' } } })).status()).toBe(201);

  await page.goto(`/image-generation?reuse=${earlier.id}`);
  await expect(page.locator('.form-card').getByRole('textbox', { name: 'Mô tả', exact: true })).toHaveValue('a linen dress');
  await expect(select(page, 'Tỉ lệ')).toHaveAttribute('data-value', '1:1');
  await expect(select(page, 'Độ phân giải')).toHaveAttribute('data-value', '1K');

  // The earlier picture, once made, opens Create as its first image, with the remembered Create model and settings.
  let output: string | null = null;
  await expect
    .poll(async () => {
      const { jobs } = (await (await page.request.get('/api/jobs?mine')).json()) as { jobs: { id: string; status: string; outputAssetId: string | null }[] };
      output = jobs.find((j) => j.id === earlier.id)?.outputAssetId ?? null;
      return output;
    }, { timeout: 60_000 })
    .not.toBeNull();
  await page.goto(`/create?image=${output}`);
  await expect(page.getByRole('list', { name: 'Ảnh đã chọn' }).getByRole('img')).toHaveCount(1);
  await expect(modelButton(page)).toContainText('Mock E2E');
  await expect(select(page, 'Tỉ lệ khung hình')).toHaveAttribute('data-value', '1:1');
  await expect(select(page, 'Thời lượng')).toHaveAttribute('data-value', '5');

  await page.context().clearCookies();
  await signIn(page, 'remb');
  await page.goto('/image-generation');
  await expect(modelButton(page)).toContainText('Mock image E2E');
  await expect(select(page, 'Tỉ lệ')).toHaveAttribute('data-value', 'auto');
  await expect(select(page, 'Độ phân giải')).toHaveAttribute('data-value', '1K');
  await expect(page.locator('.form-card .form-message').getByRole('status')).toHaveText('Nhập mô tả cảnh bạn muốn tạo.');
  await expect(page.locator('.form-card').getByRole('alert')).toHaveCount(0);
});

test('a memory that hangs holds Run only for a while: then the page goes on its defaults, and a late answer leaves the form alone', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signIn(page, 'remb');
  let answer: (() => void) | undefined;
  await page.route(/\/api\/recall\?feature=image/, (r) => new Promise<void>((done) => (answer = done)).then(() => r.fulfill({ json: { settings: { modelId: 'mock-image-e2e', ratio: '16:9', durationSec: null, resolution: '2K', audio: null, enhance: null, storeId: null } } })));
  await page.goto('/image-generation');
  const status = page.locator('.form-card .form-message').getByRole('status');
  await expect(status).toHaveText('Đang tải cài đặt đã dùng...');
  await expect(status).toHaveText('Nhập mô tả cảnh bạn muốn tạo.', { timeout: 15_000 });
  answer?.();
  await page.waitForTimeout(1000);
  await expect(select(page, 'Tỉ lệ')).toHaveAttribute('data-value', 'auto');
  await expect(select(page, 'Độ phân giải')).toHaveAttribute('data-value', '1K');
  await page.unrouteAll({ behavior: 'ignoreErrors' });
});

test('Dùng lại clicked before the memory answers wins: a field the job leaves empty stays on the default, not on the late memory', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signIn(page, 'remd');
  await clearMyJobs(page);
  const res = await page.request.post('/api/jobs', { data: { feature: 'image', assetIds: [], modelId: 'mock-image-e2e', prompt: 'recreate race', ratio: '1:1', params: { resolution: '1K' } } });
  expect(res.status()).toBe(201);
  const id = ((await res.json()) as { id: string }).id;
  await page.route(/\/api\/recall\?feature=image/, async (r) => {
    await new Promise((done) => setTimeout(done, 4000)); // the memory answers while the job is still loading
    await r.fulfill({ json: { settings: { modelId: 'mock-image-e2e', ratio: '16:9', durationSec: null, resolution: '2K', audio: null, enhance: null, storeId: null } } });
  });
  await page.route(`**/api/jobs/${id}`, async (r) => {
    await new Promise((done) => setTimeout(done, 8000));
    await r.fulfill({ json: { feature: 'image', images: [], prompt: 'recreate race', brief: null, garments: null, enhance: false, ratio: null, resolution: null, modelId: 'mock-image-e2e' } });
  });
  await page.goto('/image-generation');
  await page.getByRole('tab', { name: 'Lịch sử' }).click();
  await page.getByRole('complementary', { name: 'Lượt tạo của tôi' }).getByRole('listitem').filter({ hasText: 'recreate race' }).getByRole('button', { name: 'Dùng lại' }).click();
  await expect(page.locator('.form-card').getByRole('textbox', { name: 'Mô tả', exact: true })).toHaveValue('recreate race', { timeout: 20_000 });
  await expect(select(page, 'Tỉ lệ')).toHaveAttribute('data-value', 'auto');
  await expect(select(page, 'Độ phân giải')).toHaveAttribute('data-value', '1K');
  await page.unrouteAll({ behavior: 'ignoreErrors' });
});
