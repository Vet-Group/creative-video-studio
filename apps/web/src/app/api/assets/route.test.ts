// Integration test against a disposable database and bucket on the compose Postgres and MinIO (`pnpm services:up`).
import { createHash, randomBytes } from 'node:crypto';
import { DeleteBucketCommand, DeleteObjectsCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { createTestDatabase } from '@cvs/db/testing';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

const testDb = await createTestDatabase();
process.env.DATABASE_URL = testDb.url;
process.env.BETTER_AUTH_SECRET = randomBytes(32).toString('hex');
process.env.APP_URL = 'http://localhost';
process.env.S3_BUCKET = `cvs-test-${randomBytes(6).toString('hex')}`;

const { auth, pool } = await import('@/lib/auth');
const { MAX_BODY, MAX_JSON_BYTES, readJson } = await import('@/lib/assets');
const { signDownloadToken } = await import('@/lib/download-token');
const { bucketName, ensureBucket, s3 } = await import('@/lib/storage');
const { POST, UPLOAD_HOURLY_LIMIT, UPLOADS_LIMIT } = await import('./route');
const { GET: GET_DETAILS } = await import('./[id]/route');
const { GET: GET_CONTENT } = await import('./[id]/content/route');
const { GET: GET_DOWNLOAD } = await import('./[id]/download/route');
const { GET: GET_THUMB } = await import('./[id]/thumb/route');
const { default: sharp } = await import('sharp');

const PASSWORD = 'correct-horse-battery';
const BASE = 'http://localhost/api/assets';
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

let made = 0;
/**
 * `size` bytes that start with `magic` and then count 0..250 over and over, so any slice is recognisable. The last four bytes number the call, so two files
 * are never the same bytes (an upload of a file the caller already has returns that one).
 */
function file(magic: number[], size: number): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(new ArrayBuffer(size));
  bytes.forEach((_, i) => (bytes[i] = magic[i] ?? i % 251));
  if (size >= magic.length + 4) new DataView(bytes.buffer).setUint32(size - 4, ++made);
  return bytes;
}
const png = (size: number) => file([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], size);
const jpeg = (size: number) => file([0xff, 0xd8, 0xff, 0xe0], size);
const webp = (size: number) => file([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50], size);
/** An MP4 (or MOV with brand `qt  `) of `size` bytes: ftyp, moov holding an mvhd (version 0, timescale 1000) of `ms`, then an mdat filling the rest. */
function mp4(ms: number, size = 64, brand = 'isom'): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(new ArrayBuffer(size));
  const v = new DataView(bytes.buffer);
  const box = (at: number, len: number, type: string) => (v.setUint32(at, len), [...type].forEach((c, i) => (bytes[at + 4 + i] = c.charCodeAt(0))));
  box(0, 16, 'ftyp');
  [...brand].forEach((c, i) => (bytes[8 + i] = c.charCodeAt(0)));
  box(16, 36, 'moov');
  box(24, 28, 'mvhd');
  v.setUint32(44, 1000);
  v.setUint32(48, ms);
  box(52, size - 52, 'mdat');
  return bytes;
}

const ascii = (bytes: Uint8Array, at: number, text: string) => [...text].forEach((c, i) => (bytes[at + i] = c.charCodeAt(0)));
/** A WAV of `ms` at 8 kHz, 8-bit mono (8 bytes a millisecond): RIFF, a 16-byte fmt chunk and the data chunk; `data` false leaves the data chunk out. */
function wav(ms: number, data = true): Uint8Array<ArrayBuffer> {
  const size = ms * 8;
  const bytes = new Uint8Array(new ArrayBuffer(36 + (data ? 8 + size : 0)));
  const v = new DataView(bytes.buffer);
  ascii(bytes, 0, 'RIFF');
  v.setUint32(4, bytes.length - 8, true);
  ascii(bytes, 8, 'WAVEfmt ');
  [v.setUint32(16, 16, true), v.setUint16(20, 1, true), v.setUint16(22, 1, true), v.setUint32(24, 8000, true), v.setUint32(28, 8000, true), v.setUint16(32, 1, true), v.setUint16(34, 8, true)];
  if (data) (ascii(bytes, 36, 'data'), v.setUint32(40, size, true));
  return bytes;
}
/** An MP3 at 128 kbps (16 bytes a millisecond) of `ms` after an empty ID3v2 tag, starting with an MPEG 1 Layer III frame header; `xing` writes a Xing header with that frame count. */
function mp3(ms: number, xing?: number): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(new ArrayBuffer(10 + ms * 16));
  ascii(bytes, 0, 'ID3');
  bytes[3] = 4;
  bytes.set([0xff, 0xfb, 0x90, 0x64], 10); // 128 kbps, 44.1 kHz, joint stereo, so the Xing header sits 32 bytes after the frame header
  if (xing !== undefined) (ascii(bytes, 46, 'Xing'), new DataView(bytes.buffer).setUint32(50, 1), new DataView(bytes.buffer).setUint32(54, xing));
  return bytes;
}

const get = (path: string, cookie?: string, headers: Record<string, string> = {}) =>
  new Request(`http://localhost${path}`, { headers: { ...(cookie ? { cookie } : {}), ...headers } });

function upload(cookie: string | undefined, ...files: { name: string; bytes: Uint8Array<ArrayBuffer>; type?: string; storeId?: string; slot?: string }[]) {
  const form = new FormData();
  for (const f of files) form.append('file', new File([f.bytes], f.name, { type: f.type ?? 'application/octet-stream' }));
  if (files[0]?.storeId !== undefined) form.append('storeId', files[0].storeId);
  if (files[0]?.slot !== undefined) form.append('slot', files[0].slot);
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

async function objectKeys(): Promise<string[]> {
  const { Contents = [] } = await s3().send(new ListObjectsV2Command({ Bucket: bucketName() }));
  return Contents.flatMap(({ Key }) => (Key ? [Key] : []));
}

async function assetCount(): Promise<number> {
  return Number((await pool.query('select count(*) from assets')).rows[0].count);
}

afterAll(async () => {
  const Bucket = bucketName();
  const keys = await objectKeys();
  if (keys.length > 0) await s3().send(new DeleteObjectsCommand({ Bucket, Delete: { Objects: keys.map((Key) => ({ Key })) } }));
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

  test('stores an MP4 or MOV reference video of up to 20 MB with its length from the movie header', async () => {
    const res = await upload(ownerCookie, { name: 'dance.mp4', bytes: mp4(5400) }, { name: 'walk.mov', bytes: mp4(12_000, 64, 'qt  ') });
    expect(res.status).toBe(201);
    const { assets } = (await res.json()) as { assets: { id: string; mime: string; durationMs: number | null }[] };
    expect(assets.map((a) => [a.mime, a.durationMs])).toEqual([['video/mp4', 5400], ['video/quicktime', 12_000]]);
    expect((await pool.query('select duration_ms from assets where id = $1', [assets[0]!.id])).rows[0].duration_ms).toBe(5400);
    expect((await upload(ownerCookie, { name: 'edge.mp4', bytes: mp4(3000, 20 * 1024 * 1024) })).status).toBe(201);
    expect((await upload(ownerCookie, { name: 'big.mp4', bytes: mp4(3000, 20 * 1024 * 1024 + 1) })).status).toBe(413);
  });

  test('stores an MP3 or WAV clip of up to 15 MB with its length from its header', async () => {
    const res = await upload(ownerCookie, { name: 'voice.wav', bytes: wav(2500) }, { name: 'song.mp3', bytes: mp3(3000) }, { name: 'vbr.mp3', bytes: mp3(100, 100) });
    expect(res.status).toBe(201);
    const { assets } = (await res.json()) as { assets: { mime: string; durationMs: number | null }[] };
    // 100 frames of 1,152 samples at 44.1 kHz is 2,612 ms, whatever the file's size says.
    expect(assets.map((a) => [a.mime, a.durationMs])).toEqual([['audio/wav', 2500], ['audio/mpeg', 3000], ['audio/mpeg', 2612]]);
    const edge = 15 * 1024 * 1024;
    expect((await upload(ownerCookie, { name: 'long.mp3', bytes: mp3(Math.floor((edge - 10) / 16)) })).status).toBe(201); // past the 10 MB of an image
    expect((await upload(ownerCookie, { name: 'big.mp3', bytes: mp3(Math.ceil((edge - 9) / 16)) })).status).toBe(413);
  });

  test('rejects a clip whose header gives no length', async () => {
    expect((await upload(ownerCookie, { name: 'empty.wav', bytes: wav(0, false) })).status).toBe(415);
  });

  test('rejects a video whose header gives no length', async () => {
    const bytes = mp4(0);
    expect((await upload(ownerCookie, { name: 'empty.mp4', bytes })).status).toBe(415);
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

  test('rejects the whole request when one of the files is bad, storing nothing', async () => {
    const [rows, keys] = [await assetCount(), await objectKeys()];
    const res = await upload(ownerCookie, { name: 'ok.png', bytes: png(64) }, { name: 'bad.gif', bytes: file([0x47, 0x49, 0x46, 0x38], 64) });
    expect(res.status).toBe(415);
    expect(await assetCount()).toBe(rows);
    expect((await objectKeys()).sort()).toEqual(keys.sort());
  });

  test('stops a member who added the hourly limit of new files, counting older ones out', async () => {
    const busyId = (await auth.api.createUser({ body: { email: 'hourly@example.test', name: 'Hourly', password: PASSWORD, role: 'member' } })).user.id;
    const busy = await signIn('hourly@example.test');
    const add = (count: number, age: string) =>
      pool.query(
        `insert into assets (id, owner_id, kind, s3_key, filename, mime, bytes, created_at) select 'up-' || g || '-' || replace($2, ' ', ''), $3::text, 'input', 'up/' || g || '-' || $2, 'x.jpg', 'image/jpeg', 1, now() - $2::interval from generate_series(1, $1) g`,
        [count, age, busyId],
      );
    await add(UPLOAD_HOURLY_LIMIT, '2 hours'); // older than the hour: not counted
    await add(UPLOAD_HOURLY_LIMIT - 1, '1 minute');
    expect((await upload(busy, { name: 'a.png', bytes: png(64) })).status).toBe(201); // the 100th
    const res = await upload(busy, { name: 'b.png', bytes: png(64) });
    expect(res.status).toBe(429);
    expect(((await res.json()) as { error: string }).error).toMatch(/giờ/);
  });

  test('reads a JSON body up to MAX_JSON_BYTES and nothing past it, even without content-length', async () => {
    const post = (body: BodyInit, headers: Record<string, string> = {}) => new Request(BASE, { method: 'POST', body, headers, duplex: 'half' } as RequestInit);
    expect(await readJson(post(JSON.stringify({ a: 1 })))).toEqual({ a: 1 });
    expect(await readJson(post('not json'))).toBeNull();
    expect(await readJson(post('{}', { 'content-length': String(MAX_JSON_BYTES + 1) }))).toBeNull();
    const chunked = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(new TextEncoder().encode(`{"a":"${'x'.repeat(MAX_JSON_BYTES)}"}`));
        c.close();
      },
    });
    expect(await readJson(post(chunked))).toBeNull();
  });

  test('rejects a 5th file and an empty request', async () => {
    const five = Array.from({ length: 5 }, (_, i) => ({ name: `${i}.png`, bytes: png(64) }));
    expect((await upload(ownerCookie, ...five)).status).toBe(400);
    expect((await upload(ownerCookie)).status).toBe(400);
  });

  test('answers 413 at once when content-length is past the body limit', async () => {
    const form = new FormData();
    form.append('file', new File([png(64)], 'a.png'));
    const res = await POST(new Request(BASE, { method: 'POST', body: form, headers: { cookie: ownerCookie, 'content-length': String(MAX_BODY + 1) } }));
    expect(res.status).toBe(413);
  });

  test('answers 413 for a streamed body past the limit, without a content-length to trust', async () => {
    const chunk = new Uint8Array(new ArrayBuffer(1024 * 1024));
    let sent = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (sent === 0) controller.enqueue(new TextEncoder().encode('--b\r\nContent-Disposition: form-data; name="file"; filename="a.png"\r\n\r\n'));
        controller.enqueue(chunk);
        sent += chunk.length;
        if (sent > MAX_BODY * 2) controller.close();
      },
    });
    const req = new Request(BASE, { method: 'POST', body, duplex: 'half', headers: { cookie: ownerCookie, 'content-type': 'multipart/form-data; boundary=b' } } as RequestInit);
    expect(req.headers.get('content-length')).toBeNull();
    expect((await POST(req)).status).toBe(413);
    expect(sent).toBeLessThan(MAX_BODY * 2); // the stream was cut off, not read to the end
  });

  test('answers 400 for a body that is not multipart', async () => {
    const res = await POST(new Request(BASE, { method: 'POST', body: 'hello', headers: { cookie: ownerCookie, 'content-type': 'text/plain' } }));
    expect(res.status).toBe(400);
  });

  test('keeps at most 255 characters of the file name and its extension', async () => {
    const res = await upload(ownerCookie, { name: `${'a'.repeat(300)}.png`, bytes: png(64) }, { name: 'b'.repeat(300), bytes: png(64) });
    expect(res.status).toBe(201);
    const { assets } = (await res.json()) as { assets: [{ filename: string }, { filename: string }] };
    expect(assets[0].filename).toBe(`${'a'.repeat(251)}.png`);
    expect(assets[1].filename).toBe('b'.repeat(255));
  });

  test('removes the objects it stored when saving the rows fails', async () => {
    const keys = await objectKeys();
    await pool.query(`alter table assets add constraint assets_poison check (filename <> 'poison.png')`);
    try {
      await expect(upload(ownerCookie, { name: 'poison.png', bytes: png(64) })).rejects.toThrow();
    } finally {
      await pool.query('alter table assets drop constraint assets_poison');
    }
    expect((await objectKeys()).sort()).toEqual(keys.sort());
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
    expect(res.headers.get('cache-control')).toBe('private, max-age=86400'); // a day: the bytes never change under an id, but a browser should not hold a deleted clip for a year
    expect(res.headers.get('etag')).toBe(`"${id}"`);
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(bytes);
  });

  test('after a day the browser asks with the ETag: the owner gets a 304 without a byte, anyone else still a refusal', async () => {
    const again = await GET_CONTENT(get(`/api/assets/${id}/content`, ownerCookie, { 'if-none-match': `"${id}"` }), ctx(id));
    expect(again.status).toBe(304);
    expect(again.headers.get('etag')).toBe(`"${id}"`);
    expect(again.headers.get('cache-control')).toBe('private, max-age=86400');
    expect((await again.arrayBuffer()).byteLength).toBe(0);
    expect((await GET_CONTENT(get(`/api/assets/${id}/content`, ownerCookie, { 'if-none-match': `"x", W/"${id}"` }), ctx(id))).status).toBe(304); // weak, in a list
    expect((await GET_CONTENT(get(`/api/assets/${id}/content`, ownerCookie, { 'if-none-match': '"another"' }), ctx(id))).status).toBe(200);
    expect((await GET_CONTENT(get(`/api/assets/${id}/content`, otherCookie, { 'if-none-match': `"${id}"` }), ctx(id))).status).toBe(403);
    expect((await GET_CONTENT(get(`/api/assets/${id}/content`, undefined, { 'if-none-match': `"${id}"` }), ctx(id))).status).toBe(401);
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

  test('ignores an inverted Range and serves the whole file', async () => {
    const res = await GET_CONTENT(get(`/api/assets/${id}/content`, ownerCookie, { range: 'bytes=5-3' }), ctx(id));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-range')).toBeNull();
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(bytes);
  });

  test('serves a download as an attachment when asked', async () => {
    const res = await GET_CONTENT(get(`/api/assets/${id}/content?download`, ownerCookie), ctx(id));
    expect(res.status).toBe(200);
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

describe('GET /api/assets/:id/thumb', () => {
  let id = '';
  beforeAll(async () => {
    const big = await sharp({ create: { width: 1600, height: 800, channels: 4, background: { r: 200, g: 0, b: 0, alpha: 0.5 } } }).png().toBuffer();
    id = await uploadOne(ownerCookie, new Uint8Array(big), 'wide.png');
  });

  test('makes an upright JPEG no larger than 512 px on first use, keeps it, then serves the kept one', async () => {
    const res = await GET_THUMB(get(`/api/assets/${id}/thumb`, ownerCookie), ctx(id));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/jpeg');
    expect(res.headers.get('cache-control')).toBe('private, max-age=86400');
    expect(res.headers.get('etag')).toBe(`"${id}-thumb"`);
    const body = new Uint8Array(await res.arrayBuffer());
    expect(await sharp(body).metadata()).toMatchObject({ format: 'jpeg', width: 512, height: 256 });
    expect(await objectKeys()).toContain(`thumbs/${id}`);
    const again = await GET_THUMB(get(`/api/assets/${id}/thumb`, ownerCookie), ctx(id));
    expect(new Uint8Array(await again.arrayBuffer())).toEqual(body);
    expect((await GET_THUMB(get(`/api/assets/${id}/thumb`, ownerCookie, { 'if-none-match': `"${id}-thumb"` }), ctx(id))).status).toBe(304);
  });

  test('?w=1600 makes a separate WebP preview kept under its own key, keeps the alpha, never enlarges, and leaves the default thumbnail alone', async () => {
    const res = await GET_THUMB(get(`/api/assets/${id}/thumb?w=1600`, ownerCookie), ctx(id));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/webp');
    expect(res.headers.get('etag')).toBe(`"${id}-thumb-1600"`);
    const body = new Uint8Array(await res.arrayBuffer());
    expect(await sharp(body).metadata()).toMatchObject({ format: 'webp', width: 1600, height: 800, hasAlpha: true });
    expect(await objectKeys()).toEqual(expect.arrayContaining([`thumbs/${id}-1600`]));
    expect(new Uint8Array(await (await GET_THUMB(get(`/api/assets/${id}/thumb?w=1600`, ownerCookie), ctx(id))).arrayBuffer())).toEqual(body);
    expect((await GET_THUMB(get(`/api/assets/${id}/thumb?w=1600`, ownerCookie, { 'if-none-match': `"${id}-thumb"` }), ctx(id))).status).toBe(200); // the tile's tag is not the preview's
    expect((await GET_THUMB(get(`/api/assets/${id}/thumb?w=1600`, ownerCookie, { 'if-none-match': `"${id}-thumb-1600"` }), ctx(id))).status).toBe(304);
    const tile = await GET_THUMB(get(`/api/assets/${id}/thumb`, ownerCookie), ctx(id));
    expect(tile.headers.get('content-type')).toBe('image/jpeg');
    expect(await sharp(new Uint8Array(await tile.arrayBuffer())).metadata()).toMatchObject({ format: 'jpeg', width: 512 });
    const small = await uploadOne(ownerCookie, new Uint8Array(await sharp({ create: { width: 40, height: 30, channels: 3, background: '#00f' } }).png().toBuffer()), 'small-preview.png');
    expect(await sharp(new Uint8Array(await (await GET_THUMB(get(`/api/assets/${small}/thumb?w=1600`, ownerCookie), ctx(small))).arrayBuffer())).metadata()).toMatchObject({ width: 40, height: 30 });
  });

  test('refuses any other size, and the preview has the same access as the tile', async () => {
    for (const w of ['512', '100', '1601', '0', '-1', 'abc', '']) expect((await GET_THUMB(get(`/api/assets/${id}/thumb?w=${w}`, ownerCookie), ctx(id))).status, `w=${w}`).toBe(400);
    expect((await GET_THUMB(get(`/api/assets/${id}/thumb?w=1600`), ctx(id))).status).toBe(401);
    expect((await GET_THUMB(get(`/api/assets/${id}/thumb?w=1600`, otherCookie), ctx(id))).status).toBe(403);
    expect((await GET_THUMB(get('/api/assets/nope/thumb?w=1600', ownerCookie), ctx('nope'))).status).toBe(404);
  });

  test('has the access of the content: no session, another Member, an unknown id', async () => {
    expect((await GET_THUMB(get(`/api/assets/${id}/thumb`), ctx(id))).status).toBe(401);
    expect((await GET_THUMB(get(`/api/assets/${id}/thumb`, otherCookie), ctx(id))).status).toBe(403);
    expect((await GET_THUMB(get(`/api/assets/${id}/thumb`, adminCookie), ctx(id))).status).toBe(200);
    expect((await GET_THUMB(get('/api/assets/nope/thumb', ownerCookie), ctx('nope'))).status).toBe(404);
  });

  test('never enlarges a small picture, sends a picture sharp cannot read as it is, and refuses a video', async () => {
    const small = await uploadOne(ownerCookie, new Uint8Array(await sharp({ create: { width: 40, height: 30, channels: 3, background: '#00f' } }).png().toBuffer()), 'small.png');
    expect(await sharp(new Uint8Array(await (await GET_THUMB(get(`/api/assets/${small}/thumb`, ownerCookie), ctx(small))).arrayBuffer())).metadata()).toMatchObject({ width: 40, height: 30 });
    const bytes = png(1000); // a PNG signature over noise
    const broken = await uploadOne(ownerCookie, bytes, 'broken.png');
    const res = await GET_THUMB(get(`/api/assets/${broken}/thumb`, ownerCookie), ctx(broken));
    expect(res.status).toBe(200);
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(bytes);
    const clip = await uploadOne(ownerCookie, mp4(2000), 'clip.mp4');
    expect((await GET_THUMB(get(`/api/assets/${clip}/thumb`, ownerCookie), ctx(clip))).status).toBe(400);
  });
});

describe('GET /api/assets/:id', () => {
  let id = '';
  beforeAll(async () => {
    id = await uploadOne(ownerCookie, png(64));
  });

  test('rejects a request without a session', async () => {
    expect((await GET_DETAILS(get(`/api/assets/${id}`), ctx(id))).status).toBe(401);
  });

  test('keeps another Member out', async () => {
    expect((await GET_DETAILS(get(`/api/assets/${id}`, otherCookie), ctx(id))).status).toBe(403);
  });
});

describe('a soft-deleted asset', () => {
  test('answers 404 on the details, content and download routes', async () => {
    const id = await uploadOne(ownerCookie, png(64));
    await pool.query('update assets set deleted_at = now() where id = $1', [id]);
    expect((await GET_DETAILS(get(`/api/assets/${id}`, ownerCookie), ctx(id))).status).toBe(404);
    expect((await GET_CONTENT(get(`/api/assets/${id}/content`, ownerCookie), ctx(id))).status).toBe(404);
    const token = signDownloadToken(id, ownerId);
    expect((await GET_DOWNLOAD(get(`/api/assets/${id}/download?t=${token}`, ownerCookie), ctx(id))).status).toBe(404);
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

  test("percent-encodes the characters RFC 8187 does not allow in filename*", async () => {
    const quoted = await uploadOne(ownerCookie, jpeg(10), `it's (1)*.jpg`);
    const res = await download(quoted, ownerCookie, signDownloadToken(quoted, ownerId));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-disposition')).toBe(`attachment; filename="it's (1)*.jpg"; filename*=UTF-8''it%27s%20%281%29%2A.jpg`);
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

describe('GET /api/assets?recent=marketing-product', () => {
  beforeAll(async () => {
    await pool.query(
      `insert into model_configs (id, provider, endpoint, label, ratios, durations_sec, max_images, output_resolution, usd_per_second, sources, enabled, features)
       values ('fal-test', 'fal', 'x', 'Fal test', '{9:16}', '{5}', 7, '720p', 0.2, '{}', true, '{marketing}')`,
    );
  });
  /** A UGC (or, with `format`, Advanced) Marketing Studio job of the user over the given inputs, `minutesAgo` old. */
  async function job(userId: string, inputs: string[], minutesAgo: number, format?: string) {
    const id = `mkt-${randomBytes(4).toString('hex')}`;
    await pool.query(
      `insert into jobs (id, user_id, team_id, model, provider, prompt, aspect, duration_s, input_asset_ids, status, feature, params, created_at)
       values ($1, $2, 'team-unassigned', 'fal-test', 'fal', 'p', '9:16', 5, $3, 'succeeded', 'marketing', $4, now() - make_interval(mins => $5))`,
      [id, userId, inputs, format ? { format } : {}, minutesAgo],
    );
  }
  const recent = async (cookie: string, query = '?recent=marketing-product') => {
    const { GET } = await import('./route');
    return GET(new Request(`${BASE}${query}`, { headers: { cookie } }));
  };

  test("lists the caller's own UGC product photos, newest first and once each, without model photos, Advanced references or deleted files", async () => {
    const up = (name: string) => uploadOne(ownerCookie, png(64), name);
    const [model, p1, p2, ref, gone] = [await up('m.png'), await up('p1.png'), await up('p2.png'), await up('ref.png'), await up('gone.png')];
    await job(ownerId, [model, p1], 30);
    await job(ownerId, [model, p2], 20);
    await job(ownerId, [model, p1], 10); // p1 again, most recently
    await job(ownerId, [ref, model], 5, 'advanced');
    await job(ownerId, [model, gone], 1);
    await pool.query(`update assets set deleted_at = now() where id = $1`, [gone]);
    const res = await recent(ownerCookie);
    expect(res.status).toBe(200);
    expect(((await res.json()) as { assets: { id: string; filename: string }[] }).assets).toEqual([
      { id: p1, filename: 'p1.png' },
      { id: p2, filename: 'p2.png' },
    ]);
  });

  test("lists the caller's own Try On model photos (the first input) for the model picker's My models, newest first", async () => {
    const up = (name: string) => uploadOne(ownerCookie, png(64), name);
    const [m1, m2, garment] = [await up('model-1.png'), await up('model-2.png'), await up('garment.png')];
    for (const [inputs, ago] of [[[m1, garment], 20], [[m2, garment], 10]] as const) {
      await pool.query(
        `insert into jobs (id, user_id, team_id, model, provider, prompt, aspect, duration_s, input_asset_ids, status, feature, params, created_at)
         values ($1, $2, 'team-unassigned', 'fal-test', 'fal', 'p', 'auto', 0, $3, 'succeeded', 'try_on', '{}', now() - make_interval(mins => $4))`,
        [`tro-${randomBytes(4).toString('hex')}`, ownerId, inputs, ago],
      );
    }
    const res = await recent(ownerCookie, '?recent=try-on-model');
    expect(res.status).toBe(200);
    expect(((await res.json()) as { assets: { id: string }[] }).assets.map((a) => a.id)).toEqual([m2, m1]);
  });
  test("never shows another member's products, and asks for a session and the one supported query", async () => {
    expect(((await (await recent(otherCookie)).json()) as { assets: unknown[] }).assets).toEqual([]);
    expect((await recent('')).status).toBe(401);
    expect((await recent(ownerCookie, '?recent=other')).status).toBe(400);
  });
});

describe('GET /api/assets?recent=uploads', () => {
  let cookie = '';
  let userId = '';
  beforeAll(async () => {
    userId = (await auth.api.createUser({ body: { email: 'uploader@example.test', name: 'Uploader', password: PASSWORD, role: 'member' } })).user.id;
    cookie = await signIn('uploader@example.test');
  });
  const uploads = async (who: string, query = '') => {
    const { GET } = await import('./route');
    const res = await GET(new Request(`${BASE}?recent=uploads${query}`, { headers: { cookie: who } }));
    expect(res.status).toBe(200);
    return ((await res.json()) as { assets: { id: string; filename: string }[] }).assets;
  };
  /** Sets an asset's upload time `minutesAgo` back, so the order does not hang on clock ticks. */
  const age = (id: string, minutesAgo: number) => pool.query('update assets set created_at = now() - make_interval(mins => $2) where id = $1', [id, minutesAgo]);
  async function job(inputs: string[], { deleted = false, endAssetId }: { deleted?: boolean; endAssetId?: string } = {}) {
    await pool.query(
      `insert into jobs (id, user_id, team_id, model, provider, prompt, aspect, duration_s, input_asset_ids, status, feature, params, deleted_at)
       values ($1, $2, 'team-unassigned', 'fal-test', 'fal', 'p', '9:16', 5, $3, 'succeeded', 'marketing', $4, $5)`,
      [`upl-${randomBytes(4).toString('hex')}`, userId, inputs, endAssetId ? { endAssetId } : {}, deleted ? new Date() : null],
    );
  }

  test("lists the caller's own live photos newest first, without videos, audio, outputs, deleted files or photos only deleted jobs used", async () => {
    const up = (name: string) => uploadOne(cookie, png(64), name);
    const [old, mid, fresh, gone, onlyDeleted, endOnlyDeleted, kept] = [await up('old.png'), await up('mid.png'), await up('fresh.png'), await up('gone.png'), await up('dead.png'), await up('end.png'), await up('kept.png')];
    const video = await uploadOne(cookie, mp4(3000), 'clip.mp4');
    const audio = await uploadOne(cookie, wav(2500), 'voice.wav');
    await uploadOne(ownerCookie, png(64), 'not-mine.png');
    for (const [id, ago] of [[old, 50], [mid, 40], [kept, 30], [fresh, 10]] as const) await age(id, ago);
    await pool.query('update assets set deleted_at = now() where id = $1', [gone]);
    await pool.query(`update assets set kind = 'output' where id = $1`, [await up('result.png')]);
    await job([onlyDeleted], { deleted: true });
    await job([mid], { deleted: true, endAssetId: endOnlyDeleted });
    await job([kept], { deleted: true });
    await job([kept, mid]); // a live job still runs from both
    const list = await uploads(cookie);
    expect(list.map((a) => a.filename)).toEqual(['fresh.png', 'kept.png', 'mid.png', 'old.png']);
    expect(list.map((a) => a.id)).not.toContain(video);
    expect(list.map((a) => a.id)).not.toContain(audio);
  });

  test("tags an upload with a visible store, refuses a hidden or unknown one, and filters by store among the caller's own photos only", async () => {
    await pool.query(`insert into stores (id, name, code, hidden) values ('st-a', 'Shop A', 'STA', false), ('st-b', 'Shop B', 'STB', false), ('st-h', 'Shop H', 'STH', true)`);
    const send = (who: string, name: string, storeId?: string) => upload(who, { name, bytes: png(64), storeId });
    const before = await assetCount();
    expect((await send(cookie, 'hidden.png', 'st-h')).status).toBe(400);
    expect((await send(cookie, 'unknown.png', 'st-x')).status).toBe(400);
    expect(await assetCount()).toBe(before);
    for (const [name, store] of [['a1.png', 'st-a'], ['b1.png', 'st-b'], ['none.png', ''], ['a2.png', 'st-a']] as const) expect((await send(cookie, name, store)).status).toBe(201);
    expect((await send(ownerCookie, 'theirs-a.png', 'st-a')).status).toBe(201);
    for (const [name, ago] of [['a1.png', 4], ['b1.png', 3], ['none.png', 2], ['a2.png', 1]] as const) await pool.query('update assets set created_at = now() - make_interval(mins => $2) where filename = $1', [name, ago]);
    const tags = await pool.query(`select filename, store_id from assets where filename in ('a1.png', 'b1.png', 'none.png') order by filename`);
    expect(tags.rows).toEqual([{ filename: 'a1.png', store_id: 'st-a' }, { filename: 'b1.png', store_id: 'st-b' }, { filename: 'none.png', store_id: null }]);
    const names = async (query: string) => (await uploads(cookie, query)).map((a) => a.filename);
    expect(await names('&storeId=st-a')).toEqual(['a2.png', 'a1.png']);
    expect(await names('&storeId=st-b')).toEqual(['b1.png']);
    expect(await names('&storeId=st-x')).toEqual([]);
    expect((await names('')).slice(0, 4)).toEqual(['a2.png', 'none.png', 'b1.png', 'a1.png']);
  });

  test('an upload of a file the caller already has returns that photo with its slot, and the picker filters by slot and shows each file once', async () => {
    const bytes = png(64);
    const send = async (who: string, name: string, slot?: string) => {
      const res = await upload(who, { name, bytes, slot });
      expect(res.status).toBe(201);
      return ((await res.json()) as { assets: { id: string; filename: string }[] }).assets;
    };
    const [first] = await send(cookie, 'shirt.png', 'garment');
    const before = await assetCount();
    expect((await send(cookie, 'shirt-again.png', 'model')).map((a) => [a.id, a.filename])).toEqual([[first!.id, 'shirt.png']]); // the first slot stays
    expect((await upload(cookie, { name: 'a.png', bytes }, { name: 'b.png', bytes })).status).toBe(201);
    expect(await assetCount()).toBe(before);
    expect((await pool.query('select slot, sha256 from assets where id = $1', [first!.id])).rows[0]).toEqual({ slot: 'garment', sha256: createHash('sha256').update(bytes).digest('hex') });
    expect((await send(ownerCookie, 'theirs.png'))[0]!.id).not.toBe(first!.id); // another member's copy is their own

    // An older copy (uploaded before hashing) shows once, as the newest; an unknown slot is ignored.
    await pool.query(`insert into assets (id, owner_id, kind, s3_key, filename, mime, bytes, sha256, slot, created_at)
                      select 'old-copy', owner_id, 'input', 'assets/old-copy', 'old.png', mime, bytes, sha256, 'garment', now() - interval '1 day' from assets where id = $1`, [first!.id]);
    const ids = async (query: string) => (await uploads(cookie, query)).map((a) => a.id);
    expect((await ids('&slot=garment'))).toEqual([first!.id]);
    expect(await ids('&slot=model')).toEqual([]);
    expect((await ids('&slot=nonsense')).filter((id) => id === first!.id || id === 'old-copy')).toEqual([first!.id]);

    // A copy that only a deleted job names goes with that job, so a new upload of its file is stored anew.
    await job([first!.id], { deleted: true });
    await pool.query(`update assets set deleted_at = now() where id = 'old-copy'`);
    expect((await send(cookie, 'shirt-3.png'))[0]!.id).not.toBe(first!.id);
  });

  test(`stops at ${UPLOADS_LIMIT}, the oldest left out, and asks for a session`, async () => {
    await pool.query(
      `insert into assets (id, owner_id, kind, s3_key, filename, mime, bytes, created_at)
       select 'bulk-' || n, $1, 'input', 'assets/bulk-' || n, 'bulk-' || n || '.png', 'image/png', 64, now() - make_interval(days => n) from generate_series(1, $2::int) n`,
      [userId, UPLOADS_LIMIT + 1],
    );
    const list = await uploads(cookie);
    expect(list).toHaveLength(UPLOADS_LIMIT);
    expect(list.map((a) => a.id)).not.toContain(`bulk-${UPLOADS_LIMIT + 1}`);
    const { GET } = await import('./route');
    expect((await GET(new Request(`${BASE}?recent=uploads`))).status).toBe(401);
  });
});
