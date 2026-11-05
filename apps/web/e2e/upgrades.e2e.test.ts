// The Run guard (a confirm from 1 USD), Ctrl+Enter, the recent prompts, the growing prompt box with its big editor, and the Library zip download (AC 11-15).
// Every Run is on a mock model; a price of 1 USD or more is only shown, by rewriting the model list the page reads.
import { readFileSync } from 'node:fs';
import { expect, type Page, test } from '@playwright/test';
import { modelButton, png, signIn, today } from './support.test';

const file = (name: string) => ({ name, mimeType: 'image/png', buffer: png() });

/** Counts the POSTs to /api/jobs the page sends. */
function jobPosts(page: Page): () => number {
  let n = 0;
  page.on('request', (r) => void (r.method() === 'POST' && new URL(r.url()).pathname === '/api/jobs' && n++));
  return () => n;
}

/** Shows every image model of the page at this price per image. */
async function priceImages(page: Page, usd: string) {
  await page.unroute(/\/api\/image-models\?/);
  await page.route(/\/api\/image-models\?/, async (r) => {
    const json = (await (await r.fetch()).json()) as { models: { prices: Record<string, string> }[] };
    return r.fulfill({ json: { ...json, models: json.models.map((m) => ({ ...m, prices: Object.fromEntries(Object.keys(m.prices).map((k) => [k, usd])) })) } });
  });
}

/** Answers the in-app confirm that asks `question`, yes or no. */
async function answer(page: Page, question: string, yes: boolean) {
  const confirm = page.getByRole('dialog', { name: question });
  await expect(confirm).toBeVisible();
  await confirm.getByRole('button', { name: yes ? 'Tiếp tục' : 'Huỷ', exact: true }).click();
  await expect(confirm).toBeHidden();
}

const bar = (page: Page) => page.getByRole('group', { name: 'Thanh tạo ảnh' });
const barPrompt = (page: Page) => bar(page).getByRole('textbox', { name: 'Mô tả cảnh bạn muốn tạo' });
const barRun = (page: Page) => bar(page).getByRole('button', { name: /^Tạo ảnh/ });

test('AC 11: Image Generation asks before a Run of 1 USD or more; No sends nothing, Yes sends one job, and a cheaper Run does not ask', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const posts = jobPosts(page);
  await signIn(page, 'upga');
  await priceImages(page, '1.2000');
  await page.goto('/image-generation');
  await expect(modelButton(page)).toContainText('Mock image E2E');
  await barPrompt(page).fill('a guarded picture');
  await expect(barRun(page)).toContainText('$1.2000');

  await barRun(page).click();
  await answer(page, 'Chạy job này với giá $1.2000?', false);
  await expect(barRun(page)).toBeEnabled();
  expect(posts()).toBe(0);

  await barRun(page).click();
  await answer(page, 'Chạy job này với giá $1.2000?', true);
  await expect(page.getByText('Đã gửi job')).toBeVisible();
  expect(posts()).toBe(1);

  await priceImages(page, '0.5000');
  await page.reload();
  await barPrompt(page).fill('a cheap picture');
  await expect(barRun(page)).toContainText('$0.5000');
  await barRun(page).click();
  await expect(page.getByText('Đã gửi job')).toBeVisible();
  expect(posts()).toBe(2);
  await expect(page.locator('dialog.confirm[open]'), 'no question under 1 USD').toHaveCount(0);
  await page.unrouteAll({ behavior: 'ignoreErrors' }); // the list refetched after a Run may still be in flight
});

test("AC 11: Thử lại on a failed job of 1 USD or more asks with the job's price first", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signIn(page, 'upgd');
  const failed = {
    id: 'retry-me', status: 'failed', error: null, isMock: false, feature: 'image', ratio: '1:1', durationSec: 0, resolution: '1K', modelId: 'mock-image-e2e', retryOf: null, retried: false,
    outputAssetId: null, posterAssetId: null, createdAt: new Date().toISOString(), finishedAt: new Date().toISOString(), text: 'a costly retry', inputAssetIds: [], garments: null, format: null, favorite: false, estimateUsd: '3.0000',
  };
  await page.route(/\/api\/jobs\?mine/, async (r) => r.fulfill({ json: { ...((await (await r.fetch()).json()) as object), jobs: [failed] } }));
  let retried = 0;
  await page.route('**/api/jobs', (r) => (r.request().method() === 'POST' ? (retried++, r.fulfill({ status: 201, json: { id: 'retry-2', status: 'queued' } })) : r.fallback()));
  await page.goto('/image-generation');
  await page.getByRole('tab', { name: 'Lịch sử' }).click();
  const card = page.getByRole('complementary', { name: 'Job của tôi' }).getByRole('listitem').filter({ hasText: 'a costly retry' });
  await card.getByRole('button', { name: 'Thử lại' }).click();
  await answer(page, 'Thử lại job này với giá khoảng $3.0000?', false);
  expect(retried).toBe(0);
  await card.getByRole('button', { name: 'Thử lại' }).click();
  await answer(page, 'Thử lại job này với giá khoảng $3.0000?', true);
  await expect.poll(() => retried).toBe(1);
  await page.unrouteAll({ behavior: 'ignoreErrors' });
});

test('Thử lại is disabled while the retry is sent, so a double click sends one job', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signIn(page, 'upgd');
  const failed = {
    id: 'retry-cheap', status: 'failed', error: null, isMock: false, feature: 'image', ratio: '1:1', durationSec: 0, resolution: '1K', modelId: 'mock-image-e2e', retryOf: null, retried: false,
    outputAssetId: null, posterAssetId: null, createdAt: new Date().toISOString(), finishedAt: new Date().toISOString(), text: 'a cheap retry', inputAssetIds: [], garments: null, format: null, favorite: false, estimateUsd: '0.5000',
  };
  await page.route(/\/api\/jobs\?mine/, async (r) => r.fulfill({ json: { ...((await (await r.fetch()).json()) as object), jobs: [failed] } }));
  let release = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  let retried = 0;
  await page.route('**/api/jobs', async (r) => {
    if (r.request().method() !== 'POST') return r.fallback();
    retried++;
    await held; // the answer waits until the button has been checked
    return r.fulfill({ status: 201, json: { id: 'retry-3', status: 'queued' } });
  });
  await page.goto('/image-generation');
  await page.getByRole('tab', { name: 'Lịch sử' }).click();
  const retry = page.getByRole('complementary', { name: 'Job của tôi' }).getByRole('listitem').filter({ hasText: 'a cheap retry' }).getByRole('button', { name: 'Thử lại' });
  await retry.dblclick();
  await expect(retry).toBeDisabled();
  await expect.poll(() => retried).toBe(1);
  release();
  await expect(retry).toBeEnabled(); // the mocked list still shows the job as not retried
  expect(retried).toBe(1);
  await page.unrouteAll({ behavior: 'ignoreErrors' });
});

test('AC 11: Create asks with the price its Run button shows', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const posts = jobPosts(page);
  await page.route(/\/api\/models\?feature=video/, async (r) => {
    const json = (await (await r.fetch()).json()) as { models: object[] };
    return r.fulfill({ json: { ...json, models: json.models.map((m) => ({ ...m, estimateUsd: '1.5000', audioEstimateUsd: '1.5000' })) } });
  });
  await signIn(page, 'upga');
  await page.getByLabel('Ảnh sản phẩm').setInputFiles(file('shirt.png'));
  await expect(page.getByRole('img', { name: 'shirt.png' })).toBeVisible();
  await page.getByLabel('Mô tả chuyển động').fill('a slow turn');
  const run = page.getByRole('button', { name: /^Tạo video/ });
  await expect(run).toContainText('$1.5000');

  await run.click();
  await answer(page, 'Chạy job này với giá $1.5000?', false);
  expect(posts()).toBe(0);
  await run.click();
  await answer(page, 'Chạy job này với giá $1.5000?', true);
  await expect(page.getByText('Đã gửi job')).toBeVisible();
  expect(posts()).toBe(1);
  await page.unrouteAll({ behavior: 'ignoreErrors' });
});

test('AC 12: Ctrl+Enter in the prompt runs once, Enter alone does not, and at 1.2 USD the question comes first', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const posts = jobPosts(page);
  await signIn(page, 'upgb');
  await page.goto('/image-generation');
  await expect(modelButton(page)).toContainText('Mock image E2E');
  await barPrompt(page).fill('keyboard picture');
  await barPrompt(page).press('Enter');
  await expect(barPrompt(page)).toHaveValue('keyboard picture\n');
  expect(posts()).toBe(0);
  // Run waits for hydration and for the remembered settings to load, which a loaded machine makes slow.
  await expect(barRun(page)).toBeEnabled();
  await barPrompt(page).press('Control+Enter');
  await expect(page.getByText('Đã gửi job')).toBeVisible();
  expect(posts()).toBe(1);

  await priceImages(page, '1.2000');
  await page.reload();
  await barPrompt(page).fill('keyboard costly picture');
  await expect(barRun(page)).toContainText('$1.2000');
  // The same wait as above: after the reload Run is locked again until the remembered settings load, and Ctrl+Enter on a locked Run does nothing.
  await expect(barRun(page)).toBeEnabled();
  await barPrompt(page).press('Control+Enter');
  await answer(page, 'Chạy job này với giá $1.2000?', false);
  expect(posts()).toBe(1);
  await page.unrouteAll({ behavior: 'ignoreErrors' });
});

test('AC 13: Prompt gần đây lists the last own words of the page, newest first, and a click fills the box', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const posts = jobPosts(page);
  await signIn(page, 'upgc');
  await page.goto('/image-generation');
  await expect(modelButton(page)).toContainText('Mock image E2E');
  await expect(bar(page).getByRole('button', { name: 'Prompt gần đây' })).toHaveCount(0); // nothing run yet
  for (const [i, words] of ['first picture words', 'second picture words'].entries()) {
    await barPrompt(page).fill(words);
    await barRun(page).click();
    await expect.poll(posts).toBe(i + 1);
    await expect(barRun(page)).toBeEnabled(); // the job is in
  }
  await barPrompt(page).fill('');
  await bar(page).getByRole('button', { name: 'Prompt gần đây' }).click();
  const list = page.getByRole('group', { name: 'Prompt gần đây' }).getByRole('button');
  await expect(list).toHaveText(['second picture words', 'first picture words']);
  await list.filter({ hasText: 'first picture words' }).click();
  await expect(barPrompt(page)).toHaveValue('first picture words');
  await expect(page.getByRole('group', { name: 'Prompt gần đây' })).toHaveCount(0);

  await page.goto('/try-on');
  await expect(modelButton(page)).toContainText('Mock image E2E');
  await expect(page.getByRole('button', { name: 'Prompt gần đây' })).toHaveCount(0); // Image Generation's words stay there
  await page.getByLabel('Ảnh trang phục').setInputFiles(file('garment.png'));
  await page.getByLabel('Ảnh người mẫu').setInputFiles(file('person.png'));
  const prompt = page.getByLabel('Prompt (tuỳ chọn)');
  for (const [i, words] of ['try on words one', 'try on words two'].entries()) {
    await prompt.fill(words);
    await page.getByRole('button', { name: /^Thử đồ/ }).click();
    await expect.poll(posts).toBe(3 + i);
    await expect(page.getByRole('button', { name: /^Thử đồ/ })).toBeEnabled();
  }
  await page.getByRole('button', { name: 'Prompt gần đây' }).click();
  await expect(list).toHaveText(['try on words two', 'try on words one']);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('group', { name: 'Prompt gần đây' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Prompt gần đây' }).click();
  await list.filter({ hasText: 'try on words one' }).click();
  await expect(prompt).toHaveValue('try on words one');
});

test('AC 14: the prompt box grows with the text up to a cap and then scrolls, and Mở rộng edits the same text', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signIn(page, 'upgb');
  const text = Array.from({ length: 40 }, (_, i) => `line ${i + 1}`).join('\n');
  const size = () => barPrompt(page).evaluate((t: HTMLTextAreaElement) => ({ h: t.clientHeight, sh: t.scrollHeight, offset: t.offsetHeight }));

  await page.goto('/image-generation');
  const short = await size();
  expect(short.offset).toBe(56); // empty, the bar keeps its one-row height
  await barPrompt(page).fill(text);
  const tall = await size();
  expect(tall.offset).toBeGreaterThan(56);
  expect(tall.offset).toBeLessThanOrEqual(400); // 40% of the 1000 px viewport
  expect(tall.sh).toBeGreaterThan(tall.h);
  await bar(page).getByRole('button', { name: 'Mở rộng' }).click();
  const editor = page.getByRole('dialog', { name: 'Sửa prompt' });
  await expect(editor.getByRole('textbox', { name: 'Prompt mở rộng' })).toHaveValue(text);
  await editor.getByRole('textbox', { name: 'Prompt mở rộng' }).fill('edited in the big box');
  await expect(editor.locator('.help')).toHaveText('21/2000');
  await editor.getByRole('button', { name: 'Đóng' }).click();
  await expect(barPrompt(page)).toHaveValue('edited in the big box');

  await page.goto('/try-on');
  await expect(modelButton(page)).toContainText('Mock image E2E');
  const prompt = page.getByLabel('Prompt (tuỳ chọn)');
  expect(await prompt.evaluate((t: HTMLTextAreaElement) => t.offsetHeight)).toBe(76); // the composer's start, under four lines
  await prompt.fill(text);
  const grown = await prompt.evaluate((t: HTMLTextAreaElement) => ({ h: t.clientHeight, sh: t.scrollHeight, offset: t.offsetHeight }));
  expect(grown.offset).toBeGreaterThan(76);
  expect(grown.offset).toBeLessThanOrEqual(500); // 50% of the viewport
  expect(grown.sh).toBeGreaterThan(grown.h);
  await page.getByRole('button', { name: 'Mở rộng' }).click();
  await expect(editor.getByRole('textbox', { name: 'Prompt mở rộng' })).toHaveValue(text);
  await editor.getByRole('textbox', { name: 'Prompt mở rộng' }).fill('short');
  await expect(editor.locator('.help')).toHaveText(/^5(\/\d+)?$/);
  await page.keyboard.press('Escape');
  await expect(prompt).toHaveValue('short');
});

test('AC 15: the Library downloads two picked results as one zip, and refuses a deleted item or 51 ids', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const posts = jobPosts(page);
  await signIn(page, 'upgd');
  await page.goto('/image-generation');
  await expect(modelButton(page)).toContainText('Mock image E2E');
  for (const [i, words] of ['zip picture one', 'zip picture two', 'zip picture three'].entries()) {
    await barPrompt(page).fill(words);
    await barRun(page).click();
    await expect.poll(posts).toBe(i + 1);
    await expect(barRun(page)).toBeEnabled();
  }
  const mine = async () => ((await (await page.request.get('/api/jobs?mine')).json()) as { jobs: { id: string; status: string }[] }).jobs;
  await expect.poll(async () => (await mine()).filter((j) => j.status === 'succeeded').length, { timeout: 120_000 }).toBe(3);
  const [gone] = (await mine()).map((j) => j.id);
  expect((await page.request.delete(`/api/jobs/${gone}`)).status()).toBe(200);

  await page.goto('/library');
  await page.getByLabel('Người tạo').selectOption({ label: 'E2E Upgrades D' });
  const cards = page.getByRole('article');
  await expect(cards).toHaveCount(2);
  await page.getByRole('button', { name: 'Chọn', exact: true }).click();
  const checks = page.getByRole('checkbox', { name: /^Chọn \d{8}-e2e-upgrades-d-/ });
  await expect(checks).toHaveCount(2);
  await checks.nth(0).check();
  await checks.nth(1).check();
  const zipBar = page.getByRole('group', { name: 'Tải nhiều mục' });
  await expect(zipBar).toContainText('Đã chọn 2');
  const [download] = await Promise.all([page.waitForEvent('download'), zipBar.getByRole('button', { name: 'Tải xuống .zip' }).click()]);
  expect(download.suggestedFilename()).toMatch(new RegExp(`^cvs-${today()}-2\\.zip$`));
  const zip = readFileSync((await download.path())!);
  expect([...zip.subarray(0, 4)]).toEqual([0x50, 0x4b, 0x03, 0x04]);
  expect(zip.readUInt32LE(zip.length - 22)).toBe(0x06054b50);
  expect(zip.readUInt16LE(zip.length - 22 + 10)).toBe(2);

  const live = (await mine()).map((j) => j.id).filter((id) => id !== gone);
  expect((await page.request.post('/api/library/zip', { data: { ids: [live[0], gone] } })).status()).toBe(403);
  expect((await page.request.post('/api/library/zip', { data: { ids: Array.from({ length: 51 }, (_, i) => `id-${i}`) } })).status()).toBe(400);
});
