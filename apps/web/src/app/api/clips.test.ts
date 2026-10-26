// Integration test of the M.4 backend (tray, Library, job detail, verdict, delete, model picker, download name) against a disposable
// database and bucket on the compose Postgres and MinIO (`pnpm services:up`).
import { randomBytes } from 'node:crypto';
import { DeleteBucketCommand, DeleteObjectsCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { createTestDatabase } from '@cvs/db/testing';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

const testDb = await createTestDatabase();
process.env.DATABASE_URL = testDb.url;
process.env.BETTER_AUTH_SECRET = randomBytes(32).toString('hex');
process.env.APP_URL = 'http://localhost';
process.env.S3_BUCKET = `cvs-test-${randomBytes(6).toString('hex')}`;

const { auth, pool } = await import('@/lib/auth');
const { downloadName } = await import('@/lib/clips');
const { bucketName, ensureBucket, putObject, s3 } = await import('@/lib/storage');
const { GET: GET_MINE } = await import('./jobs/route');
const { GET: GET_JOB, DELETE: DELETE_JOB } = await import('./jobs/[id]/route');
const { PUT: PUT_VERDICT } = await import('./jobs/[id]/verdict/route');
const { PUT: PUT_FAVORITE } = await import('./jobs/[id]/favorite/route');
const { GET: GET_LIBRARY } = await import('./library/route');
const { GET: GET_MODELS } = await import('./models/route');
const { GET: GET_ASSET } = await import('./assets/[id]/route');
const { GET: GET_CONTENT } = await import('./assets/[id]/content/route');
const { GET: GET_DOWNLOAD } = await import('./assets/[id]/download/route');

const PASSWORD = 'correct-horse-battery';
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const req = (path: string, cookie?: string, init: { method?: string; body?: string; headers?: Record<string, string> } = {}) =>
  new Request(`http://localhost${path}`, { ...init, headers: { ...(cookie ? { cookie } : {}), 'content-type': 'application/json', ...init.headers } });

async function signIn(email: string): Promise<string> {
  const res = await auth.api.signInEmail({ body: { email, password: PASSWORD }, asResponse: true });
  expect(res.status).toBe(200);
  return res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
}

async function newUser(email: string, name: string, role: 'member' | 'admin' = 'member') {
  const id = (await auth.api.createUser({ body: { email, name, password: PASSWORD, role } })).user.id;
  return { id, cookie: await signIn(email) };
}

interface ClipOptions { id?: string; createdAt?: string; aspect?: '9:16' | '1:1'; model?: string; inputs?: string[]; final?: boolean; status?: string; storeId?: string }
let seq = 0;
/** A Library clip (or, with another status, a job) of the user: video and poster assets, the job and its ledger rows. */
async function clip(userId: string, o: ClipOptions = {}): Promise<string> {
  const id = o.id ?? `clip-${++seq}-${randomBytes(4).toString('hex')}`;
  const status = o.status ?? 'succeeded';
  const done = status === 'succeeded';
  for (const [asset, kind] of [[`${id}-video`, 'video/mp4'], [`${id}-poster`, 'image/jpeg']]) {
    await pool.query(`insert into assets (id, owner_id, kind, s3_key, filename, mime, bytes) values ($1, $2, 'output', $3, $1, $4, 10)`, [asset, userId, `assets/${asset}`, kind]);
  }
  await pool.query(
    `insert into jobs (id, user_id, team_id, store_id, model, provider, preset_id, prompt, aspect, duration_s, input_asset_ids, status, output_asset_id, poster_asset_id, created_at)
     values ($1, $2, 'team-unassigned', $3, $4, 'fal', 'gentle-push-in', 'a prompt', $5, 8, $6, $7, $8, $9, coalesce($10::timestamptz, now()))`,
    [id, userId, o.storeId ?? null, o.model ?? 'fal-test', o.aspect ?? '9:16', o.inputs ?? [], status, done ? `${id}-video` : null, done ? `${id}-poster` : null, o.createdAt ?? null],
  );
  const book = (kind: string, usd: string, isFinal: boolean) =>
    pool.query(
      `insert into cost_entries (kind, usd, month, day, user_id, team_id, job_id, is_final)
       select $2, $3, to_char(created_at at time zone 'Asia/Ho_Chi_Minh', 'YYYY-MM'), (created_at at time zone 'Asia/Ho_Chi_Minh')::date, user_id, team_id, id, $4 from jobs where id = $1`,
      [id, kind, usd, isFinal],
    );
  await book('estimate', '1.6000', false);
  if (o.final !== false && done) await book('actual_adjustment', '0.0000', true);
  return id;
}

async function input(id: string, ownerId: string) {
  await pool.query(`insert into assets (id, owner_id, kind, s3_key, filename, mime, bytes) values ($1, $2, 'input', $3, 'in.png', 'image/png', 1)`, [id, ownerId, `assets/${id}`]);
}

const audits = async (target: string) => (await pool.query('select actor_id, action, old_value, new_value from audit_entries where target = $1 order by id', [target])).rows;
const libraryIds = async (cookie: string, query = '') => ((await (await GET_LIBRARY(req(`/api/library${query}`, cookie))).json()) as { clips: { id: string }[] }).clips.map((c) => c.id);

let alice: Awaited<ReturnType<typeof newUser>>;
let bob: Awaited<ReturnType<typeof newUser>>;
let admin: Awaited<ReturnType<typeof newUser>>;

beforeAll(async () => {
  await ensureBucket();
  await pool.query(`insert into stores (id, name, code, hidden) values ('store-ok', 'Store', 'S1', false), ('store-hidden', 'Hidden', 'S2', true)`);
  await pool.query(
    `insert into model_configs (id, provider, endpoint, label, ratios, durations_sec, max_images, output_resolution, usd_per_second, sources, enabled, pass_seed_passes, pass_seed_total) values
       ('fal-test', 'fal', 'x', 'Fal test', '{9:16,1:1}', '{5,8,10}', 2, '720p', 0.2, '{}', true, 8, 10),
       ('cheap-test', 'fal', 'x', 'Cheap test', '{9:16}', '{5,8}', 2, '720p', 0.1, '{}', true, 8, 10),
       ('mock-sample', 'mock', 'mock', 'Mock', '{9:16}', '{5,8}', 4, '720p', 0.1, '{}', true, 5, 10)`,
  );
  await pool.query(`update model_configs set enabled = false where id = 'kling-o3-pro'`); // migration 0013 enables it; this file lists only its own models
  alice = await newUser('alice@example.test', 'Nguyễn Văn Đạt');
  bob = await newUser('bob@example.test', 'Bob');
  admin = await newUser('admin@example.test', 'Admin', 'admin');
});

afterAll(async () => {
  const Bucket = bucketName();
  const { Contents = [] } = await s3().send(new ListObjectsV2Command({ Bucket }));
  if (Contents.length > 0) await s3().send(new DeleteObjectsCommand({ Bucket, Delete: { Objects: Contents.flatMap(({ Key }) => (Key ? [{ Key }] : [])) } }));
  await s3().send(new DeleteBucketCommand({ Bucket }));
  await pool.end();
  await testDb.drop();
});

describe('GET /api/jobs?mine', () => {
  test('lists only the caller own jobs, newest first, without deleted ones, and asks for ?mine', async () => {
    const mineOld = await clip(alice.id, { createdAt: '2026-01-01T00:00:00Z' });
    const mineNew = await clip(alice.id, { status: 'queued' });
    const deleted = await clip(alice.id);
    await pool.query(`update jobs set deleted_at = now() where id = $1`, [deleted]);
    const theirs = await clip(bob.id);

    expect((await GET_MINE(req('/api/jobs?mine'))).status).toBe(401);
    expect((await GET_MINE(req('/api/jobs', alice.cookie))).status).toBe(400);
    const body = (await (await GET_MINE(req('/api/jobs?mine', alice.cookie))).json()) as { jobs: { id: string; status: string; ratio: string; durationSec: number; retried: boolean }[] };
    const ids = body.jobs.map((j) => j.id);
    expect(ids).toEqual([mineNew, mineOld]);
    expect(ids).not.toContain(theirs);
    expect(body.jobs[0]).toMatchObject({ status: 'queued', ratio: '9:16', durationSec: 8, retried: false });
  });

  test('reports the worker offline until a heartbeat is under 60 s old', async () => {
    const offline = async () => ((await (await GET_MINE(req('/api/jobs?mine', alice.cookie))).json()) as { workerOffline: boolean }).workerOffline;
    expect(await offline()).toBe(true);
    await pool.query(`insert into worker_heartbeat (worker_id) values ('w1')`);
    expect(await offline()).toBe(false);
    await pool.query(`update worker_heartbeat set beat_at = now() - interval '61 seconds'`);
    expect(await offline()).toBe(true);
  });
});

describe('GET /api/library', () => {
  test('lists every user live clip with creator, model, ratio, duration, cost, MOCK flag and verdict, and leaves out jobs that are not clips', async () => {
    const a = await clip(alice.id, { id: 'lib-a', createdAt: '2026-10-22T17:30:00Z', aspect: '1:1' });
    const b = await clip(bob.id, { id: 'lib-b', createdAt: '2026-10-21T05:00:00Z', final: false });
    const failed = await clip(alice.id, { status: 'failed' });
    const deleted = await clip(bob.id);
    await pool.query(`update jobs set deleted_at = now() where id = $1`, [deleted]);
    await pool.query(`update jobs set is_mock = true where id = $1`, [b]);
    await pool.query(`insert into verdicts (id, job_id, output_asset_id, verdict, fault, marked_by) values ('v1', 'lib-a', 'lib-a-video', 'fail', 'flicker', $1)`, [alice.id]);

    expect((await GET_LIBRARY(req('/api/library'))).status).toBe(401);
    const res = await GET_LIBRARY(req('/api/library', bob.cookie));
    const body = (await res.json()) as { clips: Record<string, unknown>[]; creators: { id: string; name: string }[]; hasMore: boolean };
    const ids = body.clips.map((c) => c.id);
    expect(ids).toContain(a);
    expect(ids).toContain(b);
    expect(ids).not.toContain(failed);
    expect(ids).not.toContain(deleted);
    expect(ids.indexOf(a)).toBeLessThan(ids.indexOf(b)); // newest first
    expect(body.clips.find((c) => c.id === a)).toEqual({
      id: a, creator: { id: alice.id, name: 'Nguyễn Văn Đạt' }, createdAt: '2026-10-22T17:30:00.000Z', modelId: 'fal-test', modelLabel: 'Fal test', ratio: '1:1', durationSec: 8,
      feature: 'video', mediaType: 'video', resolution: null, isMock: false, videoAssetId: 'lib-a-video', posterAssetId: 'lib-a-poster', storeId: null, costUsd: '1.6000', costFinal: true, verdict: { verdict: 'fail', fault: 'flicker', markedBy: alice.id },
      favorite: false, canEdit: false, downloadName: expect.stringMatching(/^20261023-nguyen-van-dat-lib-a\.mp4$/),
    });
    expect(body.clips.find((c) => c.id === b)).toMatchObject({ isMock: true, costFinal: false, verdict: null, canEdit: true }); // bob is the creator
    expect(body.creators).toEqual(expect.arrayContaining([{ id: alice.id, name: 'Nguyễn Văn Đạt' }, { id: bob.id, name: 'Bob' }]));
    expect(body.hasMore).toBe(false);
    expect(body).toMatchObject({ isAdmin: false }); // the store control of the Library cards is for Admins
    expect(await (await GET_LIBRARY(req('/api/library', admin.cookie))).json()).toMatchObject({ isAdmin: true });
  });

  test('filters by creator, by ICT date and by ratio', async () => {
    const lib = async (query: string) => (await libraryIds(bob.cookie, query)).filter((id) => id.startsWith('lib-'));
    expect(await lib(`?creator=${alice.id}`)).toEqual(['lib-a']);
    expect(await lib(`?creator=${bob.id}`)).toEqual(['lib-b']);
    // lib-a ran at 00:30 on 23 October in Ho Chi Minh time, which is still 22 October in UTC.
    expect(await lib('?date=2026-10-23')).toEqual(['lib-a']);
    expect(await lib('?date=2026-10-22')).toEqual([]);
    expect(await lib('?date=2026-10-21')).toEqual(['lib-b']);
    expect(await lib('?ratio=1:1')).toEqual(['lib-a']);
    expect(await lib('?ratio=9:16')).toEqual(['lib-b']);
    expect(await lib(`?creator=${bob.id}&ratio=1:1`)).toEqual([]);
  });

  test.each(['?date=2026-13-45', '?date=yesterday', '?ratio=16:9', '?offset=-1', '?offset=x', '?favorites=0', '?sort=random'])('answers 400 for %s', async (query) => {
    expect((await GET_LIBRARY(req(`/api/library${query}`, bob.cookie))).status).toBe(400);
  });

  test('sorts oldest first on request', async () => {
    const lib = async (query: string) => (await libraryIds(bob.cookie, query)).filter((id) => id.startsWith('lib-'));
    expect(await lib('')).toEqual(['lib-a', 'lib-b']);
    expect(await lib('?sort=oldest')).toEqual(['lib-b', 'lib-a']);
    expect(await lib('?sort=newest')).toEqual(['lib-a', 'lib-b']);
  });

  test('keeps favourites per user: each sees and filters only their own, and taking one out is harmless twice', async () => {
    const fav = (id: string, cookie: string | undefined, favorite: unknown) => PUT_FAVORITE(req(`/api/jobs/${id}/favorite`, cookie, { method: 'PUT', body: JSON.stringify({ favorite }) }), ctx(id));
    expect((await fav('lib-a', undefined, true)).status).toBe(401);
    expect((await fav('lib-a', bob.cookie, 'yes')).status).toBe(400);
    expect((await fav('no-such-clip', bob.cookie, true)).status).toBe(404);
    expect(await (await fav('lib-a', bob.cookie, true)).json()).toEqual({ favorite: true });
    expect((await fav('lib-a', bob.cookie, true)).status).toBe(200); // again: still one row
    expect((await pool.query(`select count(*)::int as n from favorites where job_id = 'lib-a'`)).rows[0].n).toBe(1);

    const lib = async (cookie: string, query: string) => ((await (await GET_LIBRARY(req(`/api/library${query}`, cookie))).json()) as { clips: { id: string; favorite: boolean }[] }).clips;
    expect((await lib(bob.cookie, '?favorites=1')).map((c) => c.id)).toEqual(['lib-a']);
    expect((await lib(bob.cookie, '')).find((c) => c.id === 'lib-a')?.favorite).toBe(true);
    expect((await lib(alice.cookie, '')).find((c) => c.id === 'lib-a')?.favorite).toBe(false); // another user's favourite is private
    expect(await lib(alice.cookie, '?favorites=1')).toEqual([]);

    expect(await (await fav('lib-a', bob.cookie, false)).json()).toEqual({ favorite: false });
    expect((await fav('lib-a', bob.cookie, false)).status).toBe(200);
    expect(await lib(bob.cookie, '?favorites=1')).toEqual([]);
  });

  test('pages by 24', async () => {
    const carol = await newUser('carol@example.test', 'Carol');
    for (let i = 0; i < 25; i++) await clip(carol.id);
    const page = async (offset: number) => (await (await GET_LIBRARY(req(`/api/library?creator=${carol.id}&offset=${offset}`, carol.cookie))).json()) as { clips: unknown[]; hasMore: boolean };
    expect(await page(0)).toMatchObject({ hasMore: true, clips: expect.any(Array) });
    expect((await page(0)).clips).toHaveLength(24);
    expect(await page(24)).toMatchObject({ hasMore: false, clips: [expect.anything()] });
  });
});

describe('images in the Library', () => {
  let seqImage = 0;
  /** A succeeded image job of the user, with its output image (no poster) and a 0.15 USD ledger total. */
  async function imageClip(userId: string, o: { id?: string; feature?: string; resolution?: string; ratio?: string; filename?: string; createdAt?: string } = {}): Promise<string> {
    const id = o.id ?? `img-${++seqImage}-${randomBytes(4).toString('hex')}`;
    await pool.query(`insert into assets (id, owner_id, kind, s3_key, filename, mime, bytes, width, height) values ($1, $2, 'output', $3, $4, 'image/png', 10, 64, 64)`, [`${id}-out`, userId, `assets/${id}-out`, o.filename ?? `image-${id.slice(0, 8)}.png`]);
    await pool.query(
      `insert into jobs (id, user_id, team_id, feature, model, provider, prompt, aspect, duration_s, params, input_asset_ids, status, output_asset_id, created_at)
       values ($1, $2, 'team-unassigned', $3, 'nano-banana-pro', 'fal', 'a prompt', $4, 0, $5, '{}', 'succeeded', $6, coalesce($7::timestamptz, now()))`,
      [id, userId, o.feature ?? 'image', o.ratio ?? '1:1', JSON.stringify({ resolution: o.resolution ?? '2K' }), `${id}-out`, o.createdAt ?? null],
    );
    await pool.query(
      `insert into cost_entries (kind, usd, month, day, user_id, team_id, job_id, is_final)
       select 'estimate', 0.15, to_char(created_at at time zone 'Asia/Ho_Chi_Minh', 'YYYY-MM'), (created_at at time zone 'Asia/Ho_Chi_Minh')::date, user_id, team_id, id, true from jobs where id = $1`,
      [id],
    );
    return id;
  }
  const items = async (cookie: string, query = '') => ((await (await GET_LIBRARY(req(`/api/library${query}`, cookie))).json()) as { clips: Record<string, unknown>[] }).clips;

  test('lists an image with its feature, media type, resolution, no poster and a download name that ends in its type', async () => {
    const id = await imageClip(alice.id, { id: 'img-list-a', createdAt: '2026-10-22T17:30:00Z', ratio: '3:4' });
    const day = await items(bob.cookie, '?date=2026-10-23');
    const item = day.find((c) => c.id === id);
    expect(item).toMatchObject({
      feature: 'image', mediaType: 'image', resolution: '2K', ratio: '3:4', durationSec: 0, videoAssetId: `${id}-out`, posterAssetId: null, costUsd: '0.1500',
      downloadName: '20261023-nguyen-van-dat-img-list.png', canEdit: false,
    });
    expect(day.find((c) => c.id === 'lib-a')).toMatchObject({ feature: 'video', mediaType: 'video', resolution: null });
  });

  test('filters by kind: images, videos, one feature, the two Marketing Studio formats, and every app feature', async () => {
    const v = await clip(alice.id, { id: 'kind-video' });
    const mk = await clip(alice.id, { id: 'kind-marketing' });
    await pool.query(`update jobs set feature = 'marketing' where id = $1`, [mk]);
    const ma = await clip(alice.id, { id: 'kind-marketing-advanced' });
    await pool.query(`update jobs set feature = 'marketing', params = '{"format":"advanced","audio":"on"}' where id = $1`, [ma]);
    const im = await imageClip(alice.id, { id: 'kind-image', feature: 'image' });
    const to = await imageClip(alice.id, { id: 'kind-tryon', feature: 'try_on' });
    const rf = await imageClip(alice.id, { id: 'kind-reframe', feature: 'reframe' });
    const mc = await imageClip(alice.id, { id: 'kind-motion', feature: 'motion_control' });
    await pool.query(`update assets set mime = 'video/mp4' where id = $1`, [`${mc}-out`]); // an app that outputs a video
    const kind = async (k: string) => (await items(bob.cookie, `?kind=${k}`)).map((c) => c.id as string).filter((id) => id.startsWith('kind-')).sort();
    expect(await kind('all')).toEqual([im, mk, ma, mc, rf, to, v].sort());
    expect(await kind('images')).toEqual([im, rf, to].sort());
    expect(await kind('videos')).toEqual([mc, mk, ma, v].sort());
    expect(await kind('try_on')).toEqual([to]);
    expect(await kind('image')).toEqual([im]);
    expect(await kind('video')).toEqual([v]);
    expect(await kind('marketing')).toEqual([mk, ma].sort());
    expect(await kind('marketing_ugc')).toEqual([mk]);
    expect(await kind('marketing_advanced')).toEqual([ma]);
    expect(await kind('apps')).toEqual([mc, rf].sort());
    expect((await items(bob.cookie)).map((c) => c.id)).toEqual(expect.arrayContaining([v, im])); // no kind is all
    expect((await GET_LIBRARY(req('/api/library?kind=cats', bob.cookie))).status).toBe(400);
    expect((await GET_LIBRARY(req('/api/library?kind=toString', bob.cookie))).status).toBe(400);
  });

  test('combines kind with the creator filter', async () => {
    const mine = await imageClip(bob.id, { id: 'combo-bob' });
    await imageClip(alice.id, { id: 'combo-alice' });
    expect((await items(bob.cookie, `?kind=images&creator=${bob.id}`)).map((c) => c.id)).toEqual([mine]);
  });

  test('lets the creator mark and delete an image, and streams it with its own type', async () => {
    const id = await imageClip(alice.id, { id: 'img-own-a' });
    await putObject(`assets/${id}-out`, new Uint8Array(10), 'image/png');
    expect((await PUT_VERDICT(req(`/api/jobs/${id}/verdict`, alice.cookie, { method: 'PUT', body: JSON.stringify({ verdict: 'pass' }) }), ctx(id))).status).toBe(200);
    const content = await GET_CONTENT(req(`/api/assets/${id}-out/content`, bob.cookie), ctx(`${id}-out`));
    expect([content.status, content.headers.get('content-type')]).toEqual([200, 'image/png']);
    await content.arrayBuffer();
    const details = await GET_ASSET(req(`/api/assets/${id}-out`, bob.cookie), ctx(`${id}-out`));
    const download = await GET_DOWNLOAD(req(((await details.json()) as { downloadUrl: string }).downloadUrl, bob.cookie), ctx(`${id}-out`));
    expect(download.headers.get('content-disposition')).toContain(`attachment; filename="${(await pool.query(`select to_char(created_at at time zone 'Asia/Ho_Chi_Minh', 'YYYYMMDD') as d from jobs where id = $1`, [id])).rows[0].d}-nguyen-van-dat-img-own-.png"`);
    await download.arrayBuffer();
    expect((await DELETE_JOB(req(`/api/jobs/${id}`, alice.cookie, { method: 'DELETE' }), ctx(id))).status).toBe(200);
    expect((await items(bob.cookie, '?kind=images')).map((c) => c.id)).not.toContain(id);
  });

  test('shows an image job in the tray and in the job detail with its resolution', async () => {
    const video = await clip(alice.id, { id: 'tray-video' });
    const id = await imageClip(alice.id, { id: 'img-tray-a', resolution: '4K' });
    const tray = (await (await GET_MINE(req('/api/jobs?mine', alice.cookie))).json()) as { jobs: Record<string, unknown>[] };
    expect(tray.jobs.find((j) => j.id === id)).toMatchObject({ feature: 'image', durationSec: 0, resolution: '4K' });
    expect(tray.jobs.find((j) => j.id === video)).toMatchObject({ feature: 'video', resolution: null });
    expect(await (await GET_JOB(req(`/api/jobs/${id}`, alice.cookie), ctx(id))).json()).toMatchObject({ feature: 'image', resolution: '4K', durationSec: 0 });
  });
});

describe('PUT /api/jobs/:id/verdict', () => {
  const mark = (cookie: string | undefined, id: string, body: unknown) => PUT_VERDICT(req(`/api/jobs/${id}/verdict`, cookie, { method: 'PUT', body: JSON.stringify(body) }), ctx(id));
  const stored = async (id: string) => (await pool.query(`select v.verdict, v.fault, v.marked_by from verdicts v where v.job_id = $1`, [id])).rows[0];

  test('refuses a request without a session, an unknown clip, and a job that is not a Library clip', async () => {
    const id = await clip(alice.id);
    expect((await mark(undefined, id, { verdict: 'pass' })).status).toBe(401);
    expect((await mark(alice.cookie, 'nope', { verdict: 'pass' })).status).toBe(404);
    expect((await mark(alice.cookie, await clip(alice.id, { status: 'failed' }), { verdict: 'pass' })).status).toBe(404);
  });

  test('gives another Member 403 and changes nothing', async () => {
    const id = await clip(alice.id);
    expect((await mark(bob.cookie, id, { verdict: 'pass' })).status).toBe(403);
    expect(await stored(id)).toBeUndefined();
    expect(await audits(`job:${id}`)).toEqual([]);
  });

  test.each([
    ['a Fail without a fault', { verdict: 'fail' }],
    ['a Fail with an unknown fault', { verdict: 'fail', fault: 'ugly' }],
    ['an unknown verdict', { verdict: 'maybe' }],
    ['no body', null],
  ])('answers 400 for %s', async (_, body) => {
    const id = await clip(alice.id);
    expect((await mark(alice.cookie, id, body)).status).toBe(400);
    expect(await stored(id)).toBeUndefined();
  });

  test('lets the creator mark Pass and Fail with each of the faults and "other", and an Admin edit it, auditing every write', async () => {
    const id = await clip(alice.id);
    const res = await mark(alice.cookie, id, { verdict: 'pass', fault: 'flicker' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ verdict: { verdict: 'pass', fault: null, markedBy: alice.id } });
    expect(await stored(id)).toEqual({ verdict: 'pass', fault: null, marked_by: alice.id });

    for (const fault of ['print_changed', 'off_colour', 'deformed', 'flicker', 'stray_text', 'other']) {
      expect((await mark(alice.cookie, id, { verdict: 'fail', fault })).status).toBe(200);
    }
    expect(await stored(id)).toEqual({ verdict: 'fail', fault: 'other', marked_by: alice.id });
    expect((await mark(admin.cookie, id, { verdict: 'pass' })).status).toBe(200);
    expect(await stored(id)).toEqual({ verdict: 'pass', fault: null, marked_by: admin.id });
    expect((await pool.query(`select count(*)::int as n from verdicts v where v.job_id = $1`, [id])).rows[0].n).toBe(1);

    const log = await audits(`job:${id}`);
    expect(log).toHaveLength(8);
    expect(log[0]).toEqual({ actor_id: alice.id, action: 'verdict.set', old_value: null, new_value: { verdict: 'pass', fault: null, markedBy: alice.id } });
    expect(log[1]).toMatchObject({ old_value: { verdict: 'pass', fault: null, markedBy: alice.id }, new_value: { verdict: 'fail', fault: 'print_changed', markedBy: alice.id } });
    expect(log[7]).toEqual({
      actor_id: admin.id, action: 'verdict.set', old_value: { verdict: 'fail', fault: 'other', markedBy: alice.id }, new_value: { verdict: 'pass', fault: null, markedBy: admin.id },
    });
  });
});

describe('DELETE /api/jobs/:id', () => {
  const remove = (cookie: string | undefined, id: string) => DELETE_JOB(req(`/api/jobs/${id}`, cookie, { method: 'DELETE' }), ctx(id));

  test('lets a Member delete their own clip without an audit entry, and the clip leaves the Library and stops streaming', async () => {
    const id = await clip(alice.id);
    expect((await remove(undefined, id)).status).toBe(401);
    const res = await remove(alice.cookie, id);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id, deleted: true });
    expect((await pool.query('select deleted_at is not null as gone from jobs where id = $1', [id])).rows[0].gone).toBe(true);
    expect(await libraryIds(bob.cookie)).not.toContain(id);
    expect((await GET_CONTENT(req(`/api/assets/${id}-video/content`, alice.cookie), ctx(`${id}-video`))).status).toBe(404);
    expect(await audits(`job:${id}`)).toEqual([]);
    expect((await remove(alice.cookie, id)).status).toBe(404); // already deleted
  });

  test('gives Member A 403 for the clip of Member B, which stays in the Library', async () => {
    const id = await clip(bob.id);
    expect((await remove(alice.cookie, id)).status).toBe(403);
    expect((await pool.query('select deleted_at from jobs where id = $1', [id])).rows[0].deleted_at).toBeNull();
    expect(await libraryIds(alice.cookie)).toContain(id);
    expect(await audits(`job:${id}`)).toEqual([]);
  });

  test('lets an Admin delete any clip and audits it when it is another user clip', async () => {
    const id = await clip(bob.id);
    expect((await remove(admin.cookie, id)).status).toBe(200);
    expect(await audits(`job:${id}`)).toEqual([
      { actor_id: admin.id, action: 'clip.delete', old_value: { ownerId: bob.id, deleted: false }, new_value: { ownerId: bob.id, deleted: true } },
    ]);
    const own = await clip(admin.id);
    expect((await remove(admin.cookie, own)).status).toBe(200);
    expect(await audits(`job:${own}`)).toEqual([]);
  });

  test('refuses a job that is not a Library clip', async () => {
    expect((await remove(alice.cookie, await clip(alice.id, { status: 'running' }))).status).toBe(404);
    expect((await remove(alice.cookie, 'nope')).status).toBe(404);
  });
});

describe('GET /api/jobs/:id', () => {
  const detail = (cookie: string | undefined, id: string) => GET_JOB(req(`/api/jobs/${id}`, cookie), ctx(id));

  test('gives Reuse the images, preset, prompt, ratio, duration, model and store of a Library clip, to any Member', async () => {
    await input('d-in-1', alice.id);
    await input('d-in-2', alice.id);
    await input('d-in-gone', alice.id);
    await pool.query(`update assets set deleted_at = now() where id = 'd-in-gone'`);
    const id = await clip(alice.id, { inputs: ['d-in-2', 'd-in-gone', 'd-in-1'], storeId: 'store-ok', aspect: '1:1' });
    expect((await detail(undefined, id)).status).toBe(401);
    const res = await detail(bob.cookie, id);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      id, userId: alice.id, status: 'succeeded', error: null, isMock: false, feature: 'video', resolution: null, presetId: 'gentle-push-in', prompt: 'a prompt', enhance: false, enhancedPrompt: null, audio: null, ratio: '1:1', durationSec: 8, modelId: 'fal-test',
      storeId: 'store-ok', outputAssetId: `${id}-video`, posterAssetId: `${id}-poster`,
      images: [{ id: 'd-in-2', filename: 'in.png', width: null, height: null }, { id: 'd-in-1', filename: 'in.png', width: null, height: null }],
    });
  });

  test('leaves out a store that is hidden now, hides a job that is not a clip from other Members but not from its owner or an Admin, and 404s a deleted one', async () => {
    const hidden = await clip(alice.id, { storeId: 'store-hidden' });
    expect(((await (await detail(alice.cookie, hidden)).json()) as { storeId: string | null }).storeId).toBeNull();
    const failed = await clip(alice.id, { status: 'failed' });
    expect((await detail(bob.cookie, failed)).status).toBe(404);
    expect((await detail(alice.cookie, failed)).status).toBe(200);
    expect((await detail(admin.cookie, failed)).status).toBe(200);
    await pool.query(`update jobs set deleted_at = now() where id = $1`, [hidden]);
    expect((await detail(alice.cookie, hidden)).status).toBe(404);
    expect((await detail(alice.cookie, 'nope')).status).toBe(404);
  });
});

describe('GET /api/models', () => {
  const models = async (cookie: string, query = '?ratio=9:16&durationSec=8') => (await GET_MODELS(req(`/api/models${query}`, cookie))).json() as Promise<{
    models: { id: string; estimateUsd: string; passRate: number | null; supported: boolean; isMock: boolean; score: number }[];
    defaultModelId: string | null;
    monthToDate: { usd: string; provisional: boolean };
    remainingBudgetUsd?: string;
  }>;

  test('lists the enabled models with pass rate and estimated cost, and pre-selects the cheaper one on a tie', async () => {
    await pool.query('delete from verdicts'); // the marks of the earlier tests would move the pass rates
    expect((await GET_MODELS(req('/api/models?ratio=9:16&durationSec=8'))).status).toBe(401);
    expect((await GET_MODELS(req('/api/models?ratio=16:9&durationSec=8', alice.cookie))).status).toBe(400);
    expect((await GET_MODELS(req('/api/models?ratio=9:16', alice.cookie))).status).toBe(400);
    expect((await GET_MODELS(req('/api/models?ratio=9:16&durationSec=', alice.cookie))).status).toBe(400);
    const body = await models(alice.cookie);
    expect(body.models.map((m) => [m.id, m.estimateUsd, m.passRate, m.supported, m.isMock])).toEqual([
      ['cheap-test', '0.8000', 0.8, true, false],
      ['fal-test', '1.6000', 0.8, true, false],
      ['mock-sample', '0.0000', 0.5, true, true],
    ]);
    expect(body.defaultModelId).toBe('cheap-test'); // 80% twice, so the cheaper one
    expect(body.models.map((m) => m.id)).not.toContain('kling-o3-pro'); // disabled
  });

  test('leaves out image models, even enabled ones', async () => {
    await pool.query(`update model_configs set enabled = true where id = 'nano-banana-pro'`);
    try {
      expect((await models(alice.cookie)).models.map((m) => m.id)).not.toContain('nano-banana-pro');
    } finally {
      await pool.query(`update model_configs set enabled = false where id = 'nano-banana-pro'`);
    }
  });

  test('keeps the models that list the feature when ?feature= is given, and takes 16:9 for marketing only', async () => {
    const ids = async (query: string) => (await models(alice.cookie, query)).models.map((m) => m.id);
    expect((await GET_MODELS(req('/api/models?feature=image&ratio=9:16&durationSec=8', alice.cookie))).status).toBe(400);
    expect((await GET_MODELS(req('/api/models?feature=video&ratio=16:9&durationSec=8', alice.cookie))).status).toBe(400);
    expect((await GET_MODELS(req('/api/models?feature=marketing&ratio=3:4&durationSec=8', alice.cookie))).status).toBe(400);
    await pool.query(`update model_configs set features = '{video,marketing}' where id = 'fal-test'`);
    await pool.query(`update model_configs set features = '{marketing}' where id = 'cheap-test'`);
    try {
      expect(await ids('?feature=marketing&ratio=16:9&durationSec=8')).toEqual(['cheap-test', 'fal-test']);
      expect(await ids('?feature=video&ratio=9:16&durationSec=8')).toEqual(['fal-test', 'mock-sample']);
      expect(await ids('?ratio=9:16&durationSec=8')).toEqual(['cheap-test', 'fal-test', 'mock-sample']); // no filter: every video model
    } finally {
      await pool.query(`update model_configs set features = '{video}' where id in ('fal-test', 'cheap-test')`);
    }
  });

  test('flags models that lack the ratio or duration, and counts every mark, including those of deleted clips', async () => {
    expect((await models(alice.cookie, '?ratio=1:1&durationSec=10')).models.map((m) => [m.id, m.supported])).toEqual([['cheap-test', false], ['fal-test', true], ['mock-sample', false]]);
    const id = await clip(alice.id, { model: 'fal-test' });
    await pool.query(`insert into verdicts (id, job_id, output_asset_id, verdict, fault, marked_by) values ('m1', $1, $2, 'pass', null, $3)`, [id, `${id}-video`, alice.id]);
    expect((await models(alice.cookie)).models.find((m) => m.id === 'fal-test')?.passRate).toBeCloseTo(9 / 11);
    // 9/11 beats 8/10 on pass rate, but the failed real fal-test job of the earlier tests (1 of 14) costs it the score: (9 + 2) / (11 + 4) x 17/18 = 69 against (8 + 2) / (10 + 4) = 71.
    const after = await models(alice.cookie);
    expect(after.models.map((m) => [m.id, m.score])).toEqual([['cheap-test', 71], ['fal-test', 69], ['mock-sample', 50]]);
    expect(after.defaultModelId).toBe('cheap-test');
    await pool.query(`update jobs set deleted_at = now() where id = $1`, [id]);
    expect((await models(alice.cookie)).models.find((m) => m.id === 'fal-test')?.passRate).toBeCloseTo(9 / 11);
  });

  test('shows the remaining monthly budget to an Admin only', async () => {
    // The video budget: the image and apps features (the images of the Library tests) have their own.
    const used = (await pool.query(`select coalesce(sum(usd), 0)::text as usd from cost_entries ce where month = to_char(now() at time zone 'Asia/Ho_Chi_Minh', 'YYYY-MM') and not exists (select 1 from jobs j where j.id = ce.job_id and j.feature not in ('video', 'marketing'))`)).rows[0].usd;
    const member = await models(alice.cookie);
    expect(member).not.toHaveProperty('remainingBudgetUsd');
    const adminBody = await models(admin.cookie);
    expect(Number(adminBody.remainingBudgetUsd)).toBeCloseTo(200 - Number(used), 4);
  });

  test('gives a Member their own month-to-date total, provisional while a job has no closing row', async () => {
    const dave = await newUser('dave@example.test', 'Dave');
    expect((await models(dave.cookie)).monthToDate).toEqual({ usd: '0.0000', provisional: false });
    const running = await clip(dave.id, { status: 'running' });
    expect((await models(dave.cookie)).monthToDate).toEqual({ usd: '1.6000', provisional: true });
    await pool.query(
      `insert into cost_entries (kind, usd, month, day, user_id, team_id, job_id, is_final)
       select 'actual_adjustment', 0.4, month, day, user_id, team_id, job_id, true from cost_entries where job_id = $1 and kind = 'estimate'`,
      [running],
    );
    expect((await models(dave.cookie)).monthToDate).toEqual({ usd: '2.0000', provisional: false });
  });
});

describe('download name', () => {
  test('is YYYYMMDD-<creator-slug>-<id>.mp4 with the ICT day, diacritics folded and a fallback slug', () => {
    expect(downloadName('20261023', 'Nguyễn Văn Đạt', 'abcdef12-3456')).toBe('20261023-nguyen-van-dat-abcdef12.mp4');
    expect(downloadName('20261023', 'Đặng  Thị-Ánh!', 'abcdef12-3456')).toBe('20261023-dang-thi-anh-abcdef12.mp4');
    expect(downloadName('20261023', '???', 'abcdef12-3456')).toBe('20261023-user-abcdef12.mp4');
  });

  test('names the downloaded video of a Library clip for another Member, and leaves other assets alone', async () => {
    const id = await clip(alice.id, { id: 'abcdef12-dl', createdAt: '2026-10-22T17:30:00Z' });
    await putObject(`assets/${id}-video`, new Uint8Array(10), 'video/mp4');
    await putObject(`assets/${id}-poster`, new Uint8Array(10), 'image/jpeg');
    const download = async (asset: string) => {
      const details = await GET_ASSET(req(`/api/assets/${asset}`, bob.cookie), ctx(asset));
      expect(details.status).toBe(200);
      const res = await GET_DOWNLOAD(req(((await details.json()) as { downloadUrl: string }).downloadUrl, bob.cookie), ctx(asset));
      expect(res.status).toBe(200);
      await res.arrayBuffer();
      return res.headers.get('content-disposition');
    };
    expect(await download(`${id}-video`)).toContain('attachment; filename="20261023-nguyen-van-dat-abcdef12.mp4"');
    expect(await download(`${id}-poster`)).toContain(`attachment; filename="${id}-poster"`);
  });

  test('lets Members read the video, poster and inputs of a Library clip but not the input of an unfinished job', async () => {
    await input('r-in-clip', alice.id);
    await input('r-in-queued', alice.id);
    const done = await clip(alice.id, { inputs: ['r-in-clip'] });
    await clip(alice.id, { status: 'queued', inputs: ['r-in-queued'] });
    const status = async (asset: string) => (await GET_CONTENT(req(`/api/assets/${asset}/content`, bob.cookie, { headers: { range: 'bytes=0-0' } }), ctx(asset))).status;
    expect(await status('r-in-queued')).toBe(403);
    // The assets exist in the database only, so a readable one reaches MinIO and fails there instead of with 403.
    await putObject('assets/r-in-clip', new Uint8Array(1), 'image/png');
    await putObject(`assets/${done}-video`, new Uint8Array(10), 'video/mp4');
    expect(await status('r-in-clip')).toBe(206);
    expect(await status(`${done}-video`)).toBe(206);
  });

  test('gives a Member 403 for the input of another user deleted clip and for another user upload no job ever used', async () => {
    await input('r-in-deleted', alice.id);
    await input('r-in-private', alice.id);
    const gone = await clip(alice.id, { inputs: ['r-in-deleted'] });
    await pool.query(`update jobs set deleted_at = now() where id = $1`, [gone]);
    for (const asset of ['r-in-deleted', 'r-in-private']) {
      expect((await GET_CONTENT(req(`/api/assets/${asset}/content`, bob.cookie), ctx(asset))).status).toBe(403);
    }
  });
});
