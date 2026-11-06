// POST /api/assets/copy against a disposable database and bucket on the compose Postgres and MinIO (`pnpm services:up`): a member's own finished clip becomes
// a new input asset of theirs, for Marketing Studio Advanced's reference video.
import { randomBytes } from 'node:crypto';
import { DeleteBucketCommand, DeleteObjectsCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { createTestDatabase } from '@cvs/db/testing';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';

vi.setConfig({ testTimeout: 30_000 });

const testDb = await createTestDatabase();
process.env.DATABASE_URL = testDb.url;
process.env.BETTER_AUTH_SECRET = randomBytes(32).toString('hex');
process.env.APP_URL = 'http://localhost';
process.env.S3_BUCKET = `cvs-test-${randomBytes(6).toString('hex')}`;

const { auth, pool } = await import('@/lib/auth');
const { bucketName, ensureBucket, putObject, s3 } = await import('@/lib/storage');
const { mp4Fixture } = await import('@/lib/mp4-fixture');
const { POST } = await import('./copy/route');
const { COPY_HOURLY_LIMIT } = await import('./samples/route');

const PASSWORD = 'correct-horse-battery';
let member = '';
let other = '';
let userId = '';
let otherId = '';

async function signIn(email: string): Promise<string> {
  const res = await auth.api.signInEmail({ body: { email, password: PASSWORD }, asResponse: true });
  return res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
}
const copy = (cookie: string | undefined, body: unknown) =>
  POST(new Request('http://localhost/api/assets/copy', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) } }));

/** A finished clip: an output asset (an MP4 in the store unless `object` is false) and the job that points at it. */
async function clip(id: string, owner: string, o: { mime?: string; bytes?: number; purged?: boolean; deleted?: boolean; kind?: string; object?: boolean } = {}): Promise<void> {
  const bytes = mp4Fixture({ ms: 6200, width: 720, height: 1280, fps: 30, size: 1024 });
  if (o.object !== false) await putObject(`assets/${id}`, bytes, 'video/mp4');
  await pool.query(`insert into assets (id, owner_id, kind, s3_key, filename, mime, bytes) values ($1, $2, $3, $4, 'video.mp4', $5, $6)`, [id, owner, o.kind ?? 'output', `assets/${id}`, o.mime ?? 'video/mp4', o.bytes ?? bytes.length]);
  await pool.query(
    `insert into jobs (id, user_id, team_id, feature, model, provider, prompt, aspect, duration_s, input_asset_ids, status, output_asset_id, purged_at, deleted_at)
     values ($1, $2, 'team-unassigned', 'marketing', 'mock-model', 'mock', 'p', '9:16', 7, '{}', 'succeeded', $3, $4, $5)`,
    [`job-${id}`, owner, id, o.purged ? new Date() : null, o.deleted ? new Date() : null],
  );
}

beforeAll(async () => {
  await ensureBucket();
  await pool.query(`insert into model_configs (id, provider, endpoint, label, ratios, durations_sec, max_images, output_resolution, usd_per_second, sources, enabled) values ('mock-model', 'mock', 'mock', 'M', '{9:16}', '{7}', 4, '720p', 0.1, '{}', true)`);
  userId = (await auth.api.createUser({ body: { email: 'member@example.test', name: 'Member', password: PASSWORD, role: 'member' } })).user.id;
  otherId = (await auth.api.createUser({ body: { email: 'other@example.test', name: 'Other', password: PASSWORD, role: 'member' } })).user.id;
  member = await signIn('member@example.test');
  other = await signIn('other@example.test');
});

afterAll(async () => {
  const Bucket = bucketName();
  const { Contents = [] } = await s3().send(new ListObjectsV2Command({ Bucket }));
  if (Contents.length) await s3().send(new DeleteObjectsCommand({ Bucket, Delete: { Objects: Contents.map(({ Key }) => ({ Key: Key! })) } }));
  await s3().send(new DeleteBucketCommand({ Bucket }));
  await pool.end();
  await testDb.drop();
});

describe('POST /api/assets/copy', () => {
  test('copies the caller’s own finished clip as a new input asset with the length of its header', async () => {
    await clip('mine', userId);
    expect((await copy(undefined, { assetId: 'mine' })).status).toBe(401);
    const res = await copy(member, { assetId: 'mine' });
    expect(res.status).toBe(201);
    const [made] = ((await res.json()) as { assets: { id: string; mime: string; durationMs: number; bytes: number }[] }).assets;
    expect([made!.mime, made!.durationMs, made!.bytes]).toEqual(['video/mp4', 6200, 1024]);
    expect((await pool.query('select owner_id, kind, s3_key, mime, bytes, duration_ms from assets where id = $1', [made!.id])).rows[0]).toEqual({ owner_id: userId, kind: 'input', s3_key: `assets/${made!.id}`, mime: 'video/mp4', bytes: 1024, duration_ms: 6200 });
    expect((await pool.query(`select count(*)::int as n from assets where id = 'mine' and kind = 'output'`)).rows[0].n).toBe(1); // the output stays
  });

  test('falls back to the job’s duration when the header gives no length', async () => {
    await clip('nolength', userId, { object: false });
    await putObject('assets/nolength', new Uint8Array([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]), 'video/mp4');
    const [made] = ((await (await copy(member, { assetId: 'nolength' })).json()) as { assets: { durationMs: number }[] }).assets;
    expect(made!.durationMs).toBe(7000);
  });

  test('is 404 for someone else’s clip, an input asset, a clip whose job was deleted or purged, and an asset that is not there', async () => {
    await clip('theirs', otherId);
    await clip('an-input', userId, { kind: 'input' });
    await clip('purged', userId, { purged: true });
    await clip('deleted', userId, { deleted: true });
    for (const assetId of ['theirs', 'an-input', 'purged', 'deleted', 'nope']) expect((await copy(member, { assetId })).status, assetId).toBe(404);
    expect((await copy(other, { assetId: 'theirs' })).status).toBe(201); // the owner may
  });

  test('is 400 without an asset id, 413 over 50 MB and 415 for a file that is not an MP4', async () => {
    for (const body of [{}, { assetId: 5 }, null]) expect((await copy(member, body)).status, JSON.stringify(body)).toBe(400);
    await clip('huge', userId, { bytes: 50 * 1024 * 1024 + 1, object: false });
    expect((await copy(member, { assetId: 'huge' })).status).toBe(413);
    await clip('not-mp4', userId, { object: false });
    await putObject('assets/not-mp4', new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]), 'video/mp4');
    expect((await copy(member, { assetId: 'not-mp4' })).status).toBe(415);
  });

  test('stops a caller who added the hourly limit of new files, counting older ones and outputs out', async () => {
    const busyId = (await auth.api.createUser({ body: { email: 'busy@example.test', name: 'Busy', password: PASSWORD, role: 'member' } })).user.id;
    const busy = await signIn('busy@example.test');
    await clip('busy-clip', busyId);
    const add = (count: number, age: string, kind: string) =>
      pool.query(
        `insert into assets (id, owner_id, kind, s3_key, filename, mime, bytes, created_at) select g || '-' || $3, $4, $5, 'busy/' || g || '-' || $3, 'x.jpg', 'image/jpeg', 1, now() - $2::interval from generate_series(1, $1) g`,
        [count, age, `${kind}-${age.replace(' ', '')}`, busyId, kind],
      );
    await add(COPY_HOURLY_LIMIT, '2 hours', 'input'); // older than the hour: not counted
    await add(5, '30 seconds', 'output'); // results are not new files
    await add(COPY_HOURLY_LIMIT, '1 minute', 'input');
    const res = await copy(busy, { assetId: 'busy-clip' });
    expect(res.status).toBe(429);
    expect(((await res.json()) as { error: string }).error).toMatch(/hour/);
  });
});
