// Integration test of History's lookbook against a disposable database and bucket on the compose Postgres and MinIO (`pnpm services:up`).
import { randomBytes } from 'node:crypto';
import { DeleteBucketCommand, DeleteObjectsCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { createTestDatabase } from '@cvs/db/testing';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

const testDb = await createTestDatabase();
process.env.DATABASE_URL = testDb.url;
process.env.BETTER_AUTH_SECRET = randomBytes(32).toString('hex');
process.env.APP_URL = 'http://localhost';
process.env.S3_BUCKET = `cvs-test-${randomBytes(6).toString('hex')}`;

const { auth, pool } = await import('@/lib/auth');
const { bucketName, ensureBucket, putObject, s3 } = await import('@/lib/storage');
const { POST } = await import('./route');

const PASSWORD = 'correct-horse-battery';
const req = (cookie: string, body: unknown) => new Request('http://localhost/api/library/lookbook', { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify(body) });

async function newUser(email: string, name: string) {
  const id = (await auth.api.createUser({ body: { email, name, password: PASSWORD, role: 'member' } })).user.id;
  const res = await auth.api.signInEmail({ body: { email, password: PASSWORD }, asResponse: true });
  return { id, cookie: res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ') };
}

const png = (width: number, height: number, r: number) => sharp({ create: { width, height, channels: 3, background: { r, g: 0, b: 0 } } }).png().toBuffer();

/** A job of the user with `bytes` as its output; `status` other than succeeded makes a job with no output. */
async function job(userId: string, id: string, bytes: Uint8Array, mime = 'image/png', status = 'succeeded') {
  const done = status === 'succeeded';
  if (done) {
    await putObject(`assets/${id}-out`, bytes, mime);
    await pool.query(`insert into assets (id, owner_id, kind, s3_key, filename, mime, bytes, workspace_id) values ($1, $2, 'output', $3, 'out', $4, $5, 'ws_vet')`, [`${id}-out`, userId, `assets/${id}-out`, mime, bytes.length]);
  }
  await pool.query(
    `insert into jobs (id, user_id, team_id, model, provider, preset_id, prompt, aspect, duration_s, input_asset_ids, status, output_asset_id, params, created_at, workspace_id)
     values ($1, $2, 'team-unassigned', 'lookbook-test', 'fal', null, 'a prompt', '3:4', 0, '{}', $3, $4, '{}', '2026-11-21T03:00:00Z', 'ws_vet')`,
    [id, userId, status, done ? `${id}-out` : null],
  );
  return id;
}

let alice: Awaited<ReturnType<typeof newUser>>;
let bob: Awaited<ReturnType<typeof newUser>>;

beforeAll(async () => {
  await ensureBucket();
  await pool.query(`insert into model_configs (id, provider, endpoint, label, ratios, durations_sec, max_images, output_resolution, usd_per_second, sources, enabled) values ('lookbook-test', 'fal', 'x', 'Lookbook test', '{3:4}', '{0}', 1, '1K', 0, '{}', true)`);
  alice = await newUser('alice@example.test', 'Alice');
  bob = await newUser('bob@example.test', 'Bob');
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

describe('/api/library/lookbook', () => {
  test('lays 4 pictures of any member out two per row on white, each cell the shape of the first, in the order given', async () => {
    const ids = [await job(alice.id, 'look-a1', await png(300, 400, 250)), await job(bob.id, 'look-b1', await png(400, 300, 200)), await job(alice.id, 'look-a2', await png(300, 400, 150)), await job(alice.id, 'look-a3', await png(300, 400, 100))];
    const res = await POST(req(alice.cookie, { ids }));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/jpeg');
    expect(res.headers.get('content-disposition')).toBe('attachment; filename="lookbook.jpg"');
    const sheet = sharp(Buffer.from(await res.arrayBuffer()));
    // Cells are 1024 wide and 1365 high (3:4), with 24 px of white around and between them.
    expect(await sheet.metadata()).toMatchObject({ format: 'jpeg', width: 24 + 2 * (1024 + 24), height: 24 + 2 * (1365 + 24) });
    const { data, info } = await sheet.raw().toBuffer({ resolveWithObject: true });
    const red = (x: number, y: number) => data[(y * info.width + x) * info.channels]!;
    expect(red(24 + 512, 24 + 682)).toBeGreaterThan(240); // first: red 250, top left
    expect(red(24 + 1024 + 24 + 512, 24 + 682)).toBeGreaterThan(190); // second (4:3) fitted whole in its 3:4 cell: red 200 at the middle...
    expect(red(24 + 1024 + 24 + 512, 30)).toBeGreaterThan(245); // ...and white above it
    expect(red(24 + 512, 24 + 1365 + 24 + 682)).toBeLessThan(160); // third, bottom left: red 150
    expect(Math.abs(red(12, 12) - 255)).toBeLessThan(4); // the white margin
  });

  test('takes the cells shape from the first picture as it is shown, turned by its EXIF orientation', async () => {
    const turned = await sharp({ create: { width: 400, height: 300, channels: 3, background: { r: 250, g: 0, b: 0 } } }).jpeg().withMetadata({ orientation: 6 }).toBuffer();
    const ids = [await job(alice.id, 'exif-1', turned, 'image/jpeg'), await job(alice.id, 'exif-2', await png(200, 200, 100))];
    const res = await POST(req(alice.cookie, { ids }));
    expect(await sharp(Buffer.from(await res.arrayBuffer())).metadata()).toMatchObject({ width: 24 + 2 * (1024 + 24), height: 24 + 1365 + 24 }); // 300 x 400 as shown: 3:4
  });

  test('centres an odd last picture in its row', async () => {
    const ids = [await job(alice.id, 'odd-1', await png(200, 200, 250)), await job(alice.id, 'odd-2', await png(200, 200, 250)), await job(alice.id, 'odd-3', await png(200, 200, 100))];
    const res = await POST(req(alice.cookie, { ids }));
    const { data, info } = await sharp(Buffer.from(await res.arrayBuffer())).raw().toBuffer({ resolveWithObject: true });
    expect(info.height).toBe(24 + 2 * (1024 + 24));
    const red = (x: number, y: number) => data[(y * info.width + x) * info.channels]!;
    const middle = Math.round(info.width / 2);
    expect(red(middle, 24 + 1024 + 24 + 512)).toBeLessThan(120); // the third picture spans the middle of the second row
    expect(red(20, 24 + 1024 + 24 + 512)).toBeGreaterThan(245); // white at the far left of that row
  });

  test('refuses fewer than 2 or more than 4 ids, repeats, a video and a job that cannot be listed', async () => {
    const a = await job(alice.id, 'ref-a', await png(10, 10, 1));
    const b = await job(alice.id, 'ref-b', await png(10, 10, 1));
    const video = await job(alice.id, 'ref-video', new TextEncoder().encode('not a picture'), 'video/mp4');
    const failed = await job(alice.id, 'ref-failed', new Uint8Array(), 'image/png', 'failed');
    expect((await POST(req(alice.cookie, { ids: [a] }))).status).toBe(400);
    expect((await POST(req(alice.cookie, { ids: [a, b, a, b, a] }))).status).toBe(400);
    expect((await POST(req(alice.cookie, { ids: [a, a] }))).status).toBe(400);
    expect((await POST(req(alice.cookie, { ids: [a, video] }))).status).toBe(400);
    expect((await POST(req(alice.cookie, { ids: [a, failed] }))).status).toBe(403);
    expect((await POST(req(alice.cookie, { ids: [a, 'no-such-job'] }))).status).toBe(403);
    expect((await POST(new Request('http://localhost/api/library/lookbook', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ids: [a, b] }) }))).status).toBe(401);
  });

  test('answers 422 for an output that is not a readable picture', async () => {
    const a = await job(alice.id, 'bad-a', await png(10, 10, 1));
    const broken = await job(alice.id, 'bad-b', new TextEncoder().encode('garbage'), 'image/png');
    expect((await POST(req(alice.cookie, { ids: [a, broken] }))).status).toBe(422);
  });
});
