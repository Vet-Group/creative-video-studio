// The turntable video API against a disposable database and bucket on the compose Postgres and MinIO (`pnpm services:up`). No worker runs: the test stores the video itself.
import { randomBytes } from 'node:crypto';
import { DeleteBucketCommand, DeleteObjectsCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { turntableKey } from '@cvs/core/queue';
import { TURNTABLE_VIEWS } from '@cvs/core/turntable';
import { createTestDatabase } from '@cvs/db/testing';
import { afterAll, beforeAll, expect, test } from 'vitest';

const testDb = await createTestDatabase();
process.env.DATABASE_URL = testDb.url;
process.env.BETTER_AUTH_SECRET = randomBytes(32).toString('hex');
process.env.APP_URL = 'http://localhost';
process.env.S3_BUCKET = `cvs-test-${randomBytes(6).toString('hex')}`;

const { auth, pool } = await import('@/lib/auth');
const { bucketName, ensureBucket, putObject, s3 } = await import('@/lib/storage');
const { GET } = await import('./route');

const PASSWORD = 'correct-horse-battery';
const BATCH = '0c8a7a0e-9d6e-4a54-8a39-6d1c4c7f2b77';
const VIDEO = new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112, 109, 112, 52, 50, 1, 2, 3, 4, 5, 6, 7, 8]); // 20 bytes: an `ftyp` box and a few more
const cookies: Record<string, string> = {};
const ids: Record<string, string> = {};
const call = (who: string | null, batch = BATCH, search = '?asset=photo', extra: Record<string, string> = {}) =>
  GET(new Request(`http://localhost/api/turntables/${batch}${search}`, { headers: { ...(who ? { cookie: cookies[who]! } : {}), ...extra } }), { params: Promise.resolve({ batch }) });

async function run(id: string, view: string, status = 'succeeded') {
  await pool.query(`insert into assets (id, owner_id, kind, s3_key, filename, mime, bytes, workspace_id) values ($1, $2, 'output', concat('assets/', $1::text), $1, 'image/png', 1, 'ws_vet')`, [`${id}-out`, ids.owner]);
  await pool.query(
    `insert into jobs (id, user_id, team_id, model, provider, prompt, aspect, duration_s, input_asset_ids, status, output_asset_id, params, workspace_id, feature)
     values ($1, $2, 'team-unassigned', 'm', 'fal', 'p', 'auto', 0, '{photo}', $3, $4, $5, 'ws_vet', 'multi_angle')`,
    [id, ids.owner, status, `${id}-out`, JSON.stringify({ batch: BATCH, view })],
  );
}

beforeAll(async () => {
  await ensureBucket();
  for (const name of ['owner', 'other', 'admin']) {
    ids[name] = (await auth.api.createUser({ body: { email: `${name}@example.test`, name, password: PASSWORD, role: name === 'admin' ? 'admin' : 'member' } })).user.id;
    const res = await auth.api.signInEmail({ body: { email: `${name}@example.test`, password: PASSWORD }, asResponse: true });
    cookies[name] = res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
  }
  await pool.query(`insert into model_configs (id, provider, endpoint, label, ratios, durations_sec, max_images, output_resolution, usd_per_second, sources, enabled) values ('m', 'fal', 'x', 'M', '{9:16}', '{5}', 4, '720p', 0.2, '{}', true)`);
  await pool.query(`insert into assets (id, owner_id, kind, s3_key, filename, mime, bytes, workspace_id) values ('photo', $1, 'input', 'assets/photo', 'photo', 'image/png', 1, 'ws_vet')`, [ids.owner]);
  for (const v of TURNTABLE_VIEWS) await run(`view-${v}`, v);
  await run('view-top', 'top');
  await pool.query(`insert into workspaces (id, name) values ('ws_x', 'Partner') on conflict do nothing`);
  await pool.query(`insert into workspace_members (workspace_id, user_id, role) values ('ws_x', $1, 'member')`, [ids.owner]);
});

afterAll(async () => {
  try {
    const Bucket = bucketName();
    const { Contents = [] } = await s3().send(new ListObjectsV2Command({ Bucket }));
    if (Contents.length > 0) await s3().send(new DeleteObjectsCommand({ Bucket, Delete: { Objects: Contents.flatMap(({ Key }) => (Key ? [{ Key }] : [])) } }));
    await s3().send(new DeleteBucketCommand({ Bucket }));
    await pool.end();
  } finally {
    await testDb.drop();
  }
});

test('asks for a sign-in, and is 404 while the worker has not stored the video, or for a Run id or photo it does not know', async () => {
  expect((await call(null)).status).toBe(401);
  expect((await call('owner')).status).toBe(404); // all 7 views are done but no video yet
  expect((await call('owner', 'not-a-uuid')).status).toBe(404);
  expect((await call('owner', BATCH, '')).status).toBe(404); // no photo named
  expect((await call('owner', BATCH, '?asset=other-photo')).status).toBe(404);
  expect((await call('owner', '0c8a7a0e-9d6e-4a54-8a39-6d1c4c7f2b78')).status).toBe(404);
});

test('streams the stored video inline with Range support, and as a named attachment with download=1', async () => {
  await putObject(turntableKey(BATCH, 'photo'), VIDEO, 'video/mp4');
  const res = await call('owner');
  expect(res.status).toBe(200);
  expect(res.headers.get('content-type')).toBe('video/mp4');
  expect(res.headers.get('content-disposition')).toMatch(/^inline;/);
  expect(res.headers.get('accept-ranges')).toBe('bytes');
  expect([...new Uint8Array(await res.arrayBuffer())]).toEqual([...VIDEO]);

  const part = await call('owner', BATCH, '?asset=photo', { range: 'bytes=4-7' });
  expect(part.status).toBe(206);
  expect(part.headers.get('content-range')).toBe(`bytes 4-7/${VIDEO.length}`);
  expect([...new Uint8Array(await part.arrayBuffer())]).toEqual([...VIDEO.subarray(4, 8)]);

  const download = await call('owner', BATCH, '?asset=photo&download=1');
  expect(download.status).toBe(200);
  expect(download.headers.get('content-disposition')).toMatch(/^attachment; filename="xoay-360-0c8a7a0e\.mp4"/);
  expect((await call('admin')).status).toBe(200); // an Admin reads any Run's pictures
});

test("is as open as the Run's pictures: the workspace's other members see it (a live result is in the Library), another workspace gets 404", async () => {
  expect((await call('other')).status).toBe(200);
  const res = await GET(new Request(`http://localhost/api/turntables/${BATCH}?asset=photo`, { headers: { cookie: `${cookies.owner}; cvs_ws=ws_x` } }), { params: Promise.resolve({ batch: BATCH }) });
  expect(res.status).toBe(404);
});

test('is 404 once one of the 7 views is deleted or failed, though the video is still stored, and is back with a retry', async () => {
  await pool.query(`update jobs set deleted_at = now() where id = 'view-back'`);
  expect((await call('owner')).status).toBe(404);
  await pool.query(`update jobs set deleted_at = null, status = 'failed' where id = 'view-back'`);
  expect((await call('owner')).status).toBe(404);
  await run('view-back-retry', 'back'); // a retry keeps the Run's id
  expect((await call('owner')).status).toBe(200);
});
