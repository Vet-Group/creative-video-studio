// The Compress & download button on the worker: a clip made here with the pinned ffmpeg, a disposable database and bucket on the compose Postgres and MinIO (`pnpm services:up`).
import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { DeleteBucketCommand, DeleteObjectsCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { COMPRESS_MAX_BYTES, compressedKey } from '@cvs/core/queue';
import { createPool } from '@cvs/db/client';
import { createTestDatabase } from '@cvs/db/testing';
import ffprobe from 'ffprobe-static';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { compressVideoAsset } from './compress';
import { compressClip, probeSize, requireFfmpeg } from './media';
import { bucketName, ensureBucket, getObject, hasObject, putObject, s3 } from './storage';

const run = promisify(execFile);
const testDb = await createTestDatabase();
process.env.S3_BUCKET = `cvs-test-${randomBytes(6).toString('hex')}`;
const pool = createPool(testDb.url, 4);
let dir = '';

/** A 4 s 1536x672 clip with tone and film-like noise, encoded at a high bitrate as a provider's output is: far larger than a CRF 28 copy. */
const makeClip = (file: string, extra: string[]) =>
  run(requireFfmpeg(), ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=1536x672:rate=24,noise=alls=12:allf=t', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=44100', '-t', '4', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', ...extra, file]);
const probe = async (file: string) =>
  (JSON.parse((await run(ffprobe.path, ['-v', 'error', '-show_entries', 'stream=codec_type,codec_name,pix_fmt', '-of', 'json', file])).stdout) as { streams: { codec_type: string; codec_name: string; pix_fmt?: string }[] }).streams;
/** The top-level MP4 boxes in file order: with +faststart `moov` comes before `mdat`. */
function boxes(b: Uint8Array): string[] {
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const out: string[] = [];
  for (let at = 0; at + 8 <= b.length; ) {
    out.push(String.fromCharCode(...b.subarray(at + 4, at + 8)));
    at += view.getUint32(at) || b.length;
  }
  return out;
}
async function video(id: string, file: string, mime = 'video/mp4') {
  const bytes = new Uint8Array(await readFile(file));
  await putObject(`assets/${id}`, bytes, mime);
  await pool.query(`insert into assets (id, owner_id, kind, s3_key, filename, mime, bytes) values ($1, 'u1', 'output', $2, $1, $3, $4)`, [id, `assets/${id}`, mime, bytes.length]);
  return bytes.length;
}

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'cvs-compress-test-'));
  await ensureBucket();
  await pool.query(`insert into users (id, email, name) values ('u1', 'u1@example.test', 'u1')`);
});

afterAll(async () => {
  const Bucket = bucketName();
  const { Contents = [] } = await s3().send(new ListObjectsV2Command({ Bucket }));
  if (Contents.length > 0) await s3().send(new DeleteObjectsCommand({ Bucket, Delete: { Objects: Contents.flatMap(({ Key }) => (Key ? [{ Key }] : [])) } }));
  await s3().send(new DeleteBucketCommand({ Bucket }));
  await pool.end();
  await testDb.drop();
  await rm(dir, { recursive: true, force: true });
});

describe('compressVideoAsset', () => {
  test('stores a smaller H.264 copy with the index up front, the same size and the sound, and reuses it the second time', async () => {
    const file = join(dir, 'big.mp4');
    await makeClip(file, ['-c:v', 'libx264', '-preset', 'ultrafast', '-b:v', '12M']);
    const original = await video('big', file);

    expect(await compressVideoAsset(pool, 'big')).toBe('stored');
    const copy = await getObject(compressedKey('big'));
    console.info(`compress sample: ${original} -> ${copy.length} bytes (${Math.round((copy.length / original) * 100)}%)`);
    expect(copy.length).toBeLessThan(original * 0.8);
    const out = join(dir, 'big-copy.mp4');
    await writeFile(out, copy);
    expect(await probe(out)).toEqual([
      { codec_name: 'h264', codec_type: 'video', pix_fmt: 'yuv420p' },
      { codec_name: 'aac', codec_type: 'audio' },
    ]);
    expect(await probeSize(out)).toEqual({ width: 1536, height: 672 });
    const order = boxes(copy);
    expect(order.indexOf('moov')).toBeGreaterThan(-1);
    expect(order.indexOf('moov')).toBeLessThan(order.indexOf('mdat'));

    // A second request finds the copy and leaves it alone: a marker put in its place is still there.
    await putObject(compressedKey('big'), new Uint8Array([1, 2, 3]), 'video/mp4');
    expect(await compressVideoAsset(pool, 'big')).toBe('stored');
    expect([...(await getObject(compressedKey('big')))]).toEqual([1, 2, 3]);
  }, 30_000);

  test('keeps nothing when the copy is not at least 20% smaller, so the original is served', async () => {
    const file = join(dir, 'small.mp4');
    await makeClip(file, ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '40']);
    await video('small', file);
    expect(await compressVideoAsset(pool, 'small')).toBe('original');
    const { Contents = [] } = await s3().send(new ListObjectsV2Command({ Bucket: bucketName(), Prefix: compressedKey('small') }));
    expect(Contents).toEqual([]);
  }, 30_000);

  test('refuses an image, an input video, one over the size cap and a missing asset', async () => {
    const row = (id: string, kind: string, mime: string, bytes: number) =>
      pool.query(`insert into assets (id, owner_id, kind, s3_key, filename, mime, bytes) values ($1, 'u1', $2, $3, $1, $4, $5)`, [id, kind, `assets/${id}`, mime, bytes]);
    await row('pic', 'output', 'image/png', 1);
    await row('upload', 'input', 'video/mp4', 1);
    await row('huge', 'output', 'video/mp4', COMPRESS_MAX_BYTES + 1);
    for (const id of ['pic', 'upload', 'huge', 'nope']) await expect(compressVideoAsset(pool, id)).rejects.toThrow('not an output video within the size cap');
  });

  test('a timeout or an abort rejects, leaves no copy and removes the temporary files', async () => {
    const file = join(dir, 'slow.mp4');
    await makeClip(file, ['-c:v', 'libx264', '-preset', 'ultrafast', '-b:v', '12M']);
    await video('slow', file);
    const leftovers = async () => (await readdir(tmpdir())).filter((n) => n.startsWith('cvs-compress-'));
    const before = await leftovers();
    await expect(compressVideoAsset(pool, 'slow', undefined, 1)).rejects.toThrow(); // ffmpeg is killed after 1 ms
    const stop = new AbortController();
    stop.abort();
    await expect(compressVideoAsset(pool, 'slow', stop.signal)).rejects.toThrow(); // pg-boss expired the job
    expect(await leftovers()).toEqual(before);
    expect(await hasObject(compressedKey('slow'))).toBe(false);
  }, 30_000);
});

test('compressClip brings a long side over 1920 px down to 1920 and keeps the shape', async () => {
  const wide = join(dir, 'wide.mp4');
  await run(requireFfmpeg(), ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=2560x1080:rate=12', '-t', '1', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', wide]);
  const out = join(dir, 'wide-copy.mp4');
  await compressClip(wide, out);
  expect(await probeSize(out)).toEqual({ width: 1920, height: 810 });
});
