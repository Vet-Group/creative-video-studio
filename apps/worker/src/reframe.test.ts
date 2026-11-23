// Reframe & download on the worker: a clip made here with the pinned ffmpeg, a disposable database and bucket on the compose Postgres and MinIO (`pnpm services:up`).
import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { DeleteBucketCommand, DeleteObjectsCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { COMPRESS_MAX_BYTES, reframedKey } from '@cvs/core/queue';
import { createPool } from '@cvs/db/client';
import { createTestDatabase } from '@cvs/db/testing';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { probeSize, requireFfmpeg } from './media';
import { reframeVideoAsset } from './reframe';
import { bucketName, ensureBucket, getObject, hasObject, putObject, s3 } from './storage';

const run = promisify(execFile);
const testDb = await createTestDatabase();
process.env.S3_BUCKET = `cvs-test-${randomBytes(6).toString('hex')}`;
const pool = createPool(testDb.url, 4);
let dir = '';

async function video(id: string) {
  const file = join(dir, `${id}.mp4`);
  await run(requireFfmpeg(), ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=24', '-f', 'lavfi', '-i', 'sine=frequency=440', '-t', '1', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', file]);
  const bytes = new Uint8Array(await readFile(file));
  await putObject(`assets/${id}`, bytes, 'video/mp4');
  await pool.query(`insert into assets (id, owner_id, kind, s3_key, filename, mime, bytes, workspace_id) values ($1, 'u1', 'output', $2, $1, 'video/mp4', $3, 'ws_vet')`, [id, `assets/${id}`, bytes.length]);
}

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'cvs-reframe-test-'));
  await ensureBucket();
  await pool.query(`insert into users (id, email, name) values ('u1', 'u1@example.test', 'u1')`);
});

afterAll(async () => {
  try {
    const Bucket = bucketName();
    const { Contents = [] } = await s3().send(new ListObjectsV2Command({ Bucket }));
    if (Contents.length > 0) await s3().send(new DeleteObjectsCommand({ Bucket, Delete: { Objects: Contents.flatMap(({ Key }) => (Key ? [{ Key }] : [])) } }));
    await s3().send(new DeleteBucketCommand({ Bucket }));
    await pool.end();
    await rm(dir, { recursive: true, force: true });
  } finally {
    await testDb.drop();
  }
});

describe('reframeVideoAsset', () => {
  test('stores each shape and fill under its own key, the size the shape asks for, and reuses a stored copy', async () => {
    await video('wide');
    await reframeVideoAsset(pool, { assetId: 'wide', ratio: '9:16', fill: 'blur' });
    await reframeVideoAsset(pool, { assetId: 'wide', ratio: '1:1', fill: 'black' });
    for (const [ratio, fill, size] of [['9:16', 'blur', { width: 360, height: 640 }], ['1:1', 'black', { width: 640, height: 640 }]] as const) {
      const out = join(dir, `wide-${fill}.mp4`);
      await writeFile(out, await getObject(reframedKey('wide', ratio, fill)));
      expect(await probeSize(out)).toEqual(size);
    }
    expect(await hasObject(reframedKey('wide', '4:5', 'blur'))).toBe(false);

    // A second request finds the copy and leaves it alone: a marker put in its place is still there.
    await putObject(reframedKey('wide', '9:16', 'blur'), new Uint8Array([1, 2, 3]), 'video/mp4');
    await reframeVideoAsset(pool, { assetId: 'wide', ratio: '9:16', fill: 'blur' });
    expect([...(await getObject(reframedKey('wide', '9:16', 'blur')))]).toEqual([1, 2, 3]);
  }, 60_000);

  test('refuses an image, an input video, one over the size cap and a missing asset', async () => {
    const row = (id: string, kind: string, mime: string, bytes: number) =>
      pool.query(`insert into assets (id, owner_id, kind, s3_key, filename, mime, bytes, workspace_id) values ($1, 'u1', $2, $3, $1, $4, $5, 'ws_vet')`, [id, kind, `assets/${id}`, mime, bytes]);
    await row('pic', 'output', 'image/png', 1);
    await row('upload', 'input', 'video/mp4', 1);
    await row('huge', 'output', 'video/mp4', COMPRESS_MAX_BYTES + 1);
    for (const assetId of ['pic', 'upload', 'huge', 'nope']) await expect(reframeVideoAsset(pool, { assetId, ratio: '1:1', fill: 'blur' })).rejects.toThrow('not an output video within the size cap');
  });

  test('an abort rejects, leaves no copy and removes the temporary files', async () => {
    await video('stopped');
    const leftovers = async () => (await readdir(tmpdir())).filter((n) => n.startsWith('cvs-reframe-') && !n.startsWith('cvs-reframe-test-'));
    const before = await leftovers();
    await expect(reframeVideoAsset(pool, { assetId: 'stopped', ratio: '4:5', fill: 'blur' }, AbortSignal.abort())).rejects.toThrow(); // pg-boss expired the job
    expect(await leftovers()).toEqual(before);
    expect(await hasObject(reframedKey('stopped', '4:5', 'blur'))).toBe(false);
  }, 30_000);
});
