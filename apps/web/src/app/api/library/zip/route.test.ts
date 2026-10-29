// Integration test of the Library zip download against a disposable database and bucket on the compose Postgres and MinIO (`pnpm services:up`).
import { randomBytes } from 'node:crypto';
import { crc32 } from 'node:zlib';
import { DeleteBucketCommand, DeleteObjectsCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { createTestDatabase } from '@cvs/db/testing';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

const testDb = await createTestDatabase();
process.env.DATABASE_URL = testDb.url;
process.env.BETTER_AUTH_SECRET = randomBytes(32).toString('hex');
process.env.APP_URL = 'http://localhost';
process.env.S3_BUCKET = `cvs-test-${randomBytes(6).toString('hex')}`;

const { auth, pool } = await import('@/lib/auth');
const { bucketName, ensureBucket, putObject, s3 } = await import('@/lib/storage');
const { GET, POST } = await import('./route');

const PASSWORD = 'correct-horse-battery';
const req = (path: string, cookie?: string, body?: unknown) =>
  new Request(`http://localhost${path}`, { method: body === undefined ? 'GET' : 'POST', headers: { ...(cookie ? { cookie } : {}), 'content-type': 'application/json' }, ...(body !== undefined && { body: JSON.stringify(body) }) });

async function newUser(email: string, name: string) {
  const id = (await auth.api.createUser({ body: { email, name, password: PASSWORD, role: 'member' } })).user.id;
  const res = await auth.api.signInEmail({ body: { email, password: PASSWORD }, asResponse: true });
  return { id, cookie: res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ') };
}

/** A job of the user with an output whose bytes are in the bucket; `status` other than succeeded makes a job with no output. */
async function job(userId: string, id: string, content: string, status = 'succeeded') {
  const done = status === 'succeeded';
  if (done) {
    const bytes = new TextEncoder().encode(content);
    await putObject(`assets/${id}-out`, bytes, 'video/mp4');
    await pool.query(`insert into assets (id, owner_id, kind, s3_key, filename, mime, bytes) values ($1, $2, 'output', $3, 'out.mp4', 'video/mp4', $4)`, [`${id}-out`, userId, `assets/${id}-out`, bytes.length]);
  }
  await pool.query(
    `insert into jobs (id, user_id, team_id, model, provider, preset_id, prompt, aspect, duration_s, input_asset_ids, status, output_asset_id, created_at)
     values ($1, $2, 'team-unassigned', 'zip-test', 'fal', 'gentle-push-in', 'a prompt', '9:16', 8, '{}', $3, $4, '2026-10-23T03:00:00Z')`,
    [id, userId, status, done ? `${id}-out` : null],
  );
  return id;
}

/** The names and contents of a zip's entries, read through its central directory. */
function entries(zip: Uint8Array) {
  const v = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  const eocd = zip.length - 22;
  let p = v.getUint32(eocd + 16, true);
  return Array.from({ length: v.getUint16(eocd + 10, true) }, () => {
    const size = v.getUint32(p + 24, true);
    const crc = v.getUint32(p + 16, true);
    const n = v.getUint16(p + 28, true);
    const name = new TextDecoder().decode(zip.subarray(p + 46, p + 46 + n));
    const local = v.getUint32(p + 42, true);
    const data = local + 30 + v.getUint16(local + 26, true);
    const body = zip.subarray(data, data + size);
    expect(crc32(body)).toBe(crc);
    p += 46 + n;
    return { name, text: new TextDecoder().decode(body) };
  });
}

let alice: Awaited<ReturnType<typeof newUser>>;
let bob: Awaited<ReturnType<typeof newUser>>;

beforeAll(async () => {
  await ensureBucket();
  await pool.query(`insert into model_configs (id, provider, endpoint, label, ratios, durations_sec, max_images, output_resolution, usd_per_second, sources, enabled) values ('zip-test', 'fal', 'x', 'Zip test', '{9:16}', '{8}', 2, '720p', 0.1, '{}', true)`);
  alice = await newUser('alice@example.test', 'Nguyễn Văn Đạt');
  bob = await newUser('bob@example.test', 'Bob');
});

afterAll(async () => {
  const Bucket = bucketName();
  const { Contents = [] } = await s3().send(new ListObjectsV2Command({ Bucket }));
  if (Contents.length > 0) await s3().send(new DeleteObjectsCommand({ Bucket, Delete: { Objects: Contents.flatMap(({ Key }) => (Key ? [{ Key }] : [])) } }));
  await s3().send(new DeleteBucketCommand({ Bucket }));
  await pool.end();
  await testDb.drop();
});

describe('/api/library/zip', () => {
  test('zips live items of any member in the order given, named as the Library names them, a clash getting -2', async () => {
    const mine = await job(alice.id, 'abcdef12-mine', 'first');
    const theirs1 = await job(bob.id, 'bbbbbbbb-one', 'second');
    const theirs2 = await job(bob.id, 'bbbbbbbb-two', 'third'); // same day, creator and first 8 characters as theirs1
    const res = await POST(req('/api/library/zip', alice.cookie, { ids: [mine, theirs1, theirs2] }));
    expect(res.status).toBe(200);
    const { downloadUrl } = (await res.json()) as { downloadUrl: string };
    expect(downloadUrl).toMatch(/^\/api\/library\/zip\?ids=abcdef12-mine,bbbbbbbb-one,bbbbbbbb-two&t=/);
    const zip = await GET(req(downloadUrl, alice.cookie));
    expect(zip.status).toBe(200);
    expect(zip.headers.get('content-type')).toBe('application/zip');
    expect(zip.headers.get('content-disposition')).toMatch(/^attachment; filename="cvs-\d{8}-3\.zip"$/);
    expect(zip.headers.get('cache-control')).toBe('private, no-store');
    expect(zip.headers.get('x-content-type-options')).toBe('nosniff');
    expect(entries(new Uint8Array(await zip.arrayBuffer()))).toEqual([
      { name: '20261023-nguyen-van-dat-abcdef12.mp4', text: 'first' },
      { name: '20261023-bob-bbbbbbbb.mp4', text: 'second' },
      { name: '20261023-bob-bbbbbbbb-2.mp4', text: 'third' },
    ]);
  });

  test('refuses the whole list when one item is deleted, failed or unknown', async () => {
    const ok = await job(alice.id, 'live-ok', 'x');
    const deleted = await job(alice.id, 'live-deleted', 'x');
    await pool.query(`update jobs set deleted_at = now() where id = $1`, [deleted]);
    const failed = await job(alice.id, 'job-failed', '', 'failed');
    for (const other of [deleted, failed, 'no-such-job']) {
      const res = await POST(req('/api/library/zip', alice.cookie, { ids: [ok, other] }));
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ error: 'one or more items cannot be downloaded' });
    }
  });

  test('takes 1 to 50 distinct job ids', async () => {
    const ok = await job(alice.id, 'count-ok', 'x');
    for (const ids of [[], Array.from({ length: 51 }, (_, i) => `id-${i}`), [ok, ok], 'count-ok', [42], ['a,b']]) {
      expect((await POST(req('/api/library/zip', alice.cookie, { ids }))).status).toBe(400);
    }
  });

  test('refuses 4 GiB or more with 413', async () => {
    const a = await job(alice.id, 'huge-a', 'x');
    const b = await job(alice.id, 'huge-b', 'x');
    const c = await job(alice.id, 'huge-c', 'x');
    // A third of 4 GiB, rounded up, each (the column is a 32-bit integer).
    await pool.query(`update assets set bytes = 1431655766 where id = any($1::text[])`, [[`${a}-out`, `${b}-out`, `${c}-out`]]);
    expect((await POST(req('/api/library/zip', alice.cookie, { ids: [a, b, c] }))).status).toBe(413);
    expect((await POST(req('/api/library/zip', alice.cookie, { ids: [a, b] }))).status).toBe(200);
    // Files just under 4 GiB that the headers would push over are refused up front, not cut off mid-stream.
    await pool.query(`update assets set bytes = $2 where id = any($1::text[])`, [[`${a}-out`, `${b}-out`], (2 ** 32 - 600) / 2]);
    expect((await POST(req('/api/library/zip', alice.cookie, { ids: [a, b] }))).status).toBe(413);
  });

  test('needs a session and a token bound to the caller and the exact list', async () => {
    const a = await job(alice.id, 'token-a', 'x');
    const b = await job(alice.id, 'token-b', 'y');
    expect((await POST(req('/api/library/zip', undefined, { ids: [a] }))).status).toBe(401);
    const { downloadUrl } = (await (await POST(req('/api/library/zip', alice.cookie, { ids: [a] }))).json()) as { downloadUrl: string };
    expect((await GET(req(downloadUrl))).status).toBe(401);
    expect((await GET(req(downloadUrl, bob.cookie))).status).toBe(403);
    expect((await GET(req(downloadUrl.replace(`ids=${a}`, `ids=${a},${b}`), alice.cookie))).status).toBe(403);
    expect((await GET(req(`/api/library/zip?ids=${a}&t=123.abc`, alice.cookie))).status).toBe(403);
    expect((await GET(req(`/api/library/zip?ids=${a}`, alice.cookie))).status).toBe(403);
    // Deleted after the link was made: the GET checks again.
    await pool.query(`update jobs set deleted_at = now() where id = $1`, [a]);
    expect((await GET(req(downloadUrl, alice.cookie))).status).toBe(403);
  });
});
