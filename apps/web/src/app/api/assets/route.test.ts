// Integration test against a disposable database and bucket on the compose Postgres and MinIO (`pnpm services:up`).
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
const { signDownloadToken } = await import('@/lib/download-token');
const { bucketName, ensureBucket, s3 } = await import('@/lib/storage');
const { POST } = await import('./route');
const { GET: GET_DETAILS } = await import('./[id]/route');
const { GET: GET_CONTENT } = await import('./[id]/content/route');
const { GET: GET_DOWNLOAD } = await import('./[id]/download/route');

const PASSWORD = 'correct-horse-battery';
const BASE = 'http://localhost/api/assets';
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

/** `size` bytes that start with `magic` and then count 0..250 over and over, so any slice is recognisable. */
function file(magic: number[], size: number): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(new ArrayBuffer(size));
  bytes.forEach((_, i) => (bytes[i] = magic[i] ?? i % 251));
  return bytes;
}
const png = (size: number) => file([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], size);
const jpeg = (size: number) => file([0xff, 0xd8, 0xff, 0xe0], size);
const webp = (size: number) => file([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50], size);

const get = (path: string, cookie?: string, headers: Record<string, string> = {}) =>
  new Request(`http://localhost${path}`, { headers: { ...(cookie ? { cookie } : {}), ...headers } });

function upload(cookie: string | undefined, ...files: { name: string; bytes: Uint8Array<ArrayBuffer>; type?: string }[]) {
  const form = new FormData();
  for (const f of files) form.append('file', new File([f.bytes], f.name, { type: f.type ?? 'application/octet-stream' }));
  return POST(new Request(BASE, { method: 'POST', body: form, headers: cookie ? { cookie } : {} }));
}

async function uploadOne(cookie: string, bytes: Uint8Array<ArrayBuffer>, name = 'photo.png'): Promise<string> {
  const res = await upload(cookie, { name, bytes });
  expect(res.status).toBe(201);
  const { assets } = (await res.json()) as { assets: [{ id: string }] };
  return assets[0].id;
}

async function signIn(email: string): Promise<string> {
  const res = await auth.api.signInEmail({ body: { email, password: PASSWORD }, asResponse: true });
  expect(res.status).toBe(200);
  return res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
}

let ownerId = '';
let adminId = '';
let ownerCookie = '';
let otherCookie = '';
let adminCookie = '';

beforeAll(async () => {
  await ensureBucket();
  ownerId = (await auth.api.createUser({ body: { email: 'owner@example.test', name: 'Owner', password: PASSWORD, role: 'member' } })).user.id;
  await auth.api.createUser({ body: { email: 'other@example.test', name: 'Other', password: PASSWORD, role: 'member' } });
  adminId = (await auth.api.createUser({ body: { email: 'admin@example.test', name: 'Admin', password: PASSWORD, role: 'admin' } })).user.id;
  ownerCookie = await signIn('owner@example.test');
  otherCookie = await signIn('other@example.test');
  adminCookie = await signIn('admin@example.test');
});

afterAll(async () => {
  const Bucket = bucketName();
  const { Contents = [] } = await s3().send(new ListObjectsV2Command({ Bucket }));
  if (Contents.length > 0) await s3().send(new DeleteObjectsCommand({ Bucket, Delete: { Objects: Contents.map(({ Key }) => ({ Key })) } }));
  await s3().send(new DeleteBucketCommand({ Bucket }));
  await pool.end();
  await testDb.drop();
});

describe('POST /api/assets', () => {
  test('rejects a request without a session', async () => {
    expect((await upload(undefined, { name: 'a.png', bytes: png(64) })).status).toBe(401);
  });

  test('stores JPEG, PNG and WebP, taking the type from the bytes and not from the client', async () => {
    const res = await upload(
      ownerCookie,
      { name: 'a.jpg', bytes: jpeg(64), type: 'application/pdf' },
      { name: 'b.png', bytes: png(64) },
      { name: 'c.webp', bytes: webp(64), type: 'text/plain' },
    );
    expect(res.status).toBe(201);
    const { assets } = (await res.json()) as { assets: { mime: string; bytes: number }[] };
    expect(assets.map((a) => [a.mime, a.bytes])).toEqual([['image/jpeg', 64], ['image/png', 64], ['image/webp', 64]]);
  });

  test('rejects a file over 10 MB', async () => {
    const res = await upload(ownerCookie, { name: 'big.png', bytes: png(10 * 1024 * 1024 + 1) });
    expect(res.status).toBe(413);
  });

  test('accepts a file of exactly 10 MB', async () => {
    expect((await upload(ownerCookie, { name: 'edge.png', bytes: png(10 * 1024 * 1024) })).status).toBe(201);
  });

  test('rejects a file that is not an image even when it claims to be one', async () => {
    const text = new TextEncoder().encode('just some text, not a picture');
    const bytes = new Uint8Array(new ArrayBuffer(text.length));
    bytes.set(text);
    const res = await upload(ownerCookie, { name: 'fake.png', bytes, type: 'image/png' });
    expect(res.status).toBe(415);
  });

  test('rejects the whole request when one of the files is bad', async () => {
    const res = await upload(ownerCookie, { name: 'ok.png', bytes: png(64) }, { name: 'bad.gif', bytes: file([0x47, 0x49, 0x46, 0x38], 64) });
    expect(res.status).toBe(415);
  });

  test('rejects a 5th file and an empty request', async () => {
    const five = Array.from({ length: 5 }, (_, i) => ({ name: `${i}.png`, bytes: png(64) }));
    expect((await upload(ownerCookie, ...five)).status).toBe(400);
    expect((await upload(ownerCookie)).status).toBe(400);
  });
});

describe('GET /api/assets/:id/content', () => {
  const bytes = png(1000);
  let id = '';
  beforeAll(async () => {
    id = await uploadOne(ownerCookie, bytes);
  });

  test('rejects a request without a session', async () => {
    expect((await GET_CONTENT(get(`/api/assets/${id}/content`), ctx(id))).status).toBe(401);
  });

  test('streams the stored bytes back', async () => {
    const res = await GET_CONTENT(get(`/api/assets/${id}/content`, ownerCookie), ctx(id));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
    expect(res.headers.get('accept-ranges')).toBe('bytes');
    expect(res.headers.get('content-disposition')).toMatch(/^inline;/);
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(bytes);
  });

  test.each([
    ['bytes=100-199', 100, 199],
    ['bytes=900-', 900, 999],
    ['bytes=-50', 950, 999],
    ['bytes=990-5000', 990, 999],
  ])('answers Range %s with 206 and just those bytes', async (range, start, end) => {
    const res = await GET_CONTENT(get(`/api/assets/${id}/content`, ownerCookie, { range }), ctx(id));
    expect(res.status).toBe(206);
    expect(res.headers.get('content-range')).toBe(`bytes ${start}-${end}/1000`);
    expect(res.headers.get('content-length')).toBe(String(end - start + 1));
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(bytes.slice(start, end + 1));
  });

  test('answers an unsatisfiable Range with 416', async () => {
    const res = await GET_CONTENT(get(`/api/assets/${id}/content`, ownerCookie, { range: 'bytes=1000-' }), ctx(id));
    expect(res.status).toBe(416);
    expect(res.headers.get('content-range')).toBe('bytes */1000');
  });

  test('serves a download as an attachment when asked', async () => {
    const res = await GET_CONTENT(get(`/api/assets/${id}/content?download`, ownerCookie), ctx(id));
    expect(res.headers.get('content-disposition')).toMatch(/^attachment; filename="photo.png"/);
  });

  test('keeps another Member out but lets an Admin in', async () => {
    expect((await GET_CONTENT(get(`/api/assets/${id}/content`, otherCookie), ctx(id))).status).toBe(403);
    expect((await GET_CONTENT(get(`/api/assets/${id}/content`, adminCookie), ctx(id))).status).toBe(200);
  });

  test('answers 404 for an unknown asset', async () => {
    expect((await GET_CONTENT(get('/api/assets/nope/content', ownerCookie), ctx('nope'))).status).toBe(404);
  });
});

describe('GET /api/assets/:id/download', () => {
  const bytes = jpeg(500);
  let id = '';
  let otherAssetId = '';
  beforeAll(async () => {
    id = await uploadOne(ownerCookie, bytes, 'tên ảnh.jpg');
    otherAssetId = await uploadOne(ownerCookie, jpeg(10));
  });
  const download = (assetId: string, cookie?: string, token?: string) =>
    GET_DOWNLOAD(get(`/api/assets/${assetId}/download${token ? `?t=${token}` : ''}`, cookie), ctx(assetId));

  test('follows the URL from the details route and downloads the file', async () => {
    const details = await GET_DETAILS(get(`/api/assets/${id}`, ownerCookie), ctx(id));
    expect(details.status).toBe(200);
    const { downloadUrl } = (await details.json()) as { downloadUrl: string };
    const res = await GET_DOWNLOAD(get(downloadUrl, ownerCookie), ctx(id));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-disposition')).toMatch(/^attachment; filename="t_n _nh.jpg"; filename\*=UTF-8''t%C3%AAn%20%E1%BA%A3nh\.jpg$/);
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(bytes);
  });

  test('rejects a request without a session', async () => {
    expect((await download(id, undefined, signDownloadToken(id, ownerId))).status).toBe(401);
  });

  test('rejects a missing token', async () => {
    expect((await download(id, ownerCookie)).status).toBe(403);
  });

  test('rejects an expired token', async () => {
    const expired = signDownloadToken(id, ownerId, Date.now() - 6 * 60 * 1000);
    expect((await download(id, ownerCookie, expired)).status).toBe(403);
  });

  test("rejects another user's token, even for an Admin who could read the asset", async () => {
    expect((await download(id, adminCookie, signDownloadToken(id, ownerId))).status).toBe(403);
    expect((await download(id, otherCookie, signDownloadToken(id, ownerId))).status).toBe(403);
    expect((await download(id, adminCookie, signDownloadToken(id, adminId))).status).toBe(200);
  });

  test('rejects a token minted for another asset and a tampered token', async () => {
    expect((await download(id, ownerCookie, signDownloadToken(otherAssetId, ownerId))).status).toBe(403);
    const [expiry, signature = ''] =signDownloadToken(id, ownerId).split('.');
    expect((await download(id, ownerCookie, `${Number(expiry) + 60_000}.${signature}`)).status).toBe(403);
    expect((await download(id, ownerCookie, `${expiry}.${signature[0] === 'A' ? 'B' : 'A'}${signature.slice(1)}`)).status).toBe(403);
  });
});
