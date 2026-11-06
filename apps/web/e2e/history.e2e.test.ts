import { expect, type Page, test } from '@playwright/test';
import { clearMyJobs, openTab, png, runViaApi, select, selectValue, signIn } from './support.test';

// A page's History tab lists the member's jobs as Fash's History cards: the result, the member's words, the inputs, chips, and the actions.
test('a History card shows the text, inputs and chips, and its favourite, new-tab, download, delete and Dùng lại actions work', async ({ page }) => {
  await signIn(page, 'hista');
  const up = async (name: string) => ((await (await page.request.post('/api/assets', { multipart: { file: { name, mimeType: 'image/png', buffer: png() } } })).json()) as { assets: { id: string }[] }).assets[0]!.id;
  const [a, b] = [await up('h-1.png'), await up('h-2.png')];
  const res = await page.request.post('/api/jobs', { data: { feature: 'image', modelId: 'mock-image-e2e', assetIds: [a, b], ratio: '1:1', prompt: 'a studio shot of the bag', enhance: false, params: { resolution: '2K' } } });
  expect(res.status()).toBe(201);
  const { id } = (await res.json()) as { id: string };

  await page.goto('/image-generation');
  await openTab(page, 'Lịch sử');
  const card = page.getByRole('complementary', { name: 'Lượt tạo của tôi' }).getByRole('listitem').filter({ hasText: 'a studio shot of the bag' });
  await expect(card.getByText('Hoàn tất')).toBeVisible({ timeout: 60_000 });
  await expect(card.getByRole('heading', { name: /Tạo ảnh/ })).toBeVisible();
  await expect(card.getByRole('list', { name: 'Ảnh đầu vào' }).locator('img')).toHaveCount(2); // decorative thumbnails (alt="")
  await expect(card.locator('.job-chips button')).toHaveText(['2K', '1:1']); // as on Fash, each chip sets its value on the form (the next test)
  await expect(card.getByRole('img', { name: 'Tạo ảnh' })).toBeVisible();
  await expect(card.getByRole('button', { name: 'Dùng lại' })).toBeVisible(); // beside the form it refills in place (reuse e2e)

  const out = await card.getByRole('link', { name: 'Mở trong tab mới' }).getAttribute('href');
  expect(out).toMatch(/^\/api\/assets\/.+\/content$/);
  expect((await page.request.get(out!)).status()).toBe(200);

  const favourite = card.getByRole('button', { name: 'Yêu thích' });
  await favourite.click();
  await expect(favourite).toHaveAttribute('aria-pressed', 'true');
  await page.reload();
  await openTab(page, 'Lịch sử');
  await expect(card.getByRole('button', { name: 'Yêu thích' })).toHaveAttribute('aria-pressed', 'true'); // kept on the server

  const download = page.waitForEvent('download');
  await card.getByRole('button', { name: 'Tải xuống' }).click();
  expect((await download).suggestedFilename()).toMatch(/\.(png|jpg|jpeg|webp)$/);

  await card.getByRole('button', { name: 'Xoá' }).click();
  await page.getByRole('dialog', { name: /^Xoá (ảnh|clip) này\?$/ }).getByRole('button', { name: 'Xoá', exact: true }).click();
  await expect(card).toHaveCount(0);
  expect(((await (await page.request.get('/api/jobs?mine')).json()) as { jobs: { id: string }[] }).jobs.some((j) => j.id === id)).toBe(false);
});

test('as on Fash, a History chip sets its resolution, ratio or duration on the form beside it and says so', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signIn(page, 'chipa');
  await clearMyJobs(page); // a retry starts with no card from the first attempt
  const toast = (text: string) => page.getByRole('region', { name: 'Thông báo' }).getByText(text);
  const up = (await (await page.request.post('/api/assets', { multipart: { file: { name: 'c.png', mimeType: 'image/png', buffer: png() } } })).json()) as { assets: { id: string }[] };
  const res = await page.request.post('/api/jobs', { data: { feature: 'image', modelId: 'mock-image-e2e', assetIds: [up.assets[0]!.id], ratio: '1:1', prompt: 'chips shot', enhance: false, params: { resolution: '2K' } } });
  expect(res.status()).toBe(201);

  await page.goto('/image-generation');
  await page.getByRole('tab', { name: 'Lịch sử' }).click();
  const card = page.getByRole('complementary', { name: 'Lượt tạo của tôi' }).getByRole('listitem').filter({ hasText: 'chips shot' });
  await expect(card.getByText('Hoàn tất')).toBeVisible({ timeout: 60_000 });
  // The page opens as this job ran (the remembered settings), so the form is moved off them before each chip.
  await expect(select(page, 'Độ phân giải')).toHaveAttribute('data-value', '2K');
  await selectValue(page, 'Độ phân giải', '1K');
  await expect(select(page, 'Độ phân giải')).toHaveAttribute('data-value', '1K');
  await card.getByRole('button', { name: '2K', exact: true }).click();
  await expect(select(page, 'Độ phân giải')).toHaveAttribute('data-value', '2K');
  await expect(toast('Đã chọn độ phân giải 2K')).toBeVisible();
  await expect(toast('Đã chọn độ phân giải 2K')).toBeHidden({ timeout: 6_000 }); // a note goes by itself, with no Library link
  await expect(select(page, 'Tỉ lệ')).toHaveAttribute('data-value', '1:1');
  await selectValue(page, 'Tỉ lệ', 'auto');
  await expect(select(page, 'Tỉ lệ')).toHaveAttribute('data-value', 'auto');
  await card.getByRole('button', { name: '1:1', exact: true }).click(); // exact: the card's save-as-template button names the job time, and 01:14 holds 1:1
  await expect(select(page, 'Tỉ lệ')).toHaveAttribute('data-value', '1:1');
  await expect(toast('Đã chọn tỉ lệ 1:1')).toBeVisible();

  // A video page: the duration chip.
  await runViaApi(page); // 9:16, 5 s
  await page.goto('/create');
  await page.getByRole('tab', { name: 'Lịch sử' }).click();
  const clip = page.getByRole('complementary', { name: 'Lượt tạo của tôi' }).getByRole('listitem').first();
  await expect(clip.getByText('Hoàn tất')).toBeVisible({ timeout: 60_000 });
  await selectValue(page, 'Tỉ lệ khung hình', '1:1');
  await expect(select(page, 'Thời lượng')).toHaveAttribute('data-value', '5'); // remembered from the clip
  await selectValue(page, 'Thời lượng', '8');
  await expect(select(page, 'Thời lượng')).toHaveAttribute('data-value', '8');
  await clip.getByRole('button', { name: '5s' }).click();
  await expect(select(page, 'Thời lượng')).toHaveAttribute('data-value', '5');
  await expect(toast('Đã chọn thời lượng 5s')).toBeVisible();
  await clip.getByRole('button', { name: '9:16', exact: true }).click();
  await expect(select(page, 'Tỉ lệ khung hình')).toHaveAttribute('data-value', '9:16');

  // The Library's cards have no form beside them: their chips stay plain text.
  await page.goto('/library');
  await expect(page.locator('.job-chips button')).toHaveCount(0);
});

test("as on Fash, a History card's words, inputs and result go on the form beside it, each with a note", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signIn(page, 'chipa');
  const up = async (name: string) => ((await (await page.request.post('/api/assets', { multipart: { file: { name, mimeType: 'image/png', buffer: png() } } })).json()) as { assets: { id: string }[] }).assets[0]!.id;
  const res = await page.request.post('/api/jobs', { data: { feature: 'image', modelId: 'mock-image-e2e', assetIds: [await up('piece-1.png'), await up('piece-2.png')], ratio: '1:1', prompt: 'pieces shot', enhance: false, params: { resolution: '1K' } } });
  expect(res.status()).toBe(201);

  await page.goto('/image-generation');
  await page.getByRole('tab', { name: 'Lịch sử' }).click();
  const card = page.getByRole('complementary', { name: 'Lượt tạo của tôi' }).getByRole('listitem').filter({ hasText: 'pieces shot' });
  await expect(card.getByText('Hoàn tất')).toBeVisible({ timeout: 60_000 });
  const note = (text: string) => page.getByRole('region', { name: 'Thông báo' }).getByText(text);
  const chosen = page.getByRole('list', { name: 'Ảnh đã chọn' });
  await card.getByRole('button', { name: 'Dùng ảnh đầu vào 2' }).click();
  await expect(chosen.getByRole('img', { name: 'piece-2.png' })).toBeVisible();
  await expect(note('Đã thêm ảnh vào đầu vào')).toBeVisible();
  await card.getByRole('button', { name: 'Chép vào ô mô tả' }).click();
  await expect(page.getByRole('textbox', { name: 'Mô tả cảnh bạn muốn tạo' })).toHaveValue('pieces shot');
  await expect(note('Đã chép mô tả')).toBeVisible();
  await card.getByRole('button', { name: 'Dùng kết quả' }).click(); // Fash's Use Result: the result as one more input
  await expect(chosen.getByRole('img')).toHaveCount(2);
  expect(await page.url()).toMatch(/\/image-generation$/);

  // Words that fit the four lines have no show more; the copy button puts them on the clipboard and says so.
  await expect(card.getByRole('button', { name: 'Xem thêm' })).toHaveCount(0);
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await card.getByRole('button', { name: 'Chép mô tả' }).click();
  await expect(card.getByText('Đã chép mô tả.')).toBeAttached();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('pieces shot');
  // Longer words are cut at four lines with show more, which opens them all.
  const long = 'a linen summer dress on a model walking down a sunny old-town street, soft morning light, the camera follows from the side, then a close-up of the fabric moving in the breeze';
  expect((await page.request.post('/api/jobs', { data: { feature: 'image', modelId: 'mock-image-e2e', assetIds: [], ratio: '1:1', prompt: long, enhance: false, params: { resolution: '1K' } } })).status()).toBe(201);
  const longCard = page.getByRole('complementary', { name: 'Lượt tạo của tôi' }).getByRole('listitem').filter({ hasText: 'old-town street' });
  await expect(longCard.getByText('Hoàn tất')).toBeVisible({ timeout: 60_000 });
  const more = longCard.getByRole('button', { name: 'Xem thêm' });
  await expect(more).toHaveAttribute('aria-expanded', 'false');
  await more.click();
  await expect(longCard.getByRole('button', { name: 'Thu gọn' })).toHaveAttribute('aria-expanded', 'true');
  expect(await longCard.locator('.job-text').evaluate((t) => t.scrollHeight <= t.clientHeight + 1)).toBe(true);
});

test("as Fash's Generate Video, an image in History opens Create video with the picture as its first image", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signIn(page, 'vidfrom');
  const res = await page.request.post('/api/jobs', { data: { feature: 'image', modelId: 'mock-image-e2e', assetIds: [], ratio: '1:1', prompt: 'a picture to animate', enhance: false, params: { resolution: '1K' } } });
  expect(res.status()).toBe(201);
  await page.goto('/image-generation');
  await page.getByRole('tab', { name: 'Lịch sử' }).click();
  const card = page.getByRole('complementary', { name: 'Lượt tạo của tôi' }).getByRole('listitem').filter({ hasText: 'a picture to animate' });
  await expect(card.getByText('Hoàn tất')).toBeVisible({ timeout: 60_000 });
  await card.getByRole('link', { name: 'Tạo video' }).click();
  await expect(page).toHaveURL(/\/create\?image=[\w-]+$/);
  await expect(page.getByLabel('Ảnh đã chọn').getByRole('img')).toHaveCount(1);
  await expect(page.getByRole('textbox', { name: 'Mô tả chuyển động' })).toHaveValue('');
});

test('the Library item detail shows the result large with its words, inputs and chips, steps to the next item and closes on Esc', async ({ page }) => {
  await signIn(page, 'hista');
  const up = async (name: string) => ((await (await page.request.post('/api/assets', { multipart: { file: { name, mimeType: 'image/png', buffer: png() } } })).json()) as { assets: { id: string }[] }).assets[0]!.id;
  const input = await up('detail-in.png');
  const ids: string[] = [];
  for (const prompt of ['first detail shot', 'second detail shot']) {
    const res = await page.request.post('/api/jobs', { data: { feature: 'image', modelId: 'mock-image-e2e', assetIds: [input], ratio: '3:4', prompt, enhance: false, params: { resolution: '1K' } } });
    ids.push(((await res.json()) as { id: string }).id);
  }
  const done = async () => ((await (await page.request.get('/api/jobs?mine')).json()) as { jobs: { id: string; status: string }[] }).jobs.filter((j) => ids.includes(j.id) && j.status === 'succeeded').length;
  await expect.poll(done, { timeout: 60_000 }).toBe(2);

  await page.goto('/library');
  const mine = page.getByRole('article').filter({ hasText: 'E2E History A' });
  await mine.first().getByRole('button', { name: 'Xem chi tiết' }).click();
  const detail = page.getByRole('dialog', { name: 'Chi tiết: Tạo ảnh' });
  await expect(detail.getByText('second detail shot')).toBeVisible(); // newest first
  await expect(detail.getByRole('img', { name: 'detail-in.png' })).toBeVisible();
  await expect(detail.getByRole('definition').filter({ hasText: /^(1K|3:4)$/ })).toHaveText(['3:4', '1K']); // how it was made
  await expect(detail.getByRole('link', { name: 'Dùng lại' })).toHaveAttribute('href', `/image-generation?reuse=${ids[1]}`);
  await expect(detail.getByRole('link', { name: 'Mở trong tab mới' })).toHaveAttribute('href', /^\/api\/assets\/.+\/content$/);

  await detail.getByRole('button', { name: 'Mục tiếp theo' }).click();
  await expect(detail.getByText('first detail shot')).toBeVisible();
  await expect(detail.getByRole('link', { name: 'Dùng lại' })).toHaveAttribute('href', `/image-generation?reuse=${ids[0]}`);
  await detail.getByRole('button', { name: 'Mục trước' }).click();
  await expect(detail.getByText('second detail shot')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(detail).toHaveCount(0);
});

test('a failed read of the job list says so with Thử lại instead of a blank History; a later failure keeps the list with a notice', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signIn(page, 'loada');
  await clearMyJobs(page);
  let fail = true;
  await page.route(/\/api\/jobs\?mine/, (r) => (fail ? r.fulfill({ status: 500, json: { error: 'down' } }) : r.fallback()));
  await page.goto('/image-generation');
  await page.getByRole('tab', { name: 'Lịch sử' }).click();
  const history = page.getByRole('complementary', { name: 'Lượt tạo của tôi' });
  await expect(history.getByText('Không tải được danh sách lượt tạo.')).toBeVisible();
  await expect(history.getByText('Chưa có lượt tạo nào.')).toHaveCount(0); // not read, so not known to be empty

  fail = false;
  await history.getByRole('button', { name: 'Thử lại' }).click();
  await expect(history.getByText('Chưa có lượt tạo nào.')).toBeVisible();
  await expect(history.getByRole('alert')).toHaveCount(0);

  // The empty History points to the form beside it.
  await history.getByRole('button', { name: 'Bắt đầu ngay' }).click();
  await expect(page.getByRole('group', { name: 'Thanh tạo ảnh' }).getByRole('button', { name: 'Thêm ảnh tham chiếu' })).toBeFocused();

  // The next poll fails: what was read stays, with a short notice.
  fail = true;
  await expect(history.getByText('Không cập nhật được danh sách lượt tạo.')).toBeVisible({ timeout: 15_000 });
  await expect(history.getByText('Chưa có lượt tạo nào.')).toBeVisible();
  fail = false;
  await history.getByRole('button', { name: 'Thử lại' }).click();
  await expect(history.getByRole('alert')).toHaveCount(0);
});

test('on a phone, Bắt đầu ngay in an empty History opens the form tab and puts the cursor in it', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, 'emptya');
  await page.goto('/create');
  await page.getByRole('tab', { name: 'Lịch sử' }).click();
  const history = page.getByRole('complementary', { name: 'Lượt tạo của tôi' });
  await expect(history.getByText('Chưa có lượt tạo nào.')).toBeVisible();
  await history.getByRole('button', { name: 'Bắt đầu ngay' }).click();
  await expect(page.getByRole('tab', { name: 'Tạo' })).toHaveAttribute('aria-selected', 'true');
  await expect(history).toBeHidden();
  await expect.poll(() => page.evaluate(() => document.activeElement?.closest('.form-card') !== null)).toBe(true);
});

test('the compact tray beside a page without its own History gives a failed job and a finished one the History card buttons', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signIn(page, 'traya');
  await clearMyJobs(page);
  const up = await page.request.post('/api/assets', { multipart: { file: { name: 'shirt.png', mimeType: 'image/png', buffer: png() } } });
  const { assets } = (await up.json()) as { assets: { id: string }[] };
  for (const prompt of ['slow pan over the shirt', 'slow pan MOCK_FAIL']) {
    const r = await page.request.post('/api/jobs', { data: { assetIds: [assets[0]!.id], modelId: 'mock-e2e', prompt, ratio: '9:16', durationSec: 5 } });
    expect(r.status()).toBe(201);
  }
  const mine = async () => ((await (await page.request.get('/api/jobs?mine')).json()) as { jobs: { status: string }[] }).jobs;
  await expect.poll(async () => (await mine()).map((j) => j.status).sort(), { timeout: 60_000 }).toEqual(['failed', 'succeeded']);
  await page.goto('/account/sign-in-methods');
  const tray = page.getByRole('complementary', { name: 'Lượt tạo của tôi' });
  const failed = tray.getByRole('listitem').filter({ hasText: 'Thất bại' });
  const done = tray.getByRole('listitem').filter({ hasText: 'Hoàn tất' });
  await expect(failed.getByRole('button', { name: 'Thử lại' })).toHaveClass('job-reuse job-primary');
  await expect(failed.getByRole('link', { name: 'Dùng lại' })).toHaveClass('job-reuse');
  await expect(done.getByRole('link', { name: 'Dùng lại' })).toHaveClass('job-reuse');
  await expect(done.getByRole('link', { name: 'Xem trong Thư viện' })).toHaveAttribute('href', '/library');
  for (const j of ((await (await page.request.get('/api/jobs?mine')).json()) as { jobs: { id: string }[] }).jobs) await page.request.delete(`/api/jobs/${j.id}`); // the Library is shared by every spec
});

// A provider's refusal of the input photo (a real person) says so to everyone, offers no retry with the same photo, and fits a phone.
const REFUSED = 'byteplus submit: HTTP 400 {"error":{"code":"InputImageSensitiveContentDetected.PrivacyInformation","message":"The request failed because the input image \'content[1]\' may contain real person. Request id: 0217","param":"content[1]","type":"BadRequest"}}';
const REAL_PERSON = 'Mô hình này không nhận ảnh có người thật. Hãy dùng ảnh chỉ có sản phẩm, hoặc chọn mô hình khác.';
const refusedJob = {
  id: 'refused-job-1', status: 'failed', error: REFUSED, failureReason: 'real_person', isMock: false, feature: 'video', ratio: '9:16', durationSec: 5, resolution: null, modelId: 'mock-e2e', retryOf: null, retried: false,
  outputAssetId: null, posterAssetId: null, createdAt: '2026-11-04T03:00:00.000Z', finishedAt: '2026-11-04T03:01:00.000Z', text: null, inputAssetIds: [], garments: null, format: null, favorite: false, estimateUsd: '0.5000',
};
const answerWithRefusal = (page: Page) => page.route(/\/api\/jobs\?mine/, (r) => r.fulfill({ json: { workerOffline: false, clips: { today: 0, cap: 20 }, jobs: [refusedJob] } }));
const fits = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

test('on a phone a Member reads the real-person sentence on the failed card, with Dùng lại but no Thử lại, and no raw error', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, 'loada');
  await answerWithRefusal(page);
  await page.goto('/create');
  await page.getByRole('tab', { name: 'Lịch sử' }).click();
  const card = page.getByRole('complementary', { name: 'Lượt tạo của tôi' }).getByRole('listitem').filter({ hasText: 'Thất bại' });
  await expect(card.getByText(REAL_PERSON)).toBeVisible();
  await expect(card.getByRole('button', { name: 'Thử lại' })).toHaveCount(0);
  await expect(card.getByRole('button', { name: 'Dùng lại' })).toBeVisible(); // beside the form it refills in place
  await expect(card.getByText('InputImageSensitiveContentDetected')).toHaveCount(0);
  expect(await fits(page)).toBe(true);
});

test('on a phone an Admin sees the provider code on the failed card and opens the raw error without overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, 'admin');
  await answerWithRefusal(page);
  await page.goto('/create');
  await page.getByRole('tab', { name: 'Lịch sử' }).click();
  const card = page.getByRole('complementary', { name: 'Lượt tạo của tôi' }).getByRole('listitem').filter({ hasText: 'Thất bại' });
  await expect(card.getByText(REAL_PERSON)).toBeVisible();
  await expect(card.getByText('byteplus · InputImageSensitiveContentDetected.PrivacyInformation')).toBeVisible();
  await expect(card.locator('details')).not.toHaveAttribute('open', ''); // the raw error is folded
  expect(await fits(page)).toBe(true);
  await card.getByText('byteplus · InputImageSensitiveContentDetected.PrivacyInformation').click();
  await expect(card.locator('details')).toHaveAttribute('open', '');
  await expect(card.locator('details')).toContainText('Request id: 0217');
  expect(await fits(page)).toBe(true);
  await expect(card.getByRole('button', { name: 'Thử lại' })).toHaveCount(0);
});

test('the compact tray gives the refused job the same sentence and no Thử lại', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signIn(page, 'loada');
  await answerWithRefusal(page);
  await page.goto('/account/sign-in-methods');
  const failed = page.getByRole('complementary', { name: 'Lượt tạo của tôi' }).getByRole('listitem').filter({ hasText: 'Thất bại' });
  await expect(failed.getByText(REAL_PERSON)).toBeVisible();
  await expect(failed.getByRole('button', { name: 'Thử lại' })).toHaveCount(0);
  await expect(failed.getByRole('link', { name: 'Dùng lại' })).toBeVisible();
});
