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
const APP = 'pop-app'; // a published custom app of the workspace: its Runs count on its card

test.beforeAll(async () => {
  const popw = (await db.query('select id from users where email = $1', [USERS.popw.email])).rows[0].id as string;
  const system = (await db.query('select id from users where email = $1 and system', [USERS.syslib.email])).rows[0].id as string; // serve.ts marks it a system account
  await db.query(`insert into workspaces (id, name) values ($1, 'E2E Popular Co') on conflict do nothing`, [WS]);
  await db.query(`delete from workspace_members where user_id = $1 and workspace_id = 'ws_vet'`, [popw]);
  await db.query(`insert into workspace_members (workspace_id, user_id, role) values ($1, $2, 'owner') on conflict do nothing`, [WS, popw]);
  presetIds = (await db.query(`select id from presets where feature = 'video' and enabled order by sort_order, id`)).rows.map((r) => r.id as string);
  const [hot, warm] = [presetIds.at(-1)!, presetIds.at(-2)!]; // the last two in the curated order, so the sort has to move them
  /** `n` failed mock jobs of `feature` made `ago` ago in the workspace, named `prefix-1`..`prefix-n`; `params` is what the page sends, `batch` the Run id they share, `user` who ran them. */
  const run = (prefix: string, n: number, feature: string, o: { preset?: string; batch?: string; ago?: string; params?: Record<string, string>; user?: string } = {}) =>
    db.query(
      `insert into jobs (id, user_id, team_id, feature, model, provider, preset_id, prompt, aspect, duration_s, input_asset_ids, params, status, is_mock, created_at, workspace_id)
       select $1 || '-' || n, $2, 'team-unassigned', $3, 'mock-e2e', 'mock', $4, 'p', '9:16', 5, '{}', $5::jsonb, 'failed', true, now() - $6::interval, $7 from generate_series(1, $8::int) n`,
      [prefix, o.user ?? popw, feature, o.preset ?? null, { ...o.params, ...(o.batch && { batch: o.batch }) }, o.ago ?? '1 hour', WS, n],
    );
  await run('pop-media', 3, 'media_optimizer'); // three Runs: the line shows
  await run('pop-face', 2, 'face_swap'); // two: nothing
  await run('pop-reframe', 7, 'reframe');
  await run('pop-bulk', 25, 'image_upscale', { batch: 'pop-bulk-run' }); // one bulk Run of 25 photos: one use
  await run('pop-hot', 4, 'video', { preset: hot });
  await run('pop-warm', 2, 'video', { preset: warm });
  await run('pop-old', 5, 'video', { preset: hot, ago: '8 days' }); // outside the window
  // A system account's Runs never count: 5 of Reframe would make 12, and 8 more of Try On would put it far above Create.
  await run('pop-sys', 5, 'reframe', { user: system });
  await run('pop-sys-tryon', 8, 'try_on', { user: system });
  await run('pop-tryon', 8, 'try_on');
  await run('pop-image', 2, 'image');
  // A Marketing Run of 4 clips and a camera-angle Run of 3 each share one batch id, as the pages send them: one use each (Marketing 1, Create 6 + 1 = 7, under Try On's 8).
  await run('pop-mk', 4, 'marketing', { batch: '7d0e2f54-3c55-4a0e-9a59-2f3f0c8b1a41', params: { audio: 'on' } });
  await run('pop-angles', 3, 'video', { batch: '7d0e2f54-3c55-4a0e-9a59-2f3f0c8b1a42', params: { audio: 'on' } });
  // A custom app's Runs are marked with the app (params.app), as api/custom-apps/[id]/run makes them: 3 on its card, none on Create.
  const model = (await db.query(`select id from model_configs where kind = 'video' order by id limit 1`)).rows[0].id as string;
  await db.query(`insert into assets (id, owner_id, kind, s3_key, filename, mime, bytes, workspace_id) values ('pop-app-out', $1, 'output', 'pop/app-out', 'out.mp4', 'video/mp4', 10, $2)`, [popw, WS]);
  await db.query(
    `insert into jobs (id, user_id, team_id, feature, model, provider, prompt, aspect, duration_s, input_asset_ids, params, status, output_asset_id, is_mock, workspace_id)
     values ('pop-app-src', $1, 'team-unassigned', 'video', 'mock-e2e', 'mock', 'spin it', '9:16', 5, '{}', '{}', 'succeeded', 'pop-app-out', true, $2)`,
    [popw, WS],
  );
  await db.query(
    `insert into custom_apps (id, workspace_id, source_job_id, feature, name, description, category, model, prompt, aspect, duration_s, params, inputs, created_by, published_at)
     values ($1, $2, 'pop-app-src', 'video', 'E2E Popular App', 'x', 'video', $3, 'spin it', '9:16', 5, '{}', '[{"slot":{"label":"Ảnh","hint":""}}]', $4, now())`,
    [APP, WS, model, popw],
  );
  await run('pop-custom', 3, 'video', { params: { audio: 'on', app: APP } });
  // A Smart Remake makes no job but a remakes row: one use on its card, and none for Create.
  await db.query(`insert into analyses (id, user_id, team_id, source_key, status, workspace_id) values ('pop-an', $1, 'team-unassigned', 's', 'succeeded', $2)`, [popw, WS]);
  await db.query(`insert into remakes (id, user_id, team_id, analysis_id, shots, workspace_id) select 'pop-rm-' || n, $1, 'team-unassigned', 'pop-an', '[1]', $2 from generate_series(1, 3) n`, [popw, WS]);
});

test.afterAll(async () => {
  try {
    await db.query('delete from remakes where workspace_id = $1', [WS]);
    await db.query('delete from analyses where workspace_id = $1', [WS]);
    await db.query('delete from custom_apps where workspace_id = $1', [WS]);
    await db.query('delete from jobs where workspace_id = $1', [WS]);
    await db.query('delete from assets where workspace_id = $1', [WS]);
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
  await expect(card(page, 'Đổi khung hình').locator('.app-card-uses')).toHaveText('7 lượt dùng tuần này'); // the system account's 5 Reframes are not in it
  await expect(card(page, 'Tăng độ phân giải')).toBeVisible();
  await expect(card(page, 'Tăng độ phân giải').locator('.app-card-uses')).toHaveCount(0); // 25 photos in one Run is one use
  await expect(card(page, 'Đổi khuôn mặt').locator('.app-card-uses')).toHaveCount(0); // two Runs
  // A custom app counts its own Runs (3), which are not Create's; Smart Remake (3 remakes) only where its flags put its card on the page.
  await expect(card(page, 'E2E Popular App').locator('.app-card-uses')).toHaveText('3 lượt dùng tuần này');
  const remake = card(page, 'Smart Remake');
  if ((await remake.count()) > 0) await expect(remake.locator('.app-card-uses')).toHaveText('3 lượt dùng tuần này');
  await expect(page.locator('.app-card-uses')).toHaveCount(3 + (await remake.count()));
  expect(await card(page, 'Tối ưu media').locator('.app-card-uses').evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(12);

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(card(page, 'Đổi khung hình').locator('.app-card-uses')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);

  await page.context().clearCookies();
  await signIn(page, 'popv');
  await page.goto('/apps');
  await expect(card(page, 'Tối ưu media')).toBeVisible();
  // The company workspace shows its own week (earlier specs make Runs there in the shared e2e database), never popw's 3 and 7.
  for (const [name, feature] of [['Tối ưu media', 'media_optimizer'], ['Đổi khung hình', 'reframe']] as const) {
    const { n } = (await db.query(`select count(distinct coalesce(j.params->>'batch', j.id))::int as n from jobs j join users u on u.id = j.user_id where j.workspace_id = 'ws_vet' and j.feature = $1 and j.created_at > now() - interval '7 days' and j.retry_of is null and not u.system`, [feature])).rows[0];
    const line = card(page, name).locator('.app-card-uses');
    if (n >= 3) await expect(line).toHaveText(`${n} lượt dùng tuần này`);
    else await expect(line).toHaveCount(0);
  }
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
  // Apps: 3 + 2 + 7 + 1 Runs, the custom app's 3 and the 3 Smart Remakes; Try On: 8 (the system account's 8 more do not count); Create: the 6 preset Runs and the camera-angle Run (the 8-day-old
  // ones are outside the window, the custom app's 3 are the app's, not Create's); Image Generation: 2; Marketing Studio: its one Run of 4 clips; the Library has none. The order is by count, the curated one breaking ties.
  await expect.poll(tools).toEqual(['/apps', '/try-on', '/create', '/image-generation', '/marketing-studio', '/library']);
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
    await expect(page.getByRole('link', { name: 'Chỉ xem nổi bật' })).toHaveAttribute('href', '/explore?sort=popular#models'); // the models link keeps the sort
    // offsetHeight, not boundingBox: the tapped button can still be :active, drawn at scale .97 (globals.css's press feedback).
    for (const button of await sort.getByRole('button').all()) expect(await button.evaluate((el) => (el as HTMLElement).offsetHeight)).toBeGreaterThanOrEqual(44);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  } finally {
    await context.close();
  }
});
