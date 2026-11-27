import { createPool } from '@cvs/db/client';
import { expect, type Page, test } from '@playwright/test';
import { signIn } from './support.test';
import { USERS } from './users';

// The week's Run counts (lib/popular.ts) on the Apps cards and the motion preset tiles, and Explore's "most used" sort. The Runs are seeded straight into the
// e2e database (serve.ts's) under a workspace of their own, so no other spec's jobs move the numbers; popv, in the company workspace, must never see them.
const url = new URL(process.env.DATABASE_URL!);
url.pathname = `/${process.env.CVS_E2E_DB ?? 'cvs_e2e'}`;
const db = createPool(url.toString(), 2);
const WS = 'ws_popular';
let presetIds: string[] = [];

test.beforeAll(async () => {
  const popw = (await db.query('select id from users where email = $1', [USERS.popw.email])).rows[0].id as string;
  await db.query(`insert into workspaces (id, name) values ($1, 'E2E Popular Co') on conflict do nothing`, [WS]);
  await db.query(`delete from workspace_members where user_id = $1 and workspace_id = 'ws_vet'`, [popw]);
  await db.query(`insert into workspace_members (workspace_id, user_id, role) values ($1, $2, 'owner') on conflict do nothing`, [WS, popw]);
  presetIds = (await db.query(`select id from presets where feature = 'video' and enabled order by sort_order, id`)).rows.map((r) => r.id as string);
  const [hot, warm] = [presetIds.at(-1)!, presetIds.at(-2)!]; // the last two in the curated order, so the sort has to move them
  /** `n` failed mock jobs of `feature` made `ago` ago in the workspace, named `prefix-1`..`prefix-n`; `batch` is the Run id they share. */
  const run = (prefix: string, n: number, feature: string, o: { preset?: string; batch?: string; ago?: string } = {}) =>
    db.query(
      `insert into jobs (id, user_id, team_id, feature, model, provider, preset_id, prompt, aspect, duration_s, input_asset_ids, params, status, is_mock, created_at, workspace_id)
       select $1 || '-' || n, $2, 'team-unassigned', $3, 'mock-e2e', 'mock', $4, 'p', '9:16', 5, '{}', $5::jsonb, 'failed', true, now() - $6::interval, $7 from generate_series(1, $8::int) n`,
      [prefix, popw, feature, o.preset ?? null, o.batch ? { batch: o.batch } : {}, o.ago ?? '1 hour', WS, n],
    );
  await run('pop-media', 3, 'media_optimizer'); // three Runs: the line shows
  await run('pop-face', 2, 'face_swap'); // two: nothing
  await run('pop-reframe', 7, 'reframe');
  await run('pop-bulk', 25, 'image_upscale', { batch: 'pop-bulk-run' }); // one bulk Run of 25 photos: one use
  await run('pop-hot', 4, 'video', { preset: hot });
  await run('pop-warm', 2, 'video', { preset: warm });
  await run('pop-old', 5, 'video', { preset: hot, ago: '8 days' }); // outside the window
});

test.afterAll(async () => {
  try {
    await db.query('delete from jobs where workspace_id = $1', [WS]);
    await db.query('delete from workspace_members where workspace_id = $1', [WS]);
    await db.query('delete from workspaces where id = $1', [WS]);
  } finally {
    await db.end();
  }
});

const card = (page: Page, name: string) => page.getByRole('list', { name: 'Danh sách ứng dụng' }).getByRole('listitem').filter({ has: page.getByText(name, { exact: true }) });

test("an Apps card shows the week's Runs of the member's workspace from three, never fewer, and never another workspace's", async ({ page }) => {
  await signIn(page, 'popw');
  await page.goto('/apps');
  await expect(card(page, 'Tối ưu media').locator('.app-card-uses')).toHaveText('3 lượt dùng tuần này');
  await expect(card(page, 'Đổi khung hình').locator('.app-card-uses')).toHaveText('7 lượt dùng tuần này');
  await expect(card(page, 'Tăng độ phân giải')).toBeVisible();
  await expect(card(page, 'Tăng độ phân giải').locator('.app-card-uses')).toHaveCount(0); // 25 photos in one Run is one use
  await expect(card(page, 'Đổi khuôn mặt').locator('.app-card-uses')).toHaveCount(0); // two Runs
  await expect(page.locator('.app-card-uses')).toHaveCount(2);
  expect(await card(page, 'Tối ưu media').locator('.app-card-uses').evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(12);

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(card(page, 'Đổi khung hình').locator('.app-card-uses')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);

  await page.context().clearCookies();
  await signIn(page, 'popv');
  await page.goto('/apps');
  await expect(card(page, 'Tối ưu media')).toBeVisible();
  await expect(card(page, 'Tối ưu media').locator('.app-card-uses')).toHaveCount(0);
  await expect(card(page, 'Đổi khung hình').locator('.app-card-uses')).toHaveCount(0);
});

test("Explore's sort switch puts the most used tools and motion presets first, keeps the choice in the address, and ties keep the curated order", async ({ page }) => {
  await signIn(page, 'popw');
  await page.goto('/explore');
  const sort = page.getByRole('group', { name: 'Sắp xếp công cụ và mẫu chuyển động' });
  const suggested = sort.getByRole('button', { name: 'Gợi ý' });
  const popular = sort.getByRole('button', { name: 'Đang được dùng nhiều' });
  const tools = () => page.getByRole('list', { name: 'Công cụ' }).getByRole('link').evaluateAll((els) => els.map((e) => e.getAttribute('href')));
  const presets = () => page.getByRole('list', { name: 'Mẫu chuyển động' }).getByRole('link').evaluateAll((els) => els.map((e) => new URL(e.getAttribute('href')!, location.href).searchParams.get('preset')));
  const tile = (id: string) => page.locator(`a[href="/create?preset=${id}"]`);
  const [hot, warm] = [presetIds.at(-1)!, presetIds.at(-2)!];

  await expect(suggested).toHaveAttribute('aria-pressed', 'true');
  await expect(popular).toHaveAttribute('aria-pressed', 'false');
  expect(await tools()).toEqual(['/try-on', '/image-generation', '/create', '/marketing-studio', '/apps', '/library']);
  expect(await presets()).toEqual(['none', ...presetIds]);

  await popular.click();
  await expect(page).toHaveURL(/\/explore\?sort=popular$/);
  await expect(popular).toHaveAttribute('aria-pressed', 'true');
  // Apps: 3 + 2 + 7 + 1 Runs this week; Create: the 6 preset Runs (the 8-day-old ones are outside the window); the rest tie at 0 in the curated order.
  await expect.poll(tools).toEqual(['/apps', '/create', '/try-on', '/image-generation', '/marketing-studio', '/library']);
  expect(await presets()).toEqual(['none', hot, warm, ...presetIds.slice(0, -2)]);
  await expect(tile(hot)).toHaveAccessibleName(/, 4 lượt dùng tuần này$/);
  await expect(tile(hot).locator('.explore-prompt-uses')).toHaveText('4 lượt dùng tuần này');
  await expect(tile(warm).locator('.explore-prompt-uses')).toHaveCount(0); // two Runs: nothing

  await page.reload();
  await expect(popular).toHaveAttribute('aria-pressed', 'true');
  expect((await tools())[0]).toBe('/apps');
  expect((await presets())[1]).toBe(hot);

  await suggested.click();
  await expect(page).toHaveURL(/\/explore$/);
  await expect.poll(tools).toEqual(['/try-on', '/image-generation', '/create', '/marketing-studio', '/apps', '/library']);
});

test('the sort switch keeps another query (?models=all), and on a touch phone its buttons are 44 px tall and nothing runs sideways', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  try {
    await signIn(page, 'popw');
    await page.goto('/explore?models=all');
    const sort = page.getByRole('group', { name: 'Sắp xếp công cụ và mẫu chuyển động' });
    await sort.getByRole('button', { name: 'Đang được dùng nhiều' }).tap();
    await expect(page).toHaveURL(/\/explore\?(models=all&sort=popular|sort=popular&models=all)$/);
    for (const button of await sort.getByRole('button').all()) expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  } finally {
    await context.close();
  }
});
