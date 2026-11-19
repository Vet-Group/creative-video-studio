import { createPool } from '@cvs/db/client';
import { type APIResponse, expect, type Page, test } from '@playwright/test';
import { png, signIn } from './support.test';
import { USERS } from './users';

// Workspaces, phase 2 (docs/WORKSPACES.md): nothing crosses between the company workspace and a partner's, in either direction, also for a user in both.
// The partner workspace and company content are seeded straight into the e2e database (serve.ts's), and the company rows are removed afterwards so the
// specs after this one see the Library, Examples and Explore they expect.
const url = new URL(process.env.DATABASE_URL!);
url.pathname = `/${process.env.CVS_E2E_DB ?? 'cvs_e2e'}`;
const db = createPool(url.toString(), 2);
const one = async (q: string, params: unknown[] = []) => (await db.query(q, params)).rows[0];
const userId = async (key: keyof typeof USERS) => (await one('select id from users where email = $1', [USERS[key].email])).id as string;

const C = {
  job: 'wsiso-job', input: 'wsiso-in', output: 'wsiso-out', photo: 'wsiso-photo', modelPic: 'wsiso-model-pic', source: 'wsiso-src',
  template: 'wsiso-tpl', hook: 'wsiso-hook', model: 'wsiso-model', analysis: 'wsiso-analysis', store: 'wsiso-store', feedback: 'wsiso-fb',
};
const COMPANY_IDS = Object.values(C);

test.beforeAll(async () => {
  const [comp, part, dual] = [await userId('wscomp'), await userId('wspart'), await userId('wsdual')];
  await db.query(`insert into workspaces (id, name) values ('ws_partner', 'E2E Partner Co') on conflict do nothing`);
  // The partner seller is in ws_partner only; the dual user joins it after ws_vet, so ws_vet stays their oldest (default) workspace.
  await db.query(`delete from workspace_members where user_id = $1 and workspace_id = 'ws_vet'`, [part]);
  await db.query(`insert into workspace_members (workspace_id, user_id, role) values ('ws_partner', $1, 'owner'), ('ws_partner', $2, 'member') on conflict do nothing`, [part, dual]);
  // Company content, owned by the company member: a succeeded clip with its input, an Example, a company template, a company hook with a photo, a shared
  // AI model, a shared analysis, a store and a feedback item. Old, and last on the Examples tab, in case anything reads them before the clean-up.
  await db.query(`insert into stores (id, name, code, workspace_id) values ($1, 'WSISO Store', 'WSISO', 'ws_vet')`, [C.store]);
  await db.query(
    `insert into assets (id, owner_id, kind, s3_key, filename, mime, bytes, workspace_id) values
       ($2, $1, 'input', 'wsiso/in', 'in.png', 'image/png', 10, 'ws_vet'), ($3, $1, 'output', 'wsiso/out', 'out.png', 'image/png', 10, 'ws_vet'),
       ($4, $1, 'input', 'wsiso/photo', 'photo.png', 'image/png', 10, 'ws_vet'), ($5, $1, 'input', 'wsiso/model', 'model.png', 'image/png', 10, 'ws_vet'),
       ($6, $1, 'input', 'wsiso/src', 'src.mp4', 'video/mp4', 10, 'ws_vet')`,
    [comp, C.input, C.output, C.photo, C.modelPic, C.source],
  );
  await db.query(
    `insert into jobs (id, user_id, team_id, store_id, feature, model, provider, prompt, aspect, duration_s, input_asset_ids, status, output_asset_id, is_mock, created_at, finished_at, workspace_id)
     values ($1, $2, 'team-unassigned', $3, 'video', 'mock-e2e', 'mock', 'WSISO company prompt', '9:16', 5, $4, 'succeeded', $5, true, '2020-01-01', '2020-01-01', 'ws_vet')`,
    [C.job, comp, C.store, [C.input], C.output],
  );
  await db.query(`insert into examples (job_id, added_by, position) values ($1, $2, 1000000)`, [C.job, comp]);
  await db.query(`insert into user_templates (id, user_id, feature, name, data, is_company, workspace_id) values ($1, $2, 'video', 'WSISO template', $3, true, 'ws_vet')`, [
    C.template, comp, JSON.stringify({ images: [C.input] }),
  ]);
  await db.query(`insert into user_choices (id, user_id, kind, name, phrase, is_company, image_asset_id, workspace_id) values ($1, $2, 'hook', 'WSISO hook', 'a company hook', true, $3, 'ws_vet')`, [C.hook, comp, C.photo]);
  await db.query(`insert into fashion_models (id, user_id, name, asset_id, shared, workspace_id) values ($1, $2, 'WSISO model', $3, true, 'ws_vet')`, [C.model, comp, C.modelPic]);
  await db.query(
    `insert into analyses (id, user_id, team_id, source_key, status, result, shared_at, shared_title, workspace_id)
     values ($1, $2, 'team-unassigned', 'wsiso/src', 'succeeded', '{"shots": []}', now(), 'WSISO shelf', 'ws_vet')`,
    [C.analysis, comp],
  );
  await db.query(`insert into feedback (id, user_id, team_id, kind, title, body, image_asset_ids, workspace_id) values ($1, $2, 'team-unassigned', 'bug', 'WSISO feedback', 'b', '{}', 'ws_vet')`, [C.feedback, comp]);
});

test.afterAll(async () => {
  try {
    await db.query('delete from examples where job_id = $1', [C.job]);
    await db.query('delete from favorites where job_id = $1', [C.job]);
    await db.query('delete from jobs where id = $1', [C.job]);
    await db.query('delete from user_templates where id = $1', [C.template]);
    await db.query('delete from user_choices where id = $1', [C.hook]);
    await db.query('delete from fashion_models where id = $1', [C.model]);
    await db.query('delete from analyses where id = $1', [C.analysis]);
    await db.query('delete from feedback where id = $1', [C.feedback]);
    await db.query(`delete from assets where id like 'wsiso-%'`);
    await db.query('delete from stores where id = $1', [C.store]);
  } finally {
    await db.end();
  }
});

const ids = async (res: APIResponse, list: string, key = 'id'): Promise<string[]> => {
  expect(res.status()).toBe(200);
  return ((await res.json()) as Record<string, Record<string, string>[]>)[list]!.map((r) => r[key]!);
};
const status = async (res: Promise<APIResponse>) => (await res).status();
/** The analysis routes answer 404 while REA_ANALYZE_ENABLED is off (CI), so a list is read only when they are on. */
const shelf = async (page: Page) => {
  const res = await page.request.get('/api/analyses?shared=1');
  return res.status() === 404 ? [] : ids(res, 'analyses');
};
const upload = async (page: Page, buffer = png()) => {
  const res = await page.request.post('/api/assets', { multipart: { file: { name: 'wsiso.png', mimeType: 'image/png', buffer } } });
  expect(res.status()).toBe(201);
  return ((await res.json()) as { assets: { id: string }[] }).assets[0]!.id;
};
const runOn = (page: Page, assetIds: string[], extra: Record<string, unknown> = {}) =>
  page.request.post('/api/jobs', { data: { assetIds, modelId: 'mock-e2e', presetId: 'gentle-push-in', ratio: '9:16', durationSec: 5, ...extra } });

test('a partner seller sees none of the company: lists, items by id and every copy path', async ({ page }) => {
  await signIn(page, 'wspart');
  const get = (path: string) => page.request.get(path);
  // The lists: Library (and its Examples view), History, templates, hooks, AI models, the reference-video shelf, stores and the feedback board.
  expect(await ids(await get('/api/library'), 'clips')).not.toContain(C.job);
  expect(await ids(await get('/api/library?example=1'), 'clips')).not.toContain(C.job);
  expect(await ids(await get('/api/jobs?mine'), 'jobs')).not.toContain(C.job);
  expect(await ids(await get('/api/templates?feature=video'), 'templates')).not.toContain(C.template);
  expect(await ids(await get('/api/choices'), 'hooks')).not.toContain(C.hook);
  expect(await ids(await get('/api/fashion-models'), 'models')).not.toContain(C.model);
  expect(await shelf(page)).not.toContain(C.analysis);
  expect(await ids(await get('/api/stores'), 'stores')).not.toContain(C.store);
  expect(await ids(await get('/api/feedback'), 'items')).not.toContain(C.feedback);
  const library = (await (await get('/api/library')).json()) as { creators: { id: string }[]; stores: { id: string }[] };
  expect(library.creators.map((c) => c.id)).not.toContain(await userId('wscomp'));
  expect(library.stores.map((s) => s.id)).not.toContain(C.store);
  // Explore's best clips and hero strip are server-rendered from the same rule.
  await page.goto('/explore');
  expect(await page.content()).not.toContain('wsiso-');

  // By id: not found, as for an id that does not exist.
  for (const path of [`/api/jobs/${C.job}`, `/api/templates/${C.template}`, `/api/analyses/${C.analysis}`, `/api/feedback/${C.feedback}`]) expect(await status(get(path)), path).toBe(404);
  for (const id of [C.output, C.input, C.photo, C.modelPic, C.source]) {
    for (const path of [`/api/assets/${id}`, `/api/assets/${id}/content`, `/api/assets/${id}/thumb`]) expect(await status(get(path)), path).toBe(404);
  }
  // A download needs the token GET /api/assets/:id gives, which a foreign id never gets (a token carried across is checked in the dual-user test).
  expect(await status(get(`/api/assets/${C.output}/download`))).toBe(await status(get('/api/assets/wsiso-none/download')));

  // Every path that copies or reuses a company row refuses it.
  const own = await upload(page);
  expect(await status(page.request.post('/api/assets/copy', { data: { assetId: C.output } }))).toBe(404);
  expect(await status(runOn(page, [C.input]))).toBe(400);
  expect(await status(runOn(page, [own], { storeId: C.store }))).toBe(400);
  expect(await status(runOn(page, [], { retryOf: C.job }))).toBe(404);
  expect(await status(page.request.post('/api/remakes', { data: { analysisId: C.analysis, productAssetId: own, shots: [0] } }))).toBe(404);
  expect(await status(page.request.post('/api/suggestions', { data: { field: 'scenes', analysisId: C.analysis, productAssetId: own } }))).toBe(404);
  expect(await status(page.request.put(`/api/jobs/${C.job}/favorite`, { data: { favorite: true } }))).toBe(404);
  expect(await status(page.request.post('/api/library/zip', { data: { ids: [C.job] } }))).toBe(403);
  expect(await status(page.request.put(`/api/stores/${C.store}/pin`))).toBe(404);
  expect(await status(page.request.put(`/api/feedback/${C.feedback}/vote`))).toBe(404);
  expect(await status(page.request.post(`/api/feedback/${C.feedback}/comments`, { data: { body: 'hi' } }))).toBe(404);
  expect(await status(page.request.post('/api/templates', { data: { feature: 'video', name: 'Mine', data: { images: [C.input] } } }))).toBe(400);
  expect(await status(page.request.post('/api/choices', { data: { kind: 'hook', name: 'Mine', phrase: 'mine', imageAssetId: C.photo } }))).toBe(400);
  expect(await status(page.request.post('/api/feedback', { data: { kind: 'bug', title: 't', body: 'b', assetIds: [C.input] } }))).toBe(400);
  // Proposing to the company's preset catalog is the company's.
  expect(await status(page.request.post('/api/preset-proposals', { data: { label: 'Mine', prompt: 'mine' } }))).toBe(403);
  // No company spend figure leaves the server.
  const models = await get('/api/models?feature=video&ratio=9:16&durationSec=5');
  expect(models.status()).toBe(200);
  const video = (await models.json()) as { models: { creditUsd: string | null }[]; monthToDate: unknown };
  expect(video.monthToDate).toBeNull();
  expect(video.models.length).toBeGreaterThan(0);
  expect(video.models.every((m) => m.creditUsd === null)).toBe(true);
  const images = (await (await get('/api/image-models?feature=breed_swap')).json()) as { models: { creditUsd: string | null }[] };
  expect(images.models.length).toBeGreaterThan(0);
  expect(images.models.every((m) => m.creditUsd === null)).toBe(true);
});

test('what a partner seller makes stays in the partner workspace, and the company sees none of it', async ({ browser, page }) => {
  await signIn(page, 'wspart');
  // The breed swap app, the partner's main use, run from its page on the mock model: the job, its output and its preview.
  await page.goto('/apps/breed-swap');
  await page.getByLabel('Ảnh gốc có chó').setInputFiles({ name: 'dog.png', mimeType: 'image/png', buffer: png() });
  await page.getByRole('button', { name: /^Mô hình / }).click();
  await page.getByRole('option', { name: /Mock breeds E2E/ }).click();
  await page.getByRole('group', { name: 'Giống chó cần tạo' }).getByText('Pug', { exact: true }).click();
  await page.getByRole('button', { name: /^Chạy/ }).click();
  await expect(page.getByText('Đã gửi lượt tạo')).toBeVisible();
  const mine = async () => ((await (await page.request.get('/api/jobs?mine')).json()) as { jobs: { id: string; status: string; feature: string }[] }).jobs;
  await expect.poll(async () => (await mine()).filter((j) => j.feature === 'breed_swap').map((j) => j.status), { timeout: 90_000 }).toEqual(['succeeded']);
  const job = (await mine()).find((j) => j.feature === 'breed_swap')!;
  const output = ((await (await page.request.get(`/api/jobs/${job.id}`)).json()) as { outputAssetId: string }).outputAssetId;
  // Its Library card shows no cost: spend figures are the company's.
  const card = ((await (await page.request.get('/api/library')).json()) as { clips: { id: string; costUsd: string | null }[] }).clips.find((c) => c.id === job.id);
  expect(card).toMatchObject({ costUsd: null });
  const photo = await upload(page);
  const template = await page.request.post('/api/templates', { data: { feature: 'video', name: 'Partner template', data: { images: [photo] } } });
  expect(template.status()).toBe(201);
  const hook = await page.request.post('/api/choices', { data: { kind: 'hook', name: 'Partner hook', phrase: 'a partner hook', imageAssetId: photo } });
  expect(hook.status()).toBe(201);
  const item = await page.request.post('/api/feedback', { data: { kind: 'feature', title: 'Partner feedback', body: 'b', assetIds: [photo] } });
  expect(item.status()).toBe(201);
  const [templateId, hookId, itemId] = await Promise.all([template, hook, item].map(async (r) => ((await r.json()) as { id: string }).id));

  // Every row the partner made is filed under ws_partner, the worker's output, preview and ledger rows included.
  const part = await userId('wspart');
  const where = `workspace_id <> 'ws_partner'`;
  for (const [table, owner] of [['jobs', 'user_id'], ['assets', 'owner_id'], ['cost_entries', 'user_id'], ['user_templates', 'user_id'], ['user_choices', 'user_id'], ['feedback', 'user_id'], ['suggestion_runs', 'user_id'], ['analyses', 'user_id'], ['remakes', 'user_id'], ['fashion_models', 'user_id']]) {
    expect(Number((await one(`select count(*) from ${table} where ${owner} = $1 and ${where}`, [part])).count), table).toBe(0);
  }
  expect(Number((await one(`select count(*) from assets where owner_id = $1 and kind = 'output'`, [part])).count)).toBeGreaterThanOrEqual(2); // output and preview
  expect(Number((await one('select count(*) from cost_entries where job_id = $1', [job.id])).count)).toBeGreaterThanOrEqual(1);

  // The company member sees none of it.
  const context = await browser.newContext();
  const company = await context.newPage();
  try {
    await signIn(company, 'wscomp');
    const get = (path: string) => company.request.get(path);
    expect(await ids(await get('/api/library'), 'clips')).not.toContain(job.id);
    expect(await ids(await get('/api/templates?feature=video'), 'templates')).not.toContain(templateId);
    expect(await ids(await get('/api/choices'), 'hooks')).not.toContain(hookId);
    expect(await ids(await get('/api/feedback'), 'items')).not.toContain(itemId);
    for (const path of [`/api/jobs/${job.id}`, `/api/templates/${templateId}`, `/api/feedback/${itemId}`, `/api/assets/${output}/content`, `/api/assets/${photo}/thumb`]) {
      expect(await status(get(path)), path).toBe(404);
    }
    expect(await status(runOn(company, [photo]))).toBe(400);
    // A forged cookie naming the partner workspace changes nothing for a user who is not in it.
    await context.addCookies([{ name: 'cvs_ws', value: 'ws_partner', url: company.url() }]);
    expect(await status(get(`/api/jobs/${job.id}`))).toBe(404);
    expect(await status(get(`/api/jobs/${C.job}`))).toBe(200);
  } finally {
    await context.close();
  }
});

test('a user in both workspaces switches by the cookie, carries nothing across, and a stale tab cannot write', async ({ page, context }) => {
  await signIn(page, 'wsdual');
  const get = (path: string) => page.request.get(path);
  // ws_vet first: the company's clip opens, and an upload made here is the company's.
  expect(await status(get(`/api/jobs/${C.job}`))).toBe(200);
  await page.goto('/create');
  await expect(page.locator('meta[name="cvs-workspace"]')).toHaveAttribute('content', 'ws_vet');
  const bytes = png();
  const inCompany = await upload(page, bytes);
  const { downloadUrl } = (await (await get(`/api/assets/${C.output}`)).json()) as { downloadUrl: string };

  // The switch: the cookie names ws_partner.
  await context.addCookies([{ name: 'cvs_ws', value: 'ws_partner', url: page.url() }]);
  expect(await status(get(`/api/jobs/${C.job}`))).toBe(404);
  expect(await ids(await get('/api/library'), 'clips')).not.toContain(C.job);
  expect(await ids(await get('/api/templates?feature=video'), 'templates')).not.toContain(C.template);
  // The company upload is not theirs to use here: not in the picker, not as a job input, a template photo or a hook photo.
  expect(await ids(await get('/api/assets?recent=uploads'), 'assets')).not.toContain(inCompany);
  expect(await status(get(`/api/assets/${inCompany}/content`))).toBe(404);
  // A download link issued in ws_vet does not open the company's file here.
  expect(await status(get(downloadUrl))).toBe(404);
  expect(await status(runOn(page, [inCompany]))).toBe(400);
  expect(await status(page.request.post('/api/templates', { data: { feature: 'video', name: 'Carried', data: { images: [inCompany] } } }))).toBe(400);
  expect(await status(page.request.post('/api/choices', { data: { kind: 'hook', name: 'Carried', phrase: 'carried', imageAssetId: inCompany } }))).toBe(400);
  // The same file uploaded again is stored again, in this workspace: the dedupe is per workspace.
  const inPartner = await upload(page, bytes);
  expect(inPartner).not.toBe(inCompany);
  expect((await one('select workspace_id from assets where id = $1', [inPartner])).workspace_id).toBe('ws_partner');

  // The tab still shows ws_vet (its meta): an upload from its form carries that workspace (lib/api.ts) and is refused, and nothing is stored.
  const refused = page.waitForResponse((r) => r.url().endsWith('/api/assets') && r.request().method() === 'POST');
  await page.getByLabel('Ảnh sản phẩm').setInputFiles({ name: 'stale.png', mimeType: 'image/png', buffer: png() });
  expect((await refused).status()).toBe(409);
  expect((await refused).request().headers()['x-cvs-workspace']).toBe('ws_vet');
  // The same from any write sent with the old header; a reload renders ws_partner and writes again.
  const stale = await page.request.post('/api/choices', { data: { kind: 'hook', name: 'Stale', phrase: 'stale' }, headers: { 'x-cvs-workspace': 'ws_vet' } });
  expect(stale.status()).toBe(409);
  expect(((await stale.json()) as { error: string }).error).toBe('workspace_changed');
  await page.reload();
  await expect(page.locator('meta[name="cvs-workspace"]')).toHaveAttribute('content', 'ws_partner');
  const fresh = await page.request.post('/api/choices', { data: { kind: 'hook', name: 'Fresh', phrase: 'fresh' }, headers: { 'x-cvs-workspace': 'ws_partner' } });
  expect(fresh.status()).toBe(201);
  const freshId = ((await fresh.json()) as { id: string }).id;
  expect((await one('select workspace_id from user_choices where id = $1', [freshId])).workspace_id).toBe('ws_partner');

  // Back to ws_vet: the partner hook is gone from the list and the company clip is back.
  await context.addCookies([{ name: 'cvs_ws', value: 'ws_vet', url: page.url() }]);
  expect(await ids(await get('/api/choices'), 'hooks')).not.toContain(freshId);
  expect(await status(get(`/api/jobs/${C.job}`))).toBe(200);
});
