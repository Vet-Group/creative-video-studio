// The Compress & download button API against a disposable database and bucket on the compose Postgres and MinIO (`pnpm services:up`). No worker runs: the test plays its part on the queue.
import { randomBytes } from 'node:crypto';
import { DeleteBucketCommand, DeleteObjectsCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { COMPRESS_QUEUE, compressedKey } from '@cvs/core/queue';
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
const call = (method: 'GET' | 'POST', id: string, who?: string) => (method === 'GET' ? GET : POST)(new Request(`http://localhost/api/assets/${id}/compress`, { method, headers: who ? { cookie: cookies[who]! } : {} }), ctx(id));
const download = (url: string, id: string, who: string) => DOWNLOAD(new Request(`http://localhost${url}`, { headers: { cookie: cookies[who]! } }), ctx(id));
const statusOf = async (res: Response) => ((await res.json()) as { status: string }).status;
const jobsOf = async (id: string) => (await boss()).findJobs(COMPRESS_QUEUE, { key: id });

beforeAll(async () => {
  await ensureBucket();
  for (const name of ['owner', 'other']) {
    ids[name] = (await auth.api.createUser({ body: { email: `${name}@example.test`, name, password: PASSWORD, role: 'member' } })).user.id;
    const res = await auth.api.signInEmail({ body: { email: `${name}@example.test`, password: PASSWORD }, asResponse: true });
    cookies[name] = res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
  }
  for (const [id, mime] of [['clip', 'video/mp4'], ['clip2', 'video/mp4'], ['clip3', 'video/mp4'], ['pic', 'image/png']]) {
    await pool.query(`insert into assets (id, owner_id, kind, s3_key, filename, mime, bytes) values ($1, $2, 'input', $3, $1, $4, 1)`, [id, ids.owner, `assets/${id}`, mime]);
  }
});

afterAll(async () => {
  await stopBoss();
  const Bucket = bucketName();
  const { Contents = [] } = await s3().send(new ListObjectsV2Command({ Bucket }));
  if (Contents.length > 0) await s3().send(new DeleteObjectsCommand({ Bucket, Delete: { Objects: Contents.flatMap(({ Key }) => (Key ? [{ Key }] : [])) } }));
  await s3().send(new DeleteBucketCommand({ Bucket }));
  await pool.end();
  await testDb.drop();
});

test('asks for a sign-in, and gives another member the answers the original download gives', async () => {
  expect((await call('POST', 'clip')).status).toBe(401);
  expect((await call('POST', 'clip', 'other')).status).toBe(403); // a private upload of someone else
  expect((await call('GET', 'clip', 'other')).status).toBe(403);
  expect((await call('POST', 'missing', 'owner')).status).toBe(404);
  expect(await jobsOf('clip')).toEqual([]);
});

test('refuses an image', async () => {
  const res = await call('POST', 'pic', 'owner');
  expect(res.status).toBe(400);
  expect(((await res.json()) as { error: string }).error).toBe('only a video can be compressed');
  expect(await jobsOf('pic')).toEqual([]);
});

test('queues one compression per asset however many times it is asked', async () => {
  expect(await statusOf(await call('GET', 'clip', 'owner'))).toBe('none');
  expect(await statusOf(await call('POST', 'clip', 'owner'))).toBe('working');
  const again = await Promise.all([call('POST', 'clip', 'owner'), call('POST', 'clip', 'owner'), call('POST', 'clip', 'owner')]);
  expect(await Promise.all(again.map(statusOf))).toEqual(['working', 'working', 'working']);
  expect(await statusOf(await call('GET', 'clip', 'owner'))).toBe('working');
  const jobs = await jobsOf('clip');
  expect(jobs).toHaveLength(1);
  expect(jobs[0]!.data).toEqual({ assetId: 'clip' });
});

test('says original when the worker finished without a copy, failed when it failed, and asks again after a failure', async () => {
  const b = await boss();
  const take = async (assetId: string) => (await b.fetch(COMPRESS_QUEUE, { batchSize: 10 })).find((j) => (j.data as { assetId: string }).assetId === assetId)!;
  await call('POST', 'clip2', 'owner');
  await b.complete(COMPRESS_QUEUE, (await take('clip2')).id);
  expect(await statusOf(await call('GET', 'clip2', 'owner'))).toBe('original');
  expect(await statusOf(await call('POST', 'clip2', 'owner'))).toBe('original'); // not run again
  expect(await jobsOf('clip2')).toHaveLength(1);

  await call('POST', 'clip3', 'owner');
  await b.fail(COMPRESS_QUEUE, (await take('clip3')).id);
  expect(await statusOf(await call('GET', 'clip3', 'owner'))).toBe('failed');
  expect(await statusOf(await call('POST', 'clip3', 'owner'))).toBe('working');
  expect(await jobsOf('clip3')).toHaveLength(2);
});

test('hands out the stored copy under the original download rules once it is ready, named with -nen', async () => {
  await putObject('assets/clip', new Uint8Array([9]), 'video/mp4');
  await putObject(compressedKey('clip'), new Uint8Array([1, 2, 3, 4]), 'video/mp4');
  const body = (await (await call('GET', 'clip', 'owner')).json()) as { status: string; downloadUrl: string };
  expect(body.status).toBe('ready');
  expect(body.downloadUrl).toMatch(/^\/api\/assets\/clip\/download\?t=[^&]+&variant=compressed$/);
  expect(await statusOf(await call('POST', 'clip', 'owner'))).toBe('ready');

  const file = await download(body.downloadUrl, 'clip', 'owner');
  expect(file.status).toBe(200);
  expect(file.headers.get('content-type')).toBe('video/mp4');
  expect(file.headers.get('content-disposition')).toContain('clip-nen.mp4');
  expect([...new Uint8Array(await file.arrayBuffer())]).toEqual([1, 2, 3, 4]);
  expect((await download(body.downloadUrl, 'clip', 'other')).status).toBe(403); // the link is the owner's
  expect((await download(body.downloadUrl.replace('&variant=compressed', ''), 'clip', 'owner')).headers.get('content-disposition')).not.toContain('-nen'); // no variant: the original
});

test('the compressed download is 404 while no copy is stored', async () => {
  const url = `/api/assets/clip2/download?t=${signDownloadToken('clip2', ids.owner!)}&variant=compressed`;
  expect((await download(url, 'clip2', 'owner')).status).toBe(404);
});
