// POST /api/assets/copy against a disposable database and bucket on the compose Postgres and MinIO (`pnpm services:up`): a member's own finished clip becomes
// a new input asset of theirs, for Marketing Studio Advanced's reference video; a finished image becomes one for the image pages' "Use result" button; and another
// member's Library result of the same workspace becomes one too, for the Library detail's photo tools.
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

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

/** A finished clip, or a finished image with `image`: an output asset (in the store unless `object` is false) and the job that points at it, in `workspace` (ws_vet). */
async function clip(id: string, owner: string, o: { mime?: string; bytes?: number; purged?: boolean; deleted?: boolean; kind?: string; object?: boolean; image?: boolean; status?: string; workspace?: string } = {}): Promise<void> {
  const bytes = o.image ? PNG : mp4Fixture({ ms: 6200, width: 720, height: 1280, fps: 30, size: 1024 });
  if (o.object !== false) await putObject(`assets/${id}`, bytes, o.image ? 'image/png' : 'video/mp4');
  await pool.query(`insert into assets (id, owner_id, kind, s3_key, filename, mime, bytes, workspace_id) values ($1, $2, $3, $4, 'video.mp4', $5, $6, $7)`, [id, owner, o.kind ?? 'output', `assets/${id}`, o.mime ?? (o.image ? 'image/png' : 'video/mp4'), o.bytes ?? bytes.length, o.workspace ?? 'ws_vet']);
  await pool.query(
    `insert into jobs (id, user_id, team_id, feature, model, provider, prompt, aspect, duration_s, input_asset_ids, status, output_asset_id, purged_at, deleted_at, workspace_id)
     values ($1, $2, 'team-unassigned', 'marketing', 'mock-model', 'mock', 'p', '9:16', 7, '{}', $6, $3, $4, $5, $7)`,
    [`job-${id}`, owner, id, o.purged ? new Date() : null, o.deleted ? new Date() : null, o.status ?? 'succeeded', o.workspace ?? 'ws_vet'],
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
  try {
    const Bucket = bucketName();
    const { Contents = [] } = await s3().send(new ListObjectsV2Command({ Bucket }));
    if (Contents.length) await s3().send(new DeleteObjectsCommand({ Bucket, Delete: { Objects: Contents.map(({ Key }) => ({ Key: Key! })) } }));
    await s3().send(new DeleteBucketCommand({ Bucket }));
    await pool.end();
  } finally {
    await testDb.drop();
  }
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

  test('is 404 for an input asset, a clip whose job was deleted or purged, and an asset that is not there', async () => {
    await clip('an-input', userId, { kind: 'input' });
    await clip('purged', userId, { purged: true });
    await clip('deleted', userId, { deleted: true });
    for (const assetId of ['an-input', 'purged', 'deleted', 'nope']) expect((await copy(member, { assetId })).status, assetId).toBe(404);
  });

  // Owner decision 2026-11-20: the Library detail's photo tools copy any member's Library picture, which every member of the workspace can already read.
  test('copies another member’s live Library clip into a new input of the caller’s own, in the caller’s workspace', async () => {
    await clip('lib-pic', otherId, { image: true });
    await clip('lib-clip', otherId);
    for (const assetId of ['lib-pic', 'lib-clip']) {
      const res = await copy(member, { assetId });
      expect(res.status, assetId).toBe(201);
      const [made] = ((await res.json()) as { assets: { id: string }[] }).assets;
      expect((await pool.query('select owner_id, kind, workspace_id from assets where id = $1', [made!.id])).rows[0]).toEqual({ owner_id: userId, kind: 'input', workspace_id: 'ws_vet' });
    }
    expect((await pool.query(`select owner_id, kind from assets where id = 'lib-pic'`)).rows[0]).toEqual({ owner_id: otherId, kind: 'output' }); // the result stays theirs
  });

  test('is 404 for another member’s output that is not a live Library clip: unfinished, failed, deleted or purged', async () => {
    await clip('their-running', otherId, { image: true, status: 'running' });
    await clip('their-failed', otherId, { image: true, status: 'failed' });
    await clip('their-deleted', otherId, { image: true, deleted: true });
    await clip('their-purged', otherId, { image: true, purged: true });
    for (const assetId of ['their-running', 'their-failed', 'their-deleted', 'their-purged']) expect((await copy(member, { assetId })).status, assetId).toBe(404);
  });

  test('is 404 for a Library clip of another workspace, the caller’s own too', async () => {
    await pool.query(`insert into workspaces (id, name) values ('ws_copy', 'Partner') on conflict do nothing`);
    await clip('elsewhere', otherId, { image: true, workspace: 'ws_copy' });
    await clip('mine-elsewhere', userId, { image: true, workspace: 'ws_copy' });
    for (const assetId of ['elsewhere', 'mine-elsewhere']) expect((await copy(member, { assetId })).status, assetId).toBe(404);
  });

  test('copies the caller’s own finished image as a new input asset of its own, for output, live job and image type only', async () => {
    await clip('pic', userId, { image: true });
    await clip('pic-input', userId, { image: true, kind: 'input' });
    await clip('pic-purged', userId, { image: true, purged: true });
    await clip('pic-deleted', userId, { image: true, deleted: true });
    await clip('pic-gif', userId, { image: true, mime: 'image/gif' });
    for (const assetId of ['pic-input', 'pic-purged', 'pic-deleted', 'pic-gif']) expect((await copy(member, { assetId })).status, assetId).toBe(404);
    const res = await copy(member, { assetId: 'pic' });
    expect(res.status).toBe(201);
    const [made] = ((await res.json()) as { assets: { id: string; filename: string; mime: string; bytes: number }[] }).assets;
    expect(made!.id).not.toBe('pic');
    expect([made!.mime, made!.bytes, made!.filename]).toEqual(['image/png', PNG.length, `history-${made!.id.slice(0, 8)}.png`]);
    expect((await pool.query('select owner_id, kind, s3_key, mime, duration_ms from assets where id = $1', [made!.id])).rows[0]).toEqual({ owner_id: userId, kind: 'input', s3_key: `assets/${made!.id}`, mime: 'image/png', duration_ms: null });
    expect((await pool.query(`select count(*)::int as n from assets where id = 'pic' and kind = 'output'`)).rows[0].n).toBe(1); // the result stays
  });

  // The print fix opens a clip on its first frame: the poster the worker cut from frame 0 copies as the clip's result does, under the same sharing rule; an image job's poster,
  // a downscaled tile preview, does not.
  const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1]);
  /** A finished clip of `owner` (or a picture with `image`, its job 0 s long) whose poster is the output asset `id`, its job shaped by `o` as clip() does. */
  async function poster(id: string, owner: string, o: Parameters<typeof clip>[2] = {}): Promise<void> {
    await clip(`${id}-out`, owner, o);
    await putObject(`assets/${id}`, JPEG, 'image/jpeg');
    await pool.query(`insert into assets (id, owner_id, kind, s3_key, filename, mime, bytes, workspace_id) values ($1, $2, 'output', $3, 'poster.jpg', 'image/jpeg', $4, $5)`, [id, owner, `assets/${id}`, JPEG.length, o.workspace ?? 'ws_vet']);
    await pool.query(`update jobs set poster_asset_id = $1, duration_s = $2 where id = $3`, [id, o.image ? 0 : 7, `job-${id}-out`]);
  }

  test('copies a finished clip’s poster as a new image input, and is 404 for an image job’s preview poster', async () => {
    await poster('clip-poster', userId);
    await poster('pic-preview', userId, { image: true });
    const res = await copy(member, { assetId: 'clip-poster' });
    expect(res.status).toBe(201);
    const [made] = ((await res.json()) as { assets: { id: string; filename: string; mime: string; durationMs?: number }[] }).assets;
    expect([made!.mime, made!.filename, made!.durationMs]).toEqual(['image/jpeg', `history-${made!.id.slice(0, 8)}.jpg`, undefined]);
    expect((await pool.query('select owner_id, kind from assets where id = $1', [made!.id])).rows[0]).toEqual({ owner_id: userId, kind: 'input' });
    expect((await copy(member, { assetId: 'pic-preview' })).status).toBe(404);
  });

  test('shares a clip’s poster as the Library shares the clip: another member’s live clip yes; a failed, deleted or other workspace’s clip no', async () => {
    await pool.query(`insert into workspaces (id, name) values ('ws_copy', 'Partner') on conflict do nothing`);
    await poster('their-poster', otherId);
    await poster('their-failed-poster', otherId, { status: 'failed' });
    await poster('their-deleted-poster', otherId, { deleted: true });
    await poster('elsewhere-poster', otherId, { workspace: 'ws_copy' });
    const res = await copy(member, { assetId: 'their-poster' });
    expect(res.status).toBe(201);
    const [made] = ((await res.json()) as { assets: { id: string }[] }).assets;
    expect((await pool.query('select owner_id, kind, workspace_id from assets where id = $1', [made!.id])).rows[0]).toEqual({ owner_id: userId, kind: 'input', workspace_id: 'ws_vet' });
    for (const assetId of ['their-failed-poster', 'their-deleted-poster', 'elsewhere-poster']) expect((await copy(member, { assetId })).status, assetId).toBe(404);
  });

  test('is 415 for an image result whose file is not a JPEG, PNG or WebP', async () => {
    await clip('pic-bad', userId, { image: true, object: false });
    await putObject('assets/pic-bad', new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]), 'image/png');
    expect((await copy(member, { assetId: 'pic-bad' })).status).toBe(415);
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
        `insert into assets (id, owner_id, kind, s3_key, filename, mime, bytes, created_at, workspace_id) select g || '-' || $3, $4, $5, 'busy/' || g || '-' || $3, 'x.jpg', 'image/jpeg', 1, now() - $2::interval, 'ws_vet' from generate_series(1, $1) g`,
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
