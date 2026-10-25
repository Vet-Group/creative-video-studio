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
const { bucketName, ensureBucket, s3 } = await import('@/lib/storage');
const { sampleBytesMatch, sampleType } = await import('@/lib/samples');
const { GET: LIST } = await import('./route');
const { GET: ONE } = await import('./[name]/route');
const { PUT, DELETE } = await import('../admin/samples/[name]/route');

const PASSWORD = 'correct-horse-battery';
const ctx = (name: string) => ({ params: Promise.resolve({ name }) });
const req = (cookie: string | undefined, init: RequestInit & { headers?: Record<string, string> } = {}) =>
  new Request('http://localhost/api/samples', { ...init, headers: { ...(cookie ? { cookie } : {}), ...(init.headers ?? {}) } });
const mp4 = (size: number) => {
  const b = new Uint8Array(size).map((_, i) => i % 251);
  b.set([0, 0, 0, 0x18, ...[...'ftypisom'].map((c) => c.charCodeAt(0))]);
  return b;
};
const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);

async function signIn(email: string): Promise<string> {
  const res = await auth.api.signInEmail({ body: { email, password: PASSWORD }, asResponse: true });
  return res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
}
let member = '';
let admin = '';

beforeAll(async () => {
  await ensureBucket();
  await auth.api.createUser({ body: { email: 'member@example.test', name: 'Member', password: PASSWORD, role: 'member' } });
  await auth.api.createUser({ body: { email: 'admin@example.test', name: 'Admin', password: PASSWORD, role: 'admin' } });
  member = await signIn('member@example.test');
  admin = await signIn('admin@example.test');
});

afterAll(async () => {
  const Bucket = bucketName();
  const { Contents = [] } = await s3().send(new ListObjectsV2Command({ Bucket }));
  if (Contents.length) await s3().send(new DeleteObjectsCommand({ Bucket, Delete: { Objects: Contents.map(({ Key }) => ({ Key: Key! })) } }));
  await s3().send(new DeleteBucketCommand({ Bucket }));
  await pool.end();
  await testDb.drop();
});

describe('sample names and bytes', () => {
  test('accepts lower-case dashed names with a known extension only', () => {
    expect(['example-3.mp4', 'app-card-reframe.webp', 'x.jpg', 'a1.png'].map(sampleType)).toEqual(['video/mp4', 'image/webp', 'image/jpeg', 'image/png']);
    expect(['../x.mp4', 'Example.mp4', 'a_b.jpg', 'a.gif', 'a.mp4.exe', '-a.mp4', 'a--b.mp4'].map(sampleType)).toEqual(Array(7).fill(null));
  });
  test('checks the magic bytes against the type', () => {
    expect([sampleBytesMatch('video/mp4', mp4(32)), sampleBytesMatch('image/jpeg', jpeg), sampleBytesMatch('image/png', jpeg), sampleBytesMatch('video/mp4', jpeg)]).toEqual([true, true, false, false]);
  });
});

describe('/api/samples', () => {
  test('only an Admin uploads, a Member reads with ranges, and a delete brings back the fallback; each change audited', async () => {
    const body = mp4(5000);
    expect((await PUT(req(member, { method: 'PUT', body }), ctx('example-1.mp4'))).status).toBe(403);
    expect((await PUT(req(undefined, { method: 'PUT', body }), ctx('example-1.mp4'))).status).toBe(401);
    expect((await PUT(req(admin, { method: 'PUT', body }), ctx('../x.mp4'))).status).toBe(400);
    expect((await PUT(req(admin, { method: 'PUT', body: jpeg }), ctx('example-1.mp4'))).status).toBe(400);
    expect((await PUT(req(admin, { method: 'PUT', body }), ctx('example-1.mp4'))).status).toBe(201);
    expect((await PUT(req(admin, { method: 'PUT', body: jpeg }), ctx('poster-1.jpg'))).status).toBe(201);
    expect((await PUT(req(admin, { method: 'PUT', body: mp4(6000) }), ctx('example-1.mp4'))).status).toBe(200);

    expect((await LIST(req(undefined))).status).toBe(401);
    expect(await (await LIST(req(member))).json()).toEqual({ samples: [{ name: 'example-1.mp4', bytes: 6000 }, { name: 'poster-1.jpg', bytes: 8 }] });

    expect((await ONE(req(undefined), ctx('example-1.mp4'))).status).toBe(401);
    const full = await ONE(req(member), ctx('example-1.mp4'));
    expect([full.status, full.headers.get('content-type'), (await full.arrayBuffer()).byteLength]).toEqual([200, 'video/mp4', 6000]);
    const part = await ONE(req(member, { headers: { range: 'bytes=4-11' } }), ctx('example-1.mp4'));
    expect([part.status, part.headers.get('content-range'), new TextDecoder().decode(await part.arrayBuffer())]).toEqual([206, 'bytes 4-11/6000', 'ftypisom']);
    expect((await ONE(req(member), ctx('missing.mp4'))).status).toBe(404);

    expect((await DELETE(req(member, { method: 'DELETE' }), ctx('poster-1.jpg'))).status).toBe(403);
    expect((await DELETE(req(admin, { method: 'DELETE' }), ctx('poster-1.jpg'))).status).toBe(204);
    expect((await ONE(req(member), ctx('poster-1.jpg'))).status).toBe(404);
    const log = (await pool.query(`select action, target, old_value, new_value from audit_entries where action like 'sample.%' order by id`)).rows;
    expect(log).toEqual([
      { action: 'sample.put', target: 'sample:example-1.mp4', old_value: null, new_value: { bytes: 5000 } },
      { action: 'sample.put', target: 'sample:poster-1.jpg', old_value: null, new_value: { bytes: 8 } },
      { action: 'sample.put', target: 'sample:example-1.mp4', old_value: { bytes: 5000 }, new_value: { bytes: 6000 } },
      { action: 'sample.delete', target: 'sample:poster-1.jpg', old_value: { bytes: 8 }, new_value: null },
    ]);
  });
});
