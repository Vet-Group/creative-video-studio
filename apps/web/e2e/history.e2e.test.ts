import { expect, type Locator, type Page, test } from '@playwright/test';
import { clearMyJobs, gotoTryOn, openJobs, openTab, png, runViaApi, select, selectValue, signIn } from './support.test';

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

  const out = await card.getByRole('link', { name: 'Mở bản gốc trong tab mới' }).getAttribute('href');
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

  // Compress & download on the picture: a lighter WebP, or the original when the tiny mock image does not shrink.
  const compressed = page.waitForEvent('download');
  await card.getByRole('button', { name: 'Nén & tải về' }).click();
  expect((await compressed).suggestedFilename()).toMatch(/(-nen\.webp|\.(png|jpg|jpeg|webp))$/);

  await card.getByRole('button', { name: 'Xoá', exact: true }).click();
  await page.getByRole('dialog', { name: /^Xoá (ảnh|clip) này\?$/ }).getByRole('button', { name: 'Xoá', exact: true }).click();
  await expect(card).toHaveCount(0);
  expect(((await (await page.request.get('/api/jobs?mine')).json()) as { jobs: { id: string }[] }).jobs.some((j) => j.id === id)).toBe(false);
});

/** Presses Run and returns the new job as the API saw it: the POST's status and the inputs it kept, each with its kind. */
async function runAndInspect(page: Page, run: Locator): Promise<{ status: number; inputs: { id: string; kind: string }[] }> {
  const posted = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/jobs' && r.request().method() === 'POST');
  await run.click();
  const res = await posted;
  if (res.status() !== 201) return { status: res.status(), inputs: [] };
  const { id } = (await res.json()) as { id: string };
  const job = ((await (await page.request.get('/api/jobs?mine')).json()) as { jobs: { id: string; inputAssetIds: string[] }[] }).jobs.find((j) => j.id === id)!;
  const inputs = await Promise.all(job.inputAssetIds.map(async (a) => ((await (await page.request.get(`/api/assets/${a}`)).json()) as { id: string; kind: string })));
  return { status: res.status(), inputs: inputs.map(({ id: i, kind }) => ({ id: i, kind })) };
}

/** A finished mock image job made through the API, and its result's asset id once the card shows it done. */
async function finishedResult(page: Page, body: Record<string, unknown>, text: string): Promise<{ card: Locator; result: string }> {
  expect((await page.request.post('/api/jobs', { data: { modelId: 'mock-image-e2e', ratio: '1:1', enhance: false, ...body } })).status()).toBe(201);
  const card = page.getByRole('complementary', { name: 'Lượt tạo của tôi' }).getByRole('listitem').filter({ hasText: text });
  await expect(card.getByText('Hoàn tất')).toBeVisible({ timeout: 60_000 });
  const result = ((await (await page.request.get('/api/jobs?mine')).json()) as { jobs: { text: string | null; outputAssetId: string | null }[] }).jobs.find((j) => j.text === text)!.outputAssetId!;
  return { card, result };
}

test("a History card's Dùng kết quả on Image Generation puts the result in as an input the next Run accepts, as a copy the member owns", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signIn(page, 'resimga');
  await page.goto('/image-generation');
  await openTab(page, 'Lịch sử');
  const { card, result } = await finishedResult(page, { feature: 'image', assetIds: [], prompt: 'result source shot', params: { resolution: '1K' } }, 'result source shot');
  await card.getByRole('button', { name: 'Dùng kết quả' }).click();
  await expect(page.getByRole('list', { name: 'Ảnh tham chiếu: ảnh đã chọn' }).getByRole('img')).toHaveCount(1);
  await page.getByRole('textbox', { name: 'Mô tả', exact: true }).fill('the result made into a second shot');
  const sent = await runAndInspect(page, page.getByRole('button', { name: /^Tạo ảnh/ }));
  expect(sent.status).toBe(201); // before the fix a job could not name the output: 400
  expect(sent.inputs).toHaveLength(1);
  expect(sent.inputs[0]!.kind).toBe('input');
  expect(sent.inputs[0]!.id).not.toBe(result); // a copy, so deleting the first job cannot take this one's input with it
});

test("a History card's Dùng kết quả on Try On sets the model photo from the result, and the next Run accepts it", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signIn(page, 'restrya');
  const up = async (name: string) => ((await (await page.request.post('/api/assets', { multipart: { file: { name, mimeType: 'image/png', buffer: png() } } })).json()) as { assets: { id: string }[] }).assets[0]!.id;
  await gotoTryOn(page);
  await openTab(page, 'Lịch sử');
  const { card, result } = await finishedResult(page, { feature: 'try_on', assetIds: [await up('r-person.png'), await up('r-garment.png')], params: { resolution: '1K', garments: '1', brief: 'result try-on source' } }, 'result try-on source');
  await card.getByRole('button', { name: 'Dùng kết quả' }).click();
  await expect(page.getByLabel('Người mẫu: ảnh đã chọn').getByRole('img')).toHaveCount(1);
  await page.getByLabel('Ảnh trang phục').setInputFiles({ name: 'r-garment-2.png', mimeType: 'image/png', buffer: png() });
  const sent = await runAndInspect(page, page.getByRole('button', { name: /^Thử đồ/ }));
  expect(sent.status).toBe(201);
  expect(sent.inputs.map((i) => i.kind)).toEqual(['input', 'input']);
  expect(sent.inputs[0]!.id).not.toBe(result); // the model photo is the copy of the result
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
  const chosen = page.getByRole('list', { name: 'Ảnh tham chiếu: ảnh đã chọn' });
  // A hover names where the photo goes; a click puts it there, and then it is ticked and not added twice.
  const second = card.getByRole('button', { name: 'Ảnh đầu vào 2: dùng làm đầu vào', exact: true });
  await second.hover();
  await expect(second.locator('.input-use')).toHaveCSS('opacity', '1');
  await expect(second.locator('.input-use')).toHaveText('+ Đầu vào');
  await second.click();
  await expect(chosen.getByRole('img', { name: 'piece-2.png' })).toBeVisible();
  await expect(note('Đã thêm ảnh vào đầu vào')).toBeVisible();
  await card.getByRole('button', { name: 'Ảnh đầu vào 2: dùng làm đầu vào, đã có trong biểu mẫu' }).click();
  await expect(note('Ảnh này đã có trong biểu mẫu')).toBeVisible();
  await expect(chosen.getByRole('img')).toHaveCount(1);
  // The corner button shows the photo large, with the same use button.
  await card.getByRole('button', { name: 'Ảnh đầu vào 1: dùng làm đầu vào', exact: true }).hover();
  await card.getByRole('button', { name: 'Xem lớn ảnh 1' }).click();
  const viewer = page.getByRole('dialog', { name: 'Ảnh đầu vào 1' });
  await expect(viewer.getByRole('img', { name: 'Ảnh đầu vào 1' })).toHaveAttribute('src', /^\/api\/assets\/[^/]+\/content$/);
  await expect.poll(() => viewer.getByRole('img').evaluate((i: HTMLImageElement) => i.naturalWidth)).toBeGreaterThan(0);
  await viewer.getByRole('button', { name: 'Dùng làm đầu vào' }).click();
  await expect(viewer).toBeHidden();
  await expect(chosen.getByRole('img', { name: 'piece-1.png' })).toBeVisible();
  // The same note twice in a row is one toast that counts, not a stack.
  await card.getByRole('button', { name: 'Chép vào ô mô tả' }).click();
  await card.getByRole('button', { name: 'Chép vào ô mô tả' }).click();
  await expect(page.getByRole('textbox', { name: 'Mô tả', exact: true })).toHaveValue('pieces shot');
  await expect(page.getByRole('region', { name: 'Thông báo' }).locator('.toast', { hasText: 'Đã chép mô tả' })).toHaveText(['Đã chép mô tả ×2×']);
  await card.getByRole('button', { name: 'Dùng kết quả' }).click(); // Fash's Use Result: the result as one more input
  await expect(chosen.getByRole('img')).toHaveCount(3);
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
  await expect(detail.getByRole('link', { name: 'Mở bản gốc trong tab mới' })).toHaveAttribute('href', /^\/api\/assets\/.+\/content$/);

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

  // The empty History points to the form, Image Generation's prompt bar under it.
  await history.getByRole('button', { name: 'Bắt đầu ngay' }).click();
  await expect(page.getByRole('region', { name: 'Thanh tạo ảnh' }).getByRole('textbox', { name: 'Mô tả', exact: true })).toBeFocused();

  // The next poll fails (with nothing in flight the tray polls every 30 s): what was read stays, with a short notice.
  fail = true;
  await expect(history.getByText('Không cập nhật được danh sách lượt tạo.')).toBeVisible({ timeout: 40_000 });
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
  // The Library's empty state: its picture, a hint for this page and the action.
  await expect(history.locator('.library-art')).toBeVisible();
  await expect(history.getByText('Mỗi lần chạy Tạo video, kết quả sẽ hiện ở đây.')).toBeVisible();
  await history.getByRole('button', { name: 'Bắt đầu ngay' }).click();
  await expect(page.getByRole('tab', { name: 'Tạo' })).toHaveAttribute('aria-selected', 'true');
  await expect(history).toBeHidden();
  await expect.poll(() => page.evaluate(() => document.activeElement?.closest('.form-card') !== null)).toBe(true);
});

test('the jobs drawer of a page without its own History gives a failed job and a finished one the History card buttons', async ({ page }) => {
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
  const tray = (await openJobs(page)).getByRole('complementary', { name: 'Lượt tạo của tôi' });
  const failed = tray.getByRole('listitem').filter({ hasText: 'Không thành công' });
  const done = tray.getByRole('listitem').filter({ hasText: 'Hoàn tất' });
  await expect(failed.getByRole('button', { name: 'Thử lại' })).toHaveClass('job-reuse job-primary');
  await expect(failed.getByRole('link', { name: 'Dùng lại' })).toHaveClass('job-reuse');
  await expect(done.getByRole('link', { name: 'Dùng lại' })).toHaveClass('job-reuse');
  await expect(done.getByRole('link', { name: 'Xem trong Thư viện' })).toHaveAttribute('href', /^\/library\?item=[0-9a-f-]+$/);
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
  const card = page.getByRole('complementary', { name: 'Lượt tạo của tôi' }).getByRole('listitem').filter({ hasText: 'Không thành công' });
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
  const card = page.getByRole('complementary', { name: 'Lượt tạo của tôi' }).getByRole('listitem').filter({ hasText: 'Không thành công' });
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

test('the jobs drawer gives the refused job the same sentence and no Thử lại', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signIn(page, 'loada');
  await answerWithRefusal(page);
  await page.goto('/account/sign-in-methods');
  const failed = (await openJobs(page)).getByRole('complementary', { name: 'Lượt tạo của tôi' }).getByRole('listitem').filter({ hasText: 'Không thành công' });
  await expect(failed.getByText(REAL_PERSON)).toBeVisible();
  await expect(failed.getByRole('button', { name: 'Thử lại' })).toHaveCount(0);
  await expect(failed.getByRole('link', { name: 'Dùng lại' })).toBeVisible();
});

test('a page without its own History keeps the full width and opens the jobs from a Lượt tạo button that counts the active ones', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signIn(page, 'loada');
  const active = (id: string, status: string) => ({ ...refusedJob, id, status, error: null, failureReason: null, startedAt: status === 'running' ? refusedJob.createdAt : null, finishedAt: null });
  await page.route(/\/api\/jobs\?mine/, (r) => r.fulfill({ json: { workerOffline: false, clips: { today: 0, cap: 20 }, jobs: [active('running-job-1', 'running'), active('queued-job-1', 'queued'), refusedJob] } }));
  await page.goto('/account/sign-in-methods');
  const button = page.getByRole('button', { name: 'Lượt tạo, 2 đang chạy', exact: true });
  await expect(button).toBeVisible();
  await expect(button.locator('.jobs-open-count')).toHaveText('2');
  // No column beside the page: the page takes the frame's whole width (its 48 px gutters aside).
  await expect(page.getByRole('complementary', { name: 'Lượt tạo của tôi' })).toHaveCount(0);
  expect((await page.locator('main').boundingBox())!.width).toBe((await page.locator('.frame').boundingBox())!.width - 96);

  const drawer = await openJobs(page);
  expect((await drawer.boundingBox())!.width).toBe(380);
  await expect(drawer.getByRole('complementary', { name: 'Lượt tạo của tôi' }).getByRole('listitem')).toHaveCount(3);
  await expect(drawer.getByRole('heading', { name: 'Lượt tạo của tôi' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(drawer).toBeHidden();
  await expect(button).toBeFocused();

  // On a phone the button sits in the top bar, a 44 px target, and the drawer takes the whole width.
  await page.setViewportSize({ width: 390, height: 844 });
  const inBar = page.locator('.topbar').getByRole('button', { name: 'Lượt tạo, 2 đang chạy', exact: true });
  await expect(inBar).toBeVisible();
  expect((await inBar.boundingBox())!.height).toBe(44);
  await inBar.click();
  await expect(drawer).toBeVisible();
  expect(Math.round((await drawer.boundingBox())!.width)).toBe(await page.evaluate(() => document.documentElement.clientWidth)); // boxes are sub-pixel
  expect(await fits(page)).toBe(true);
});

test('Chạy lại on a succeeded History card sends a new job with the same inputs', async ({ page }) => {
  await signIn(page, 'hista');
  const up = async (name: string) => ((await (await page.request.post('/api/assets', { multipart: { file: { name, mimeType: 'image/png', buffer: png() } } })).json()) as { assets: { id: string }[] }).assets[0]!.id;
  const [a, b] = [await up('rr-1.png'), await up('rr-2.png')];
  const res = await page.request.post('/api/jobs', { data: { feature: 'image', modelId: 'mock-image-e2e', assetIds: [a, b], ratio: '1:1', prompt: 'a rerunnable studio shot', enhance: false, params: { resolution: '2K' } } });
  expect(res.status()).toBe(201);

  await page.goto('/image-generation');
  await openTab(page, 'Lịch sử');
  const cards = page.getByRole('complementary', { name: 'Lượt tạo của tôi' }).getByRole('listitem').filter({ hasText: 'a rerunnable studio shot' });
  await expect(cards.getByText('Hoàn tất')).toBeVisible({ timeout: 60_000 });
  await cards.getByRole('button', { name: 'Chạy lại' }).click();
  await expect(cards).toHaveCount(2);
  await expect(cards.first().getByRole('list', { name: 'Ảnh đầu vào' }).locator('img')).toHaveCount(2);
});
