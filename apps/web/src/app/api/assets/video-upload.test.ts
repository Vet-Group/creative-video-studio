// Direct-to-R2 reference-video upload (the /analyze page): the presign and finalize routes, the flag gate, the fallback when
// R2 is not configured, and the check that a finalized object is really a video within the cap. Storage is mocked (no R2
// network); the database is the compose Postgres.
import { randomBytes, randomUUID } from 'node:crypto';
import { createTestDatabase } from '@cvs/db/testing';
import { afterAll, beforeAll, beforeEach, expect, test, vi } from 'vitest';

// A minimal header the sniffer reads as MP4: an `ftyp` box tag at offset 4, no `moov` so the duration is unknown (allowed here).
const headBytes = new Uint8Array(32);
headBytes.set([0x66, 0x74, 0x79, 0x70], 4);

vi.mock('@/lib/storage', async (orig) => {
  const actual = await (orig as () => Promise<typeof import('@/lib/storage')>)();
  return {
    ...actual,
    presignR2Put: vi.fn(async (k: string) => `https://r2.example/${k}?sig=x`),
    headObject: vi.fn(async () => ({ size: 1000 })),
    getRange: vi.fn(async () => headBytes),
    deleteObject: vi.fn(async () => {}),
  };
});

const testDb = await createTestDatabase();
process.env.DATABASE_URL = testDb.url;
process.env.BETTER_AUTH_SECRET = randomBytes(32).toString('hex');
process.env.APP_URL = 'http://localhost';
process.env.S3_BUCKET = `cvs-test-${randomBytes(6).toString('hex')}`;
process.env.REA_ANALYZE_ENABLED = '1';
process.env.R2_ENDPOINT = 'https://acc.r2.cloudflarestorage.com';
process.env.R2_ACCESS_KEY_ID = 'k';
process.env.R2_SECRET_ACCESS_KEY = 's';
process.env.R2_BUCKET = 'cvs-uploads-test';

const { auth, pool } = await import('@/lib/auth');
const storage = await import('@/lib/storage');
const { POST: PRESIGN } = await import('./presign-video/route');
const { POST: FINALIZE } = await import('./finalize-video/route');

const PASSWORD = 'correct-horse-battery';
let cookie = '';
let userId = '';
const req = (path: string, body: unknown) => new Request(`http://localhost${path}`, { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify(body) });
const presign = (b: unknown) => PRESIGN(req('/api/assets/presign-video', b));
const finalize = (b: unknown) => FINALIZE(req('/api/assets/finalize-video', b));

beforeAll(async () => {
  const { user } = await auth.api.createUser({ body: { email: 'm@example.test', name: 'M', password: PASSWORD, role: 'member' } });
  userId = user.id;
  const res = await auth.api.signInEmail({ body: { email: 'm@example.test', password: PASSWORD }, asResponse: true });
  cookie = res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
  await pool.query(`insert into stores (id, name, code) values ('store-hidden', 'Gone', 'SGONE')`);
  await pool.query(`update stores set hidden = true where id = 'store-hidden'`);
});
beforeEach(() => {
  vi.mocked(storage.headObject).mockResolvedValue({ size: 1000 });
  vi.mocked(storage.getRange).mockResolvedValue(headBytes);
  vi.mocked(storage.deleteObject).mockClear();
});
afterAll(async () => {
  await pool.end();
  await testDb.drop();
});

test('both routes 404 while the analyze flag is off', async () => {
  const prev = process.env.REA_ANALYZE_ENABLED;
  delete process.env.REA_ANALYZE_ENABLED;
  try {
    expect((await presign({ contentType: 'video/mp4', size: 1000 })).status).toBe(404);
    expect((await finalize({ assetId: randomUUID() })).status).toBe(404);
  } finally {
    process.env.REA_ANALYZE_ENABLED = prev;
  }
});

test('presign returns an id and a PUT url for a valid video', async () => {
  const res = await presign({ contentType: 'video/mp4', size: 5_000_000 });
  expect(res.status).toBe(200);
  const b = (await res.json()) as { assetId: string; url: string; key: string };
  expect(b.assetId).toMatch(/^[0-9a-f-]{36}$/);
  expect(b.url).toContain('https://r2.example/assets/');
  expect(b.key).toBe(`r2:assets/${b.assetId}`);
});

test('presign refuses a non-video type and an over-size file', async () => {
  expect((await presign({ contentType: 'image/png', size: 10 })).status).toBe(400);
  expect((await presign({ contentType: 'video/mp4', size: 10 ** 12 })).status).toBe(413);
});

test('presign tells the browser to fall back when R2 is not configured', async () => {
  const prev = process.env.R2_ENDPOINT;
  delete process.env.R2_ENDPOINT;
  try {
    const b = await (await presign({ contentType: 'video/mp4', size: 1000 })).json();
    expect(b).toEqual({ fallback: true });
  } finally {
    process.env.R2_ENDPOINT = prev;
  }
});

test('finalize records the R2 video as the caller’s input and is idempotent', async () => {
  const id = randomUUID();
  const res = await finalize({ assetId: id, filename: 'ref.mp4' });
  expect(res.status).toBe(200);
  const { asset } = (await res.json()) as { asset: { id: string; filename: string; durationMs: number | null; bytes: number } };
  expect(asset).toEqual({ id, filename: 'ref.mp4', durationMs: null, bytes: 1000 });
  const row = (await pool.query('select owner_id, kind, s3_key, mime, bytes from assets where id = $1', [id])).rows[0];
  expect(row).toEqual({ owner_id: userId, kind: 'input', s3_key: `r2:assets/${id}`, mime: 'video/mp4', bytes: 1000 });
  const again = (await (await finalize({ assetId: id, filename: 'other.mp4' })).json()) as { asset: { id: string } };
  expect(again.asset.id).toBe(id); // the repeat returns the same row, no second insert
});

test('finalize deletes the object and refuses a non-video, and 409s when it is missing', async () => {
  vi.mocked(storage.getRange).mockResolvedValue(new Uint8Array(32)); // no ftyp box
  const id = randomUUID();
  expect((await finalize({ assetId: id })).status).toBe(415);
  expect(vi.mocked(storage.deleteObject)).toHaveBeenCalledWith(`r2:assets/${id}`);
  vi.mocked(storage.headObject).mockRejectedValue(new Error('not found'));
  expect((await finalize({ assetId: randomUUID() })).status).toBe(409);
});

test('finalize rejects a bad assetId and a hidden store', async () => {
  expect((await finalize({ assetId: 'not-a-uuid' })).status).toBe(400);
  expect((await finalize({ assetId: randomUUID(), storeId: 'store-hidden' })).status).toBe(400);
});
