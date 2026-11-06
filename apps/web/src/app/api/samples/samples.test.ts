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
const { POST: COPY, COPY_HOURLY_LIMIT } = await import('../assets/samples/route');

const PASSWORD = 'correct-horse-battery';
const ctx = (name: string) => ({ params: Promise.resolve({ name }) });
const req = (cookie: string | undefined, init: RequestInit & { headers?: Record<string, string> } = {}) =>
  new Request('http://localhost/api/samples', { ...init, headers: { ...(cookie ? { cookie } : {}), ...(init.headers ?? {}) } });
const mp4 = (size: number) => {
  const b = new Uint8Array(size).map((_, i) => i % 251);
  b.set([0, 0, 0, 0x18, ...[...'ftypisom'].map((c) => c.charCodeAt(0))]);
  return b;
};
/** An MP4 whose header gives its length: ftyp, moov holding an mvhd (version 0, timescale 1000) of `ms`, then an mdat (as the assets route test builds one). */
const clip = (ms: number, size = 64) => {
  const bytes = new Uint8Array(size);
  const v = new DataView(bytes.buffer);
  const box = (at: number, len: number, type: string) => (v.setUint32(at, len), [...type].forEach((c, i) => (bytes[at + 4 + i] = c.charCodeAt(0))));
  box(0, 16, 'ftyp');
  [...'isom'].forEach((c, i) => (bytes[8 + i] = c.charCodeAt(0)));
  box(16, 36, 'moov');
  box(24, 28, 'mvhd');
  v.setUint32(44, 1000);
  v.setUint32(48, ms);
  box(52, size - 52, 'mdat');
  return bytes;
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
    expect(['example-3.mp4', 'app-card-reframe.webp', 'x.jpg', 'a1.png', 'marketing-example-1.json'].map(sampleType)).toEqual(['video/mp4', 'image/webp', 'image/jpeg', 'image/png', 'application/json']);
    expect(['../x.mp4', 'Example.mp4', 'a_b.jpg', 'a.gif', 'a.mp4.exe', '-a.mp4', 'a--b.mp4'].map(sampleType)).toEqual(Array(7).fill(null));
  });
  test('checks the magic bytes against the type', () => {
    expect([sampleBytesMatch('video/mp4', mp4(32)), sampleBytesMatch('image/jpeg', jpeg), sampleBytesMatch('image/png', jpeg), sampleBytesMatch('video/mp4', jpeg)]).toEqual([true, true, false, false]);
    const text = (s: string) => new TextEncoder().encode(s);
    expect(['{"brief":"x"}', '[1]', 'null', '{"a":', ''].map((s) => sampleBytesMatch('application/json', text(s)))).toEqual([true, false, false, false, false]);
    expect(sampleBytesMatch('application/json', jpeg)).toBe(false);
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
    const version = expect.stringMatching(/^[0-9a-f-]+$/); // the store's ETag, without its quotes
    expect(await (await LIST(req(member))).json()).toEqual({ samples: [{ name: 'example-1.mp4', bytes: 6000, version }, { name: 'poster-1.jpg', bytes: 8, version }] });

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

describe('sample caching', () => {
  test('a sample is cached for an hour with its ETag, an unchanged one answers 304, a replaced one comes anew', async () => {
    const put = (body: Uint8Array<ArrayBuffer>) => PUT(req(admin, { method: 'PUT', body, headers: { 'content-type': 'image/jpeg' } }), ctx('cache-test.jpg'));
    expect((await put(jpeg)).ok).toBe(true);
    const first = await ONE(req(member), ctx('cache-test.jpg'));
    expect(first.status).toBe(200);
    expect(first.headers.get('cache-control')).toBe('private, max-age=3600');
    const etag = first.headers.get('etag');
    expect(etag).toBeTruthy();
    const again = await ONE(req(member, { headers: { 'if-none-match': etag! } }), ctx('cache-test.jpg'));
    expect(again.status).toBe(304);
    expect(await again.text()).toBe('');
    expect((await put(new Uint8Array([...jpeg, 9, 9]))).ok).toBe(true);
    const replaced = await ONE(req(member, { headers: { 'if-none-match': etag! } }), ctx('cache-test.jpg'));
    expect(replaced.status).toBe(200);
    expect(replaced.headers.get('etag')).not.toBe(etag);
    expect((await ONE(req(undefined, { headers: { 'if-none-match': etag! } }), ctx('cache-test.jpg'))).status).toBe(401); // the ETag is no way around sign-in
  });
});

describe('POST /api/assets/samples', () => {
  const copy = (cookie: string | undefined, body: unknown) => COPY(new Request('http://localhost/api/assets/samples', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) } }));
  test('copies sample pictures into the caller own input assets on the server, all or nothing', async () => {
    for (const [name, type, body] of [['copy-a.jpg', 'image/jpeg', jpeg], ['copy-b.jpg', 'image/jpeg', new Uint8Array([...jpeg, 7])], ['copy-clip.mp4', 'video/mp4', clip(7400)], ['copy-bad.mp4', 'video/mp4', mp4(64)]] as const) {
      expect((await PUT(req(admin, { method: 'PUT', body, headers: { 'content-type': type } }), ctx(name))).ok, name).toBe(true);
    }
    expect((await copy(undefined, { names: ['copy-a.jpg'] })).status).toBe(401);
    for (const names of [undefined, [], ['copy-a.jpg', 'copy-a.jpg', 'copy-a.jpg', 'copy-a.jpg', 'copy-a.jpg'], ['copy-notes.json'], ['../copy-a.jpg'], [1], ['copy-clip.mp4', 'copy-clip.mp4'], ['copy-clip.mp4', 'copy-bad.mp4'], ['copy-a.jpg', 'copy-clip.mp4', 'copy-bad.mp4']]) {
      expect((await copy(member, { names })).status, JSON.stringify(names)).toBe(400);
    }
    expect((await copy(member, { names: ['copy-a.jpg', 'no-such.jpg'] })).status).toBe(404);
    expect((await copy(member, { names: ['copy-bad.mp4'] })).status).toBe(415); // a clip needs a length in its header
    const before = (await pool.query('select count(*)::int as n from assets')).rows[0].n;

    const res = await copy(member, { names: ['copy-a.jpg', 'copy-b.jpg'] });
    expect(res.status).toBe(201);
    const { assets } = (await res.json()) as { assets: { id: string; filename: string; mime: string; bytes: number }[] };
    expect(assets.map((a) => [a.filename, a.mime, a.bytes])).toEqual([['copy-a.jpg', 'image/jpeg', jpeg.length], ['copy-b.jpg', 'image/jpeg', jpeg.length + 1]]);
    const rows = (await pool.query(`select a.id, a.kind, a.s3_key, u.email from assets a join users u on u.id = a.owner_id where a.id = any($1) order by a.filename`, [assets.map((a) => a.id)])).rows;
    expect(rows.map((r) => [r.kind, r.s3_key, r.email])).toEqual(assets.map((a) => ['input', `assets/${a.id}`, 'member@example.test']));
    expect((await pool.query('select count(*)::int as n from assets')).rows[0].n).toBe(before + 2);

    // A sample the caller already copied comes back as that copy, taking the slot it is copied into; a repeat in one request is stored once.
    const again = await copy(member, { names: ['copy-a.jpg', 'copy-a.jpg'], slot: 'garment' });
    expect(((await again.json()) as { assets: { id: string }[] }).assets.map((a) => a.id)).toEqual([assets[0]!.id, assets[0]!.id]);
    expect((await pool.query('select count(*)::int as n from assets')).rows[0].n).toBe(before + 2);
    expect((await pool.query('select slot from assets where id = $1', [assets[0]!.id])).rows[0].slot).toBe('garment');

    // A sample clip is copied as an MP4 input with its length (Advanced's reference video).
    const video = await copy(member, { names: ['copy-clip.mp4'] });
    expect(video.status).toBe(201);
    const [copied] = ((await video.json()) as { assets: { id: string; mime: string; durationMs: number }[] }).assets;
    expect([copied!.mime, copied!.durationMs]).toEqual(['video/mp4', 7400]);
    expect((await pool.query('select kind, duration_ms from assets where id = $1', [copied!.id])).rows[0]).toEqual({ kind: 'input', duration_ms: 7400 });
  });

  test('stops a caller who added the hourly limit of pictures in the last hour, counting older ones out', async () => {
    await auth.api.createUser({ body: { email: 'busy@example.test', name: 'Busy', password: PASSWORD, role: 'member' } });
    const busy = await signIn('busy@example.test');
    const add = (count: number, age: string) =>
      pool.query(
        `insert into assets (id, owner_id, kind, s3_key, filename, mime, bytes, created_at)
           select g || '-' || $3, u.id, 'input', 'busy/' || g || '-' || $3, 'x.jpg', 'image/jpeg', 1, now() - $2::interval
           from users u, generate_series(1, $1) g where u.email = 'busy@example.test'`,
        [count, age, age.replace(' ', '')],
      );
    await add(COPY_HOURLY_LIMIT, '2 hours'); // older than the hour: not counted
    await add(COPY_HOURLY_LIMIT - 2, '1 minute');
    await add(5, '30 seconds');
    await pool.query(`update assets set kind = 'output' where id like '%-30seconds'`); // results are not new pictures
    expect((await copy(busy, { names: ['copy-a.jpg', 'copy-b.jpg', 'copy-a.jpg', 'copy-b.jpg'] })).status).toBe(429); // 198 + 4 would pass the limit
    expect((await copy(busy, { names: ['copy-a.jpg', 'copy-b.jpg'] })).status).toBe(201); // 198 + 2 is the limit itself
    const res = await copy(busy, { names: ['copy-a.jpg'] });
    expect(res.status).toBe(429);
    expect((await res.json()).error).toMatch(/hour/);
    expect((await copy(member, { names: ['copy-a.jpg'] })).status).toBe(201); // another member is not held back
  });
});
