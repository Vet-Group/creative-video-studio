// Custom apps against a disposable database on the compose Postgres (`pnpm services:up`): an Admin makes an app of a live clip (/api/admin/apps), a member runs it
// (/api/custom-apps/[id]/run, through the unchanged /api/jobs handler, so no worker and no provider call), and a clip that backs an app cannot be deleted.
import { randomBytes } from 'node:crypto';
import { createTestDatabase } from '@cvs/db/testing';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';

vi.setConfig({ testTimeout: 60_000 });

const testDb = await createTestDatabase();
process.env.DATABASE_URL = testDb.url;
process.env.BETTER_AUTH_SECRET = randomBytes(32).toString('hex');
process.env.APP_URL = 'http://localhost';

const { auth, pool } = await import('@/lib/auth');
const { stopBoss } = await import('@/lib/queue');
const { POST: createApp } = await import('../admin/apps/route');
const { PATCH: patchApp, DELETE: deleteApp } = await import('../admin/apps/[id]/route');
const { POST: runApp } = await import('./[id]/run/route');
const { POST: runJob } = await import('../jobs/route');
const { DELETE: deleteJob } = await import('../jobs/[id]/route');
const { adminApp, adminApps, appSource, customApp, publishedApps } = await import('@/lib/custom-apps-db');

const PASSWORD = 'correct-horse-battery';
type Who = { id: string; cookie: string };
let seq = 0;

async function newUser(role: 'member' | 'admin' = 'member', workspace?: string): Promise<Who> {
  const email = `u${++seq}@example.test`;
  const { user } = await auth.api.createUser({ body: { email, name: email, password: PASSWORD, role } });
  const res = await auth.api.signInEmail({ body: { email, password: PASSWORD }, asResponse: true });
  if (workspace) await pool.query(`insert into workspace_members (workspace_id, user_id, role) values ($1, $2, 'member')`, [workspace, user.id]);
  return { id: user.id, cookie: res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ') };
}
const req = (who: Who | null, path: string, method: string, body?: unknown, extra = '') =>
  new Request(`http://localhost${path}`, { method, headers: { 'content-type': 'application/json', ...(who && { cookie: who.cookie + extra }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const OTHER = '; cvs_ws=ws_other';

const make = (who: Who | null, body: unknown, extra = '') => createApp(req(who, '/api/admin/apps', 'POST', body, extra));
const patch = (who: Who, id: string, body: unknown, extra = '') => patchApp(req(who, `/api/admin/apps/${id}`, 'PATCH', body, extra), ctx(id));
const drop = (who: Who, id: string, extra = '') => deleteApp(req(who, `/api/admin/apps/${id}`, 'DELETE', undefined, extra), ctx(id));
const run = (who: Who | null, id: string, body: unknown, extra = '') => runApp(req(who, `/api/custom-apps/${id}/run`, 'POST', body, extra), ctx(id));
const delClip = (who: Who, id: string) => deleteJob(req(who, `/api/jobs/${id}`, 'DELETE'), ctx(id));
const json = async (res: Response) => (await res.json()) as Record<string, any>;
const jobCount = async () => (await pool.query('select count(*)::int as n from jobs')).rows[0].n as number;
const audits = async (target: string) => (await pool.query('select action from audit_entries where target = $1 order by id', [target])).rows.map((r) => r.action as string);

async function inputAsset(owner: string, workspace = 'ws_vet'): Promise<string> {
  const id = `in-${++seq}`;
  await pool.query(`insert into assets (id, owner_id, kind, s3_key, filename, mime, bytes, workspace_id) values ($1, $2, 'input', $1, $1, 'image/png', 1, $3)`, [id, owner, workspace]);
  return id;
}

interface SourceOptions { owner: string; feature?: string; model?: string; status?: string; preset?: string | null; params?: Record<string, string>; inputs?: number; workspace?: string; deleted?: boolean; prompt?: string; enhanced?: string | null; aspect?: string; duration?: number }
/** A succeeded clip of `owner` with `inputs` input photos (their ids are `inputIds`): the source of an app. */
async function source(o: SourceOptions): Promise<{ id: string; inputIds: string[] }> {
  const id = `src-${++seq}`;
  const workspace = o.workspace ?? 'ws_vet';
  const inputIds = await Promise.all(Array.from({ length: o.inputs ?? 2 }, () => inputAsset(o.owner, workspace)));
  const done = (o.status ?? 'succeeded') === 'succeeded';
  await pool.query(`insert into assets (id, owner_id, kind, s3_key, filename, mime, bytes, workspace_id) values ($1, $2, 'output', $1, $1, 'video/mp4', 1, $3), ($4, $2, 'output', $4, $4, 'image/jpeg', 1, $3)`, [`${id}-out`, o.owner, workspace, `${id}-poster`]);
  await pool.query(
    `insert into jobs (id, user_id, team_id, feature, model, provider, preset_id, prompt, enhanced_prompt, aspect, duration_s, params, input_asset_ids, status, output_asset_id, poster_asset_id, deleted_at, workspace_id)
     values ($1, $2, 'team-unassigned', $3, $4, 'fal', $5, $6, $7, $8, $9, $10::jsonb, $11, $12, $13, $14, case when $15::boolean then now() end, $16)`,
    [id, o.owner, o.feature ?? 'video', o.model ?? 'app-fal', o.preset ?? null, o.prompt ?? '  spin the product  ', o.enhanced ?? null, o.aspect ?? '9:16', (o.feature ?? 'video') === 'image' ? 0 : (o.duration ?? 5), JSON.stringify(o.params ?? {}), inputIds, o.status ?? 'succeeded', done ? `${id}-out` : null, done ? `${id}-poster` : null, o.deleted ?? false, workspace],
  );
  return { id, inputIds };
}

const mk = (jobId: string, over: Record<string, unknown> = {}) => ({ jobId, name: ' Video xoay ', description: 'Xoay sản phẩm', category: 'video', prompt: ' spin it ', inputs: [{ slot: { label: ' Ảnh sản phẩm ', hint: 'Nền trắng' } }, { fixed: true }], ...over });

let admin: Who;
let member: Who;
let adminOther: Who; // an Admin of ws_other only
let memberOther: Who; // a member of ws_other only

beforeAll(async () => {
  await pool.query(`insert into workspaces (id, name) values ('ws_other', 'Other')`);
  await pool.query(
    `insert into model_configs (id, provider, endpoint, label, kind, features, ratios, durations_sec, max_images, output_resolution, usd_per_second, image_prices, max_prompt_chars, sources, enabled) values
       ('app-fal', 'fal', 'x', 'App fal', 'video', '{video}', '{9:16,1:1}', '{5,10}', 4, '720p', 0.2, null, 100, '{}', true),
       ('app-img', 'fal', 'x', 'App img', 'image', '{image}', '{auto,1:1,3:4}', '{}', 3, null, null, '{"1K": "0.1500", "2K": "0.3000"}', 2000, '{}', true),
       ('tw-cheap', 'vertex', 'x', 'Twin cheap', 'video', '{video}', '{9:16}', '{5}', 4, '720p', 0.1, null, 2000, '{}', true)`,
  );
  await pool.query(
    `insert into model_configs (id, provider, endpoint, label, kind, features, ratios, durations_sec, max_images, output_resolution, usd_per_second, twin_of, sources, enabled) values
       ('tw-dear', 'fal', 'x', 'Twin dear', 'video', '{video}', '{9:16}', '{5}', 4, '720p', 0.3, 'tw-cheap', '{}', true)`,
  );
  await pool.query(`update model_configs set enabled = false where id in ('veo-3.1', 'veo-3.1-vertex')`); // migration 0075 enables them
  await pool.query('update settings set vertex_active_project = null'); // no Vertex account can serve: the dearer twin is offered
  admin = await newUser('admin');
  member = await newUser();
  adminOther = await newUser('admin');
  memberOther = await newUser();
  for (const who of [adminOther, memberOther]) {
    await pool.query(`insert into workspace_members (workspace_id, user_id, role) values ('ws_other', $1, 'member')`, [who.id]);
    await pool.query(`delete from workspace_members where workspace_id = 'ws_vet' and user_id = $1`, [who.id]);
  }
});

afterAll(async () => {
  try {
    await stopBoss();
    await pool.end();
  } finally {
    await testDb.drop();
  }
});

describe('POST /api/admin/apps', () => {
  test('is for an Admin: 401 without a session, 403 for a member', async () => {
    const s = await source({ owner: admin.id });
    expect((await make(null, mk(s.id))).status).toBe(401);
    expect((await make(member, mk(s.id))).status).toBe(403);
    expect((await pool.query('select count(*)::int as n from custom_apps')).rows[0].n).toBe(0);
  });

  test('makes a draft of a live clip: the clip’s own settings, the pair’s cheaper model, the prompt trimmed, a fixed photo copied from the clip, audited', async () => {
    const s = await source({ owner: member.id, model: 'tw-dear', params: { audio: 'on', hookText: 'x', batch: 'b' }, enhanced: ' enhanced prompt ' });
    const res = await make(admin, mk(s.id, { prompt: '  hold the bottle  ' }));
    expect(res.status).toBe(201);
    const { id } = await json(res);
    const row = (await pool.query('select * from custom_apps where id = $1', [id])).rows[0];
    expect(row).toMatchObject({
      workspace_id: 'ws_vet', source_job_id: s.id, feature: 'video', name: 'Video xoay', description: 'Xoay sản phẩm', category: 'video', model: 'tw-cheap', prompt: 'hold the bottle',
      aspect: '9:16', duration_s: 5, params: { audio: 'on' }, created_by: admin.id, published_at: null,
      inputs: [{ slot: { label: 'Ảnh sản phẩm', hint: 'Nền trắng' } }, { fixed: s.inputIds[1] }],
    });
    expect(await audits(`app:${id}`)).toEqual(['app.create']);
  });

  test('publishes at once with `publish`, audited', async () => {
    const s = await source({ owner: admin.id });
    const { id } = await json(await make(admin, mk(s.id, { publish: true })));
    expect((await pool.query('select published_at is not null as p from custom_apps where id = $1', [id])).rows[0].p).toBe(true);
    expect(await audits(`app:${id}`)).toEqual(['app.create', 'app.publish']);
  });

  test('makes an image app from an image clip: its resolution, quality and thinking, and a duration of 0', async () => {
    const s = await source({ owner: admin.id, feature: 'image', model: 'app-img', aspect: '3:4', params: { resolution: '2K', quality: 'high', brief: 'x', batch: 'b' }, inputs: 1 });
    const res = await make(admin, mk(s.id, { category: 'photo', inputs: [{ slot: { label: 'Ảnh', hint: '' } }] }));
    expect(res.status).toBe(201);
    expect((await pool.query('select feature, aspect, duration_s, params, model from custom_apps where id = $1', [(await json(res)).id])).rows[0]).toEqual({ feature: 'image', aspect: '3:4', duration_s: 0, params: { resolution: '2K', quality: 'high' }, model: 'app-img' });
  });

  test('answers 404 for a clip of another workspace, a deleted clip, one that has not succeeded and an unknown id', async () => {
    const other = await source({ owner: adminOther.id, workspace: 'ws_other' });
    expect((await make(admin, mk(other.id))).status).toBe(404);
    expect((await make(adminOther, mk(other.id), OTHER)).status).toBe(201); // its own workspace takes it
    for (const o of [{ deleted: true }, { status: 'running' }]) expect((await make(admin, mk((await source({ owner: admin.id, ...o })).id))).status).toBe(404);
    expect((await make(admin, mk('no-such-job'))).status).toBe(404);
  });

  test('refuses a clip that cannot be an app, each with its Vietnamese reason', async () => {
    const reason = async (o: Partial<SourceOptions>) => {
      const res = await make(admin, mk((await source({ owner: admin.id, ...o })).id));
      expect(res.status).toBe(400);
      return (await json(res)).error as string;
    };
    expect(await reason({ feature: 'try_on', model: 'app-img' })).toMatch(/video hoặc ảnh/);
    expect(await reason({ inputs: 0 })).toMatch(/không có ảnh đầu vào/);
    expect(await reason({ preset: 'gentle-push-in' })).toMatch(/mẫu chuyển động hoặc phong cách/);
    expect(await reason({ params: { brand: 'on' } })).toMatch(/bộ nhận diện/);
    for (const key of ['endAssetId', 'audioAssetIds', 'videoAssetId']) expect(await reason({ params: { [key]: 'a' } })).toMatch(/khung hình cuối/);
  });

  test('refuses fields that do not hold: a wrong input count, no slot, a prompt over the model’s limit, a bad name or category', async () => {
    const s = await source({ owner: admin.id });
    const status = async (over: Record<string, unknown>) => (await make(admin, mk(s.id, over))).status;
    expect(await status({ inputs: [{ slot: { label: 'A', hint: '' } }] })).toBe(400);
    expect(await status({ inputs: [{ fixed: true }, { fixed: true }] })).toBe(400);
    expect(await status({ prompt: 'x'.repeat(101) })).toBe(400); // app-fal takes 100
    expect(await status({ prompt: 'x'.repeat(100) })).toBe(201);
    expect(await status({ name: '  ' })).toBe(400);
    expect(await status({ category: 'misc' })).toBe(400);
  });

  test('refuses a malformed body, an unknown key and a client-sent asset id, before anything is stored', async () => {
    const s = await source({ owner: admin.id });
    const before = (await pool.query('select count(*)::int as n from custom_apps')).rows[0].n;
    for (const body of [null, [], {}, mk(s.id, { extra: 1 }), mk(s.id, { inputs: [{ slot: { label: 'A', hint: '' } }, { fixed: s.inputIds[1] }] }), mk(s.id, { inputs: [{ slot: { label: 'A' } }, { fixed: true }] }), mk(s.id, { name: 5 }), mk(s.id, { publish: 'yes' }), mk(s.id, { jobId: 5 })]) {
      expect((await make(admin, body)).status).toBe(400);
    }
    expect((await pool.query('select count(*)::int as n from custom_apps')).rows[0].n).toBe(before);
  });
});

describe('PATCH and DELETE /api/admin/apps/[id]', () => {
  const draft = async (over: Record<string, unknown> = {}) => {
    const s = await source({ owner: admin.id });
    return { s, id: (await json(await make(admin, mk(s.id, over)))).id as string };
  };

  test('are for an Admin, and 404 for another workspace’s app', async () => {
    const { id } = await draft();
    expect((await patch(member, id, { name: 'X' })).status).toBe(403);
    expect((await drop(member, id)).status).toBe(403);
    expect((await patch(adminOther, id, { name: 'X' }, OTHER)).status).toBe(404);
    expect((await drop(adminOther, id, OTHER)).status).toBe(404);
    expect((await pool.query('select name from custom_apps where id = $1', [id])).rows[0].name).toBe('Video xoay');
  });

  test('changes the fields, and maps a fixed input to the clip’s own photo again; a client-sent asset id is refused', async () => {
    const { s, id } = await draft();
    const inputs = [{ fixed: true }, { slot: { label: 'Mẫu', hint: '' } }];
    expect((await patch(admin, id, { name: ' Tên mới ', description: '', prompt: ' new ', category: 'photo', inputs })).status).toBe(200);
    expect((await pool.query('select name, description, prompt, category, inputs from custom_apps where id = $1', [id])).rows[0]).toEqual({
      name: 'Tên mới', description: '', prompt: 'new', category: 'photo', inputs: [{ fixed: s.inputIds[0] }, { slot: { label: 'Mẫu', hint: '' } }],
    });
    expect((await patch(admin, id, { inputs: [{ fixed: s.inputIds[0] }, { slot: { label: 'Mẫu', hint: '' } }] })).status).toBe(400);
    expect((await patch(admin, id, { inputs: [{ fixed: true }, { fixed: true }] })).status).toBe(400); // no slot left
    expect((await patch(admin, id, { prompt: 'x'.repeat(101) })).status).toBe(400); // over the model’s limit
    expect((await patch(admin, id, {})).status).toBe(400);
    expect((await patch(admin, id, { model: 'tw-dear' })).status).toBe(400);
    expect(await audits(`app:${id}`)).toEqual(['app.create', 'app.update']);
  });

  test('publishes and unpublishes, audited, and does not audit a change that is none', async () => {
    const { id } = await draft();
    expect((await patch(admin, id, { published: true })).status).toBe(200);
    expect((await patch(admin, id, { published: true })).status).toBe(200);
    expect((await pool.query('select published_at is not null as p from custom_apps where id = $1', [id])).rows[0].p).toBe(true);
    expect((await patch(admin, id, { published: false })).status).toBe(200);
    expect((await pool.query('select published_at from custom_apps where id = $1', [id])).rows[0].published_at).toBeNull();
    expect(await audits(`app:${id}`)).toEqual(['app.create', 'app.publish', 'app.unpublish']);
  });

  test('deletes the app, audited, and then the clip deletes', async () => {
    const { s, id } = await draft();
    expect((await delClip(admin, s.id)).status).toBe(409);
    expect((await drop(admin, id)).status).toBe(200);
    expect((await pool.query('select 1 from custom_apps where id = $1', [id])).rowCount).toBe(0);
    expect(await audits(`app:${id}`)).toEqual(['app.create', 'app.delete']);
    expect((await delClip(admin, s.id)).status).toBe(200);
    expect((await drop(admin, id)).status).toBe(404);
  });
});

describe('POST /api/custom-apps/[id]/run', () => {
  /** A published app of a fresh clip on `model`, with one slot and one fixed photo (the clip's second input). */
  async function published(o: Partial<SourceOptions> = {}, over: Record<string, unknown> = {}) {
    const s = await source({ owner: admin.id, ...o });
    const id = (await json(await make(admin, mk(s.id, { publish: true, ...over })))).id as string;
    return { s, id };
  }
  const slotPhoto = async (who: Who) => inputAsset(who.id);
  const fresh = async () => newUser(); // a member has 5 clips a day

  test('runs the app’s own recipe through POST /api/jobs: its prompt, settings, model and photos in order, with an estimate', async () => {
    const { s, id } = await published({ params: { audio: 'off' } });
    const m = await fresh();
    const photo = await slotPhoto(m);
    const res = await run(m, id, { assetIds: [photo] });
    expect(res.status).toBe(201);
    const job = (await pool.query('select * from jobs where id = $1', [(await json(res)).id])).rows[0];
    expect(job).toMatchObject({ user_id: m.id, feature: 'video', model: 'app-fal', preset_id: null, prompt: 'spin it', aspect: '9:16', duration_s: 5, params: { audio: 'off' }, input_asset_ids: [photo, s.inputIds[1]], status: 'queued', workspace_id: 'ws_vet' });
    expect((await pool.query(`select kind, usd::text as usd from cost_entries where job_id = $1`, [job.id])).rows).toEqual([{ kind: 'estimate', usd: '1.0000' }]);
  });

  test('runs an image app on the image model with its resolution', async () => {
    const { id } = await published({ feature: 'image', model: 'app-img', aspect: '3:4', params: { resolution: '2K' }, inputs: 1 }, { category: 'photo', inputs: [{ slot: { label: 'Ảnh', hint: '' } }] });
    const m = await fresh();
    const photo = await slotPhoto(m);
    const res = await run(m, id, { assetIds: [photo] });
    expect(res.status).toBe(201);
    expect((await pool.query('select feature, model, aspect, duration_s, params, input_asset_ids from jobs where id = $1', [(await json(res)).id])).rows[0]).toEqual({ feature: 'image', model: 'app-img', aspect: '3:4', duration_s: 0, params: { resolution: '2K' }, input_asset_ids: [photo] });
  });

  test('takes nothing but the photos: any other key answers 400 with code custom_app, and no job is made', async () => {
    const { id } = await published();
    const m = await fresh();
    const photo = await slotPhoto(m);
    const before = await jobCount();
    for (const key of ['prompt', 'modelId', 'presetId', 'ratio', 'durationSec', 'params', 'feature', 'storeId', 'enhance', 'useBrand', 'retryOf', 'rerunOf', 'onTwin', 'maxUsd']) {
      const res = await run(m, id, { assetIds: [photo], [key]: key === 'params' ? {} : 'x' });
      expect(res.status, key).toBe(400);
      expect((await json(res)).code).toBe('custom_app');
    }
    for (const body of [null, [], {}, { assetIds: 'x' }, { assetIds: [5] }]) expect((await run(m, id, body)).status).toBe(400);
    expect(await jobCount()).toBe(before);
  });

  test('answers 401 without a session, and 404 for an unknown id', async () => {
    expect((await run(null, 'x', { assetIds: [] })).status).toBe(401);
    const res = await run(member, 'no-such-app', { assetIds: [] });
    expect(res.status).toBe(404);
    expect((await json(res)).code).toBe('custom_app');
  });

  test('a draft: 404 for a member, a test run for an Admin; an unpublished app is a draft again', async () => {
    const { id } = await published();
    await patch(admin, id, { published: false });
    const m = await fresh();
    expect((await run(m, id, { assetIds: [await slotPhoto(m)] })).status).toBe(404);
    const tester = await newUser('admin'); // the clips admin made as sources count against its daily limit
    expect((await run(tester, id, { assetIds: [await slotPhoto(tester)] })).status).toBe(201);
  });

  test('another workspace’s app is 404 to its members and Admins, even with the wrong number of photos', async () => {
    const { id } = await published();
    expect((await run(memberOther, id, { assetIds: [] })).status).toBe(404);
    expect((await run(memberOther, id, { assetIds: ['a', 'b', 'c'] })).status).toBe(404);
    expect((await run(adminOther, id, { assetIds: [] }, OTHER)).status).toBe(404);
    expect((await patch(adminOther, id, { published: false }, OTHER)).status).toBe(404);
  });

  test('refuses the wrong number of photos and one photo twice, in Vietnamese, before the handler', async () => {
    const { s, id } = await published();
    const m = await fresh();
    const photo = await slotPhoto(m);
    const before = await jobCount();
    const none = await run(m, id, { assetIds: [] });
    expect(none.status).toBe(400);
    expect(await json(none)).toEqual({ error: 'Ứng dụng này cần đúng 1 ảnh.', code: 'custom_app' });
    expect((await run(m, id, { assetIds: [photo, photo] })).status).toBe(400);
    const again = await run(m, id, { assetIds: [s.inputIds[1]] }); // the fixed photo in the slot too
    expect(again.status).toBe(400);
    expect(await json(again)).toEqual({ error: 'Ảnh tải lên trùng với một ảnh khác của ứng dụng. Hãy chọn ảnh khác.', code: 'custom_app' });
    expect(await jobCount()).toBe(before);
  });

  test('another member’s private upload in the slot is refused as POST /api/jobs refuses it', async () => {
    const { id } = await published();
    const m = await fresh();
    const theirs = await slotPhoto(await fresh());
    const res = await run(m, id, { assetIds: [theirs] });
    expect(res.status).toBe(400);
    const direct = await runJob(req(m, '/api/jobs', 'POST', { feature: 'video', modelId: 'app-fal', prompt: 'p', ratio: '9:16', durationSec: 5, assetIds: [theirs] }));
    expect((await json(res)).error).toBe((await json(direct)).error);
  });

  test('refuses an app whose source clip was deleted (409) or whose model is off (409), with code custom_app', async () => {
    const gone = await published();
    await pool.query('update jobs set deleted_at = now() where id = $1', [gone.s.id]);
    const m = await fresh();
    const res = await run(m, gone.id, { assetIds: [await slotPhoto(m)] });
    expect(res.status).toBe(409);
    expect(await json(res)).toEqual({ error: 'Ứng dụng này không chạy được nữa: kết quả gốc đã bị xoá.', code: 'custom_app' });

    const off = await published({ model: 'tw-cheap' }); // a model nothing can serve once both of its rows are off
    await pool.query(`update model_configs set enabled = false where id in ('tw-cheap', 'tw-dear')`);
    try {
      const refused = await run(m, off.id, { assetIds: [await slotPhoto(m)] });
      expect(refused.status).toBe(409);
      expect(await json(refused)).toEqual({ error: 'Mô hình của ứng dụng này đang tắt.', code: 'custom_app' });
    } finally {
      await pool.query(`update model_configs set enabled = true where id in ('tw-cheap', 'tw-dear')`);
    }
  });

  test('a pair of duplicates runs on the row offered now: the dearer twin while the cheaper one (Vertex, no account) cannot serve', async () => {
    const { id } = await published({ model: 'tw-dear' });
    expect((await pool.query('select model from custom_apps where id = $1', [id])).rows[0].model).toBe('tw-cheap');
    const m = await fresh();
    const res = await run(m, id, { assetIds: [await slotPhoto(m)] });
    expect(res.status).toBe(201);
    expect((await pool.query('select model, provider from jobs where id = $1', [(await json(res)).id])).rows[0]).toEqual({ model: 'tw-dear', provider: 'fal' });
    expect((await publishedApps('ws_vet')).find((a) => a.slug === id)?.custom.modelIds).toEqual(['tw-cheap', 'tw-dear']);
  });

  test('an app still runs, and still lists both rows, after its pair changes direction (as migration 0093 did to Veo)', async () => {
    const { id } = await published({ model: 'tw-dear' });
    await pool.query(`update model_configs set twin_of = null where id = 'tw-dear'`);
    await pool.query(`update model_configs set twin_of = 'tw-dear' where id = 'tw-cheap'`);
    try {
      const m = await fresh();
      const res = await run(m, id, { assetIds: [await slotPhoto(m)] });
      expect(res.status).toBe(201);
      expect((await pool.query('select model from jobs where id = $1', [(await json(res)).id])).rows[0].model).toBe('tw-dear');
      expect((await publishedApps('ws_vet')).find((a) => a.slug === id)?.custom.modelIds).toEqual(['tw-cheap', 'tw-dear']);
    } finally {
      await pool.query(`update model_configs set twin_of = null where id = 'tw-cheap'`);
      await pool.query(`update model_configs set twin_of = 'tw-cheap' where id = 'tw-dear'`);
    }
  });

  test('a cap that refuses answers 429, the same as a direct Run, and nothing is made', async () => {
    const { id } = await published();
    const m = await fresh();
    const photo = await slotPhoto(m);
    const before = await jobCount();
    await pool.query('update settings set monthly_cap_usd = 0.0001');
    try {
      const res = await run(m, id, { assetIds: [photo] });
      expect(res.status).toBe(429);
      expect(await json(res)).toEqual({ error: 'Đã hết ngân sách tháng của công ty' });
    } finally {
      await pool.query('update settings set monthly_cap_usd = 200');
    }
    expect(await jobCount()).toBe(before);
  });
});

describe('DELETE /api/jobs/[id] for a clip that is an app’s source', () => {
  test('answers 409 app_source to its owner and to an Admin while the app exists (a draft too), and the clip stays live', async () => {
    const owner = await newUser();
    const s = await source({ owner: owner.id });
    const { id } = await json(await make(admin, mk(s.id, { name: 'Ứng dụng của tôi' })));
    for (const [who, next] of [[owner, 'Hãy báo Admin xoá ứng dụng trước.'], [admin, 'Hãy xoá ứng dụng trước.']] as const) {
      const res = await delClip(who, s.id);
      expect(res.status).toBe(409);
      expect(await json(res)).toEqual({ error: `Clip này đang là nguồn của ứng dụng «Ứng dụng của tôi». ${next}`, code: 'app_source' });
    }
    expect((await pool.query('select deleted_at from jobs where id = $1', [s.id])).rows[0].deleted_at).toBeNull();
    expect((await pool.query(`select count(*)::int as n from assets where id in ($1, $2) and deleted_at is not null`, [`${s.id}-out`, `${s.id}-poster`])).rows[0].n).toBe(0);
    expect((await drop(admin, id)).status).toBe(200);
    expect((await delClip(owner, s.id)).status).toBe(200);
  });

  test('answers 403 to a member who does not own the clip, so the app’s name stays hidden, and 404 for another workspace’s clip', async () => {
    const s = await source({ owner: admin.id });
    await make(admin, mk(s.id, { name: 'Tên bí mật' }));
    const res = await delClip(member, s.id);
    expect(res.status).toBe(403);
    expect(JSON.stringify(await json(res))).not.toContain('Tên bí mật');
    expect((await delClip(adminOther, s.id)).status).toBe(404);
  });

  test('deletes a clip no app names as before', async () => {
    const s = await source({ owner: admin.id });
    expect((await delClip(admin, s.id)).status).toBe(200);
  });
});

describe('the loaders', () => {
  test('list the workspace’s published apps with a live source, newest first, and only to the right workspace', async () => {
    const live = await source({ owner: admin.id });
    const dead = await source({ owner: admin.id });
    const a = (await json(await make(admin, mk(live.id, { name: 'Live one', publish: true })))).id as string;
    const b = (await json(await make(admin, mk(dead.id, { name: 'Dead one', publish: true })))).id as string;
    const draftId = (await json(await make(admin, mk((await source({ owner: admin.id })).id, { name: 'A draft' })))).id as string;
    await pool.query('update jobs set deleted_at = now() where id = $1', [dead.id]);
    const slugs = (await publishedApps('ws_vet')).map((x) => x.slug);
    expect(slugs).toContain(a);
    expect(slugs).not.toContain(b);
    expect(slugs).not.toContain(draftId);
    expect(slugs[0]).toBe(a); // newest first
    expect(await publishedApps('ws_other')).toEqual([]);
    expect(await customApp(a, 'ws_vet', false)).toMatchObject({ slug: a, name: 'Live one', slots: [{ label: 'Ảnh sản phẩm' }] });
    expect(await customApp(draftId, 'ws_vet', false)).toBeNull();
    expect(await customApp(draftId, 'ws_vet', true)).toMatchObject({ slug: draftId });
    expect(await customApp(b, 'ws_vet', true)).toBeNull(); // its source is gone
    expect(await customApp(a, 'ws_other', true)).toBeNull();
  });

  test('give the Admin pages every app of the workspace and one app’s fields', async () => {
    const rows = await adminApps('ws_vet');
    expect(rows.find((r) => r.name === 'Dead one')).toMatchObject({ published: true, sourceLive: false });
    expect(rows.find((r) => r.name === 'A draft')).toMatchObject({ published: false, sourceLive: true });
    expect(await adminApps('ws_other')).toHaveLength(1);
    const one = rows.find((r) => r.name === 'A draft')!;
    expect(await adminApp(one.id, 'ws_vet')).toMatchObject({ id: one.id, prompt: 'spin it', description: 'Xoay sản phẩm' });
    expect(await adminApp(one.id, 'ws_other')).toBeNull();
  });

  test('appSource gives the source’s draft, pair model and photos, or null for a clip that is not live here', async () => {
    const s = await source({ owner: admin.id, model: 'tw-dear' });
    expect(await appSource(pool, s.id, 'ws_vet')).toMatchObject({
      draft: { feature: 'video', prompt: 'spin the product', aspect: '9:16', durationS: 5 }, pairModel: 'tw-cheap', modelLabel: 'Twin cheap', maxPromptChars: 2000, inputIds: s.inputIds,
      images: s.inputIds.map((id) => ({ id, filename: id })), outputAssetId: `${s.id}-out`, posterAssetId: `${s.id}-poster`,
      feature: 'video', prompt: '  spin the product  ', enhancedPrompt: null, presetId: null, ratio: '9:16', durationS: 5, brand: false, endFrame: false, refAudio: false, refVideo: false,
    });
  });

  test('appSource still gives a refused clip’s settings and the flags the refusal reasons use', async () => {
    const s = await source({ owner: admin.id, preset: 'gentle-push-in', enhanced: 'better', params: { audio: 'on', brand: 'on', endAssetId: 'e1', audioAssetIds: 'a1', videoAssetId: 'v1' } });
    const src = (await appSource(pool, s.id, 'ws_vet'))!;
    expect(typeof src.draft).toBe('string');
    expect(src).toMatchObject({ feature: 'video', enhancedPrompt: 'better', presetId: 'gentle-push-in', ratio: '9:16', durationS: 5, audio: 'on', brand: true, endFrame: true, refAudio: true, refVideo: true });
    const img = await source({ owner: admin.id, feature: 'image', model: 'app-img', params: { resolution: '2K', thinking: 'high' }, inputs: 1 });
    expect(await appSource(pool, img.id, 'ws_vet')).toMatchObject({ feature: 'image', durationS: 0, resolution: '2K', thinking: 'high' });
    expect(await appSource(pool, s.id, 'ws_other')).toBeNull();
    expect(await appSource(pool, 'no-such-job', 'ws_vet')).toBeNull();
  });
});

describe('the source-guard lock', () => {
  test('a clip DELETE waits for appSource(…, lock) in another transaction, then answers 409 once the app row is committed', async () => {
    const s = await source({ owner: admin.id });
    const tx = await pool.connect();
    try {
      await tx.query('begin');
      expect(await appSource(tx, s.id, 'ws_vet', true)).not.toBeNull(); // `for share` on the job row
      let answered = false;
      const deleting = delClip(admin, s.id).then((res) => ((answered = true), res));
      for (let i = 0; i < 100; i++) {
        // the DELETE's `for update` is queued behind our share lock, on its own connection
        if ((await pool.query(`select 1 from pg_stat_activity where datname = current_database() and wait_event_type = 'Lock' and query like '%for update of j%'`)).rowCount) break;
        await new Promise((r) => setTimeout(r, 50));
      }
      expect(answered).toBe(false);
      await tx.query(
        `insert into custom_apps (id, workspace_id, source_job_id, feature, name, category, model, prompt, aspect, duration_s, inputs) values ($1, 'ws_vet', $2, 'video', 'Giữ khoá', 'video', 'app-fal', 'p', '9:16', 5, $3::jsonb)`,
        [crypto.randomUUID(), s.id, JSON.stringify([{ slot: { label: 'Ảnh', hint: '' } }, { fixed: s.inputIds[1] }])],
      );
      await tx.query('commit');
      const res = await deleting;
      expect(res.status).toBe(409);
      expect(await json(res)).toMatchObject({ code: 'app_source', error: expect.stringContaining('«Giữ khoá»') });
      expect((await pool.query('select deleted_at from jobs where id = $1', [s.id])).rows[0].deleted_at).toBeNull();
    } finally {
      await tx.query('rollback').catch(() => undefined);
      tx.release();
    }
  });
});
