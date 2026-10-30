import { type Browser, expect, type Page, test } from '@playwright/test';
import { png, runViaApi, signIn } from './support.test';

/** What the browser fires when the user switches back to this tab. */
const tabReturn = (page: Page) => page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));

/** A second member's session, for jobs the watching page did not start and so learns of only by reloading. */
async function other(browser: Browser): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await signIn(page, 'freshb');
  return page;
}

async function finished(page: Page, id: string): Promise<void> {
  await expect.poll(async () => ((await (await page.request.get(`/api/jobs/${id}`)).json()) as { status: string }).status, { timeout: 60_000 }).toBe('succeeded');
}

const card = (page: Page, id: string) => page.getByRole('article', { name: new RegExp(`${id.slice(0, 8)}\\.mp4$`) });

test("the Library shows the user's own clip once the tray hears it finished, and another member's when the tab comes back", async ({ page, browser }) => {
  await signIn(page, 'fresha');
  await page.goto('/library');
  await expect(page.getByText('Mọi thứ công ty đã tạo, ở cùng một chỗ.')).toBeVisible();

  const mine = await runViaApi(page);
  await expect(page.getByRole('region', { name: 'Thông báo' }).getByText('Clip đã xong')).toBeVisible({ timeout: 60_000 });
  await expect(card(page, mine)).toBeVisible();

  const b = await other(browser);
  const theirs = await runViaApi(b);
  await finished(b, theirs);
  await page.waitForTimeout(6_000); // a tray poll or more: nothing of this user's finished, so the page stays as it was
  await expect(card(page, theirs)).toHaveCount(0);
  await tabReturn(page);
  await expect(card(page, theirs)).toBeVisible();
});

test("Tạo ảnh's Ví dụ shows another member's new image when the tab comes back", async ({ page, browser }) => {
  await signIn(page, 'fresha');
  await page.goto('/image-generation');
  await page.getByRole('tab', { name: 'Ví dụ' }).click();
  const items = page.getByRole('group', { name: 'Ảnh của công ty' }).locator('.gallery-item');
  await expect(page.getByRole('group', { name: 'Ảnh của công ty' }).or(page.getByText(/^Chưa có ảnh nào trong công ty/))).toBeVisible(); // loaded, empty or not
  const before = await items.count();

  const b = await other(browser);
  const up = await b.request.post('/api/assets', { multipart: { file: { name: 'ref.png', mimeType: 'image/png', buffer: png() } } });
  const { assets } = (await up.json()) as { assets: { id: string }[] };
  const job = await b.request.post('/api/jobs', { data: { feature: 'image', modelId: 'mock-image-e2e', assetIds: [assets[0]!.id], prompt: 'a mug on a desk', ratio: '1:1', params: { resolution: '1K' } } });
  expect(job.status()).toBe(201);
  await finished(b, ((await job.json()) as { id: string }).id);
  await expect(items).toHaveCount(before);
  await tabReturn(page);
  await expect(items).toHaveCount(before + 1);
});

test('Admin Costs, Report and Audit reload when the tab comes back', async ({ page, browser }) => {
  await signIn(page, 'admin');
  const { month } = (await (await page.request.get('/api/admin/costs')).json()) as { month: string };

  // Audit: a store created elsewhere shows up.
  await page.goto('/admin/audit');
  const store = `Fresh store ${Date.now()}`;
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'Đang tải...' })).toHaveCount(0);
  expect((await page.request.post('/api/admin/stores', { data: { name: store, code: `FR${Date.now() % 100000}` } })).status()).toBe(201);
  const entry = page.getByRole('cell', { name: new RegExp(store) });
  await expect(entry).toHaveCount(0);
  await tabReturn(page);
  await expect(entry).toBeVisible();

  // Costs: an adjustment booked elsewhere changes the shared line.
  await page.goto('/admin/costs');
  const shared = page.getByRole('region', { name: 'Chi phí chung' });
  await expect(shared).toBeVisible();
  const before = (await shared.textContent())!;
  expect((await page.request.post('/api/admin/costs/adjustments', { data: { month, usd: '0.25', note: 'Tab return check' } })).status()).toBe(201);
  await expect(shared).toHaveText(before);
  await tabReturn(page);
  await expect(shared).not.toHaveText(before);

  // Report: another member's first job adds their row.
  await page.goto('/admin/report');
  const row = page.getByRole('row', { name: /E2E Fresh B/ });
  await expect(page.getByRole('heading', { name: 'Báo cáo tuần' })).toBeVisible();
  const jobsOf = async () => ((await row.count()) ? await row.getByRole('cell').nth(2).innerText() : '0');
  const was = Number(await jobsOf());
  const b = await other(browser);
  await finished(b, await runViaApi(b));
  expect(Number(await jobsOf())).toBe(was);
  await tabReturn(page);
  await expect.poll(async () => Number(await jobsOf())).toBe(was + 1);
});
