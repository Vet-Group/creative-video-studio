// The Reframe & download API against a disposable database and bucket on the compose Postgres and MinIO (`pnpm services:up`). No worker runs: the test plays its part on the queue.
import { randomBytes } from 'node:crypto';
import { DeleteBucketCommand, DeleteObjectsCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { COMPRESS_MAX_BYTES, REFRAME_QUEUE, reframedKey } from '@cvs/core/queue';
import { createTestDatabase } from '@cvs/db/testing';
import { afterAll, beforeAll, expect, test } from 'vitest';

const testDb = await createTestDatabase();
process.env.DATABASE_URL = testDb.url;
process.env.BETTER_AUTH_SECRET = randomBytes(32).toString('hex');
process.env.APP_URL = 'http://localhost';
process.env.S3_BUCKET = `cvs-test-${randomBytes(6).toString('hex')}`;

const { auth, pool } = await import('@/lib/auth');
const { signDownloadToken } = await import('@/lib/download-token');
const { boss, stopBoss } = await import('@/lib/queue');
const { bucketName, ensureBucket, putObject, s3 } = await import('@/lib/storage');
const { GET, POST } = await import('./route');
const { GET: DOWNLOAD } = await import('../download/route');

const PASSWORD = 'correct-horse-battery';
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const cookies: Record<string, string> = {};
const ids: Record<string, string> = {};
const call = (method: 'GET' | 'POST', id: string, who?: string, query = 'ratio=9:16&fill=blur') =>
  (method === 'GET' ? GET : POST)(new Request(`http://localhost/api/assets/${id}/reframe?${query}`, { method, headers: who ? { cookie: cookies[who]! } : {} }), ctx(id));
const download = (url: string, id: string, who: string) => DOWNLOAD(new Request(`http://localhost${url}`, { headers: { cookie: cookies[who]! } }), ctx(id));
const statusOf = async (res: Response) => ((await res.json()) as { status: string }).status;
const jobsOf = async (id: string, ratio: '9:16' | '4:5' | '1:1' = '9:16', fill: 'blur' | 'black' = 'blur') => (await boss()).findJobs(REFRAME_QUEUE, { key: reframedKey(id, ratio, fill) });

beforeAll(async () => {
  await ensureBucket();
  for (const name of ['owner', 'other']) {
    ids[name] = (await auth.api.createUser({ body: { email: `${name}@example.test`, name, password: PASSWORD, role: 'member' } })).user.id;
    const res = await auth.api.signInEmail({ body: { email: `${name}@example.test`, password: PASSWORD }, asResponse: true });
    cookies[name] = res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
  }
  for (const [id, kind, mime, bytes] of [['clip', 'output', 'video/mp4', 1], ['clip2', 'output', 'video/mp4', 1], ['clip3', 'output', 'video/mp4', 1], ['pic', 'output', 'image/png', 1], ['upload', 'input', 'video/mp4', 1], ['huge', 'output', 'video/mp4', COMPRESS_MAX_BYTES + 1]]) {
    await pool.query(`insert into assets (id, owner_id, kind, s3_key, filename, mime, bytes, workspace_id) values ($1, $2, $3, concat('assets/', $1::text), $1, $4, $5, 'ws_vet')`, [id, ids.owner, kind, mime, bytes]);
  }
});

afterAll(async () => {
  try {
    await stopBoss();
    const Bucket = bucketName();
    const { Contents = [] } = await s3().send(new ListObjectsV2Command({ Bucket }));
    if (Contents.length > 0) await s3().send(new DeleteObjectsCommand({ Bucket, Delete: { Objects: Contents.flatMap(({ Key }) => (Key ? [{ Key }] : [])) } }));
    await s3().send(new DeleteBucketCommand({ Bucket }));
    await pool.end();
  } finally {
    await testDb.drop();
  }
});

test('asks for a sign-in, and gives another member the answers the original download gives', async () => {
  expect((await call('POST', 'clip')).status).toBe(401);
  expect((await call('POST', 'clip', 'other')).status).toBe(403); // a private upload of someone else
  expect((await call('GET', 'clip', 'other')).status).toBe(403);
  expect((await call('POST', 'missing', 'owner')).status).toBe(404);
  expect(await jobsOf('clip')).toEqual([]);
});

test('refuses an image, an input video, a video over the size cap, and a shape or fill not offered, in Vietnamese', async () => {
  const refusals = [
    ['pic', 'ratio=9:16&fill=blur', 'Chỉ đổi khung được video kết quả.'],
    ['upload', 'ratio=9:16&fill=blur', 'Chỉ đổi khung được video kết quả.'],
    ['huge', 'ratio=9:16&fill=blur', 'Video nặng hơn 200 MB nên không đổi khung được.'],
    ...['ratio=16:9&fill=blur', 'ratio=9:16&fill=white', 'ratio=9:16', 'fill=blur', 'ratio=..%2F9:16&fill=blur'].map((q) => ['clip', q, 'Hãy chọn khung 9:16, 4:5 hoặc 1:1 và nền mờ hoặc nền đen.']),
  ] as const;
  for (const [id, query, text] of refusals) {
    const res = await call('POST', id, 'owner', query);
    expect(res.status, `${id} ${query}`).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe(text);
    expect((await call('GET', id, 'owner', query)).status, `${id} ${query}`).toBe(400);
  }
  expect((await (await boss()).findJobs(REFRAME_QUEUE)).length).toBe(0);
});

test('queues one reframe per asset, shape and fill however many times it is asked', async () => {
  expect(await statusOf(await call('GET', 'clip', 'owner'))).toBe('none');
  expect(await statusOf(await call('POST', 'clip', 'owner'))).toBe('working');
  const again = await Promise.all([call('POST', 'clip', 'owner'), call('POST', 'clip', 'owner'), call('POST', 'clip', 'owner')]);
  expect(await Promise.all(again.map(statusOf))).toEqual(['working', 'working', 'working']);
  expect(await statusOf(await call('GET', 'clip', 'owner'))).toBe('working');
  const jobs = await jobsOf('clip');
  expect(jobs).toHaveLength(1);
  expect(jobs[0]!.data).toEqual({ assetId: 'clip', ratio: '9:16', fill: 'blur' });
  // Another shape or fill is its own copy.
  expect(await statusOf(await call('GET', 'clip', 'owner', 'ratio=1:1&fill=black'))).toBe('none');
  expect(await statusOf(await call('POST', 'clip', 'owner', 'ratio=1:1&fill=black'))).toBe('working');
  expect(await jobsOf('clip', '1:1', 'black')).toHaveLength(1);
});

test('says failed when the worker failed or finished without a copy, and asks again after that', async () => {
  const b = await boss();
  const take = async (assetId: string) => (await b.fetch(REFRAME_QUEUE, { batchSize: 10 })).find((j) => (j.data as { assetId: string }).assetId === assetId)!;
  await call('POST', 'clip2', 'owner');
  await b.fail(REFRAME_QUEUE, (await take('clip2')).id);
  expect(await statusOf(await call('GET', 'clip2', 'owner'))).toBe('failed');
  expect(await statusOf(await call('POST', 'clip2', 'owner'))).toBe('working');
  expect(await jobsOf('clip2')).toHaveLength(2);

  await call('POST', 'clip3', 'owner');
  await b.complete(REFRAME_QUEUE, (await take('clip3')).id);
  expect(await statusOf(await call('GET', 'clip3', 'owner'))).toBe('failed');
  expect(await statusOf(await call('POST', 'clip3', 'owner'))).toBe('working');
  expect(await jobsOf('clip3')).toHaveLength(2);
});

test('hands out the stored copy under the original download rules once it is ready, named with the shape', async () => {
  await putObject('assets/clip', new Uint8Array([9]), 'video/mp4');
  await putObject(reframedKey('clip', '9:16', 'blur'), new Uint8Array([1, 2, 3, 4]), 'video/mp4');
  const body = (await (await call('GET', 'clip', 'owner')).json()) as { status: string; downloadUrl: string };
  expect(body.status).toBe('ready');
  expect(body.downloadUrl).toMatch(/^\/api\/assets\/clip\/download\?t=[^&]+&variant=reframed&ratio=9:16&fill=blur$/);
  expect(await statusOf(await call('POST', 'clip', 'owner'))).toBe('ready');
  expect(await statusOf(await call('GET', 'clip', 'owner', 'ratio=9:16&fill=black'))).toBe('none'); // the other fill is not made yet

  const file = await download(body.downloadUrl, 'clip', 'owner');
  expect(file.status).toBe(200);
  expect(file.headers.get('content-type')).toBe('video/mp4');
  expect(file.headers.get('content-disposition')).toContain('clip-9x16-blur.mp4');
  expect([...new Uint8Array(await file.arrayBuffer())]).toEqual([1, 2, 3, 4]);
  expect((await download(body.downloadUrl, 'clip', 'other')).status).toBe(403); // the link is the owner's
  expect((await download(body.downloadUrl.replace('fill=blur', 'fill=black'), 'clip', 'owner')).status).toBe(404); // not made
  expect((await download(body.downloadUrl.replace('ratio=9:16', 'ratio=16:9'), 'clip', 'owner')).status).toBe(404); // not offered
});

test('the reframed download is 404 while no copy is stored', async () => {
  const url = `/api/assets/clip2/download?t=${signDownloadToken('clip2', ids.owner!)}&variant=reframed&ratio=4:5&fill=blur`;
  expect((await download(url, 'clip2', 'owner')).status).toBe(404);
});
