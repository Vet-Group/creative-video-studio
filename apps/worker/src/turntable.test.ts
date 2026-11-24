// The 360 turntable on the worker: tiny frames made here with sharp, the pinned ffmpeg, a disposable database and bucket on the compose Postgres and MinIO (`pnpm services:up`).
import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { DeleteBucketCommand, DeleteObjectsCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { turntableKey } from '@cvs/core/queue';
import { TURNTABLE_VIEWS } from '@cvs/core/turntable';
import { createPool } from '@cvs/db/client';
import { createTestDatabase } from '@cvs/db/testing';
import ffprobe from 'ffprobe-static';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { probeSize } from './media';
import { stitchTurntable, turntableDue } from './turntable';
import { bucketName, ensureBucket, getObject, hasObject, putObject, s3 } from './storage';

const run = promisify(execFile);
const testDb = await createTestDatabase();
process.env.S3_BUCKET = `cvs-test-${randomBytes(6).toString('hex')}`;
const pool = createPool(testDb.url, 4);
let dir = '';
const data = (batch: string, inputAssetId = 'photo') => ({ batch, inputAssetId, userId: 'u1', workspaceId: 'ws_vet' });

async function picture(id: string, kind: 'input' | 'output', width: number, height: number) {
  const bytes = await sharp({ create: { width, height, channels: 3, background: { r: width % 256, g: height % 256, b: 120 } } }).png().toBuffer();
  await putObject(`assets/${id}`, bytes, 'image/png');
  await pool.query(`insert into assets (id, owner_id, kind, s3_key, filename, mime, bytes, workspace_id) values ($1, 'u1', $2, $3, $1, 'image/png', $4, 'ws_vet')`, [id, kind, `assets/${id}`, bytes.length]);
}

/** A multi-angle job of a Run on `photo`, with its own output picture (sizes differ from the photo's, as the model's do). */
async function view(id: string, batch: string, v: string, { photo = 'photo', status = 'succeeded', feature = 'multi_angle', deleted = false, at = '2026-11-24T10:00:00Z', params = {} as Record<string, string> } = {}) {
  await picture(`${id}-out`, 'output', 60 + (id.length % 3) * 20, 80 + (id.length % 2) * 30);
  await pool.query(
    `insert into jobs (id, user_id, team_id, model, provider, prompt, aspect, duration_s, input_asset_ids, status, output_asset_id, params, workspace_id, feature, deleted_at, created_at)
     values ($1, 'u1', 'team-unassigned', 'm', 'fal', 'p', 'auto', 0, $2, $3, $4, $5, 'ws_vet', $6, case when $7 then now() else null end, $8)`,
    [id, [photo], status, `${id}-out`, JSON.stringify({ batch, view: v, ...params }), feature, deleted, at],
  );
}

const views = (batch: string, skip: string[] = []) => Promise.all(TURNTABLE_VIEWS.filter((v) => !skip.includes(v)).map((v) => view(`${batch}-${v}`, batch, v)));

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'cvs-turntable-test-'));
  await ensureBucket();
  await pool.query(`insert into users (id, email, name) values ('u1', 'u1@example.test', 'u1')`);
  await pool.query(
    `insert into model_configs (id, provider, endpoint, label, ratios, durations_sec, max_images, output_resolution, usd_per_second, sources, enabled)
     values ('m', 'fal', 'x', 'M', '{9:16}', '{5}', 4, '720p', 0.2, '{}', true)`,
  );
  await picture('photo', 'input', 100, 134);
  await picture('other-photo', 'input', 100, 134);
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

describe('stitchTurntable', () => {
  test('stitches the photo and the 7 views into an 8 s, 24 fps loop of 192 frames at the photo size, and keeps a stored one', async () => {
    await views('run-ok');
    await stitchTurntable(pool, data('run-ok'));
    const file = join(dir, 'ok.mp4');
    await writeFile(file, await getObject(turntableKey('run-ok', 'photo')));
    expect(await probeSize(file)).toEqual({ width: 100, height: 134 });
    const { stdout } = await run(ffprobe.path, ['-v', 'error', '-count_frames', '-select_streams', 'v:0', '-show_entries', 'stream=nb_read_frames,r_frame_rate,pix_fmt:format=duration', '-of', 'json', file]);
    const { streams, format } = JSON.parse(stdout) as { streams: { nb_read_frames: string; r_frame_rate: string; pix_fmt: string }[]; format: { duration: string } };
    expect(streams[0]).toMatchObject({ nb_read_frames: '192', r_frame_rate: '24/1', pix_fmt: 'yuv420p' });
    expect(Number(format.duration)).toBeCloseTo(8, 0);

    // A second request finds the video and leaves it alone: a marker put in its place is still there.
    await putObject(turntableKey('run-ok', 'photo'), new Uint8Array([1, 2, 3]), 'video/mp4');
    await stitchTurntable(pool, data('run-ok'));
    expect([...(await getObject(turntableKey('run-ok', 'photo')))]).toEqual([1, 2, 3]);
  }, 90_000);

  test('takes the latest view of a retried one, and rounds an odd photo down to even sides', async () => {
    await picture('odd-photo', 'input', 101, 135);
    await Promise.all(TURNTABLE_VIEWS.map((v) => view(`odd-${v}`, 'run-odd', v, { photo: 'odd-photo' })));
    await view('odd-back-failed', 'run-odd', 'back', { photo: 'odd-photo', status: 'failed', at: '2026-11-24T11:00:00Z' }); // a later failed try does not count
    await stitchTurntable(pool, data('run-odd', 'odd-photo'));
    const file = join(dir, 'odd.mp4');
    await writeFile(file, await getObject(turntableKey('run-odd', 'odd-photo')));
    expect(await probeSize(file)).toEqual({ width: 100, height: 134 });
  }, 90_000);

  test('stitches even a 1 x 1 photo, to the smallest even size', async () => {
    await picture('tiny-photo', 'input', 1, 1);
    await Promise.all(TURNTABLE_VIEWS.map((v) => view(`tiny-${v}`, 'run-tiny', v, { photo: 'tiny-photo' })));
    await stitchTurntable(pool, data('run-tiny', 'tiny-photo'));
    const file = join(dir, 'tiny.mp4');
    await writeFile(file, await getObject(turntableKey('run-tiny', 'tiny-photo')));
    expect(await probeSize(file)).toEqual({ width: 2, height: 2 });
  }, 90_000);

  test('refuses a Run that lost a view, makes nothing for it and leaves no temporary files', async () => {
    await views('run-short', ['left']);
    const leftovers = async () => (await readdir(tmpdir())).filter((n) => n.startsWith('cvs-turntable-') && !n.startsWith('cvs-turntable-test-'));
    const before = await leftovers();
    await expect(stitchTurntable(pool, data('run-short'))).rejects.toThrow('no longer has all 7 views');
    expect(await hasObject(turntableKey('run-short', 'photo'))).toBe(false);
    expect(await leftovers()).toEqual(before);
  });

  test('an abort rejects, leaves no video and removes the temporary files', async () => {
    await views('run-stop');
    const leftovers = async () => (await readdir(tmpdir())).filter((n) => n.startsWith('cvs-turntable-') && !n.startsWith('cvs-turntable-test-'));
    const before = await leftovers();
    await expect(stitchTurntable(pool, data('run-stop'), AbortSignal.abort())).rejects.toThrow(); // pg-boss expired the job
    expect(await leftovers()).toEqual(before);
    expect(await hasObject(turntableKey('run-stop', 'photo'))).toBe(false);
  });
});

describe('turntableDue', () => {
  const due = (id: string) => turntableDue(pool, id);

  test('asks for a turntable only when the job just completed all 7 horizontal views of its Run, not for 6', async () => {
    await views('due-a', ['left']);
    expect(await due('due-a-back')).toBeUndefined(); // 6 views
    await view('due-a-left', 'due-a', 'left');
    expect(await due('due-a-left')).toEqual(data('due-a'));
    expect(await due('due-a-back')).toEqual(data('due-a')); // whichever view was the last to settle
  });

  test('ignores the top view, extra views, a Run with no id and another app', async () => {
    await views('due-b');
    await view('due-b-top', 'due-b', 'top');
    expect(await due('due-b-top')).toBeUndefined(); // the top view does not complete or change the turntable
    expect(await due('due-b-back')).toEqual(data('due-b'));
    await pool.query(`update jobs set params = params - 'batch' where id = 'due-b-back'`);
    expect(await due('due-b-back')).toBeUndefined();
    await pool.query(`update jobs set feature = 'pet_portrait' where id = 'due-b-left'`);
    expect(await due('due-b-left')).toBeUndefined();
    expect(await due('missing-job')).toBeUndefined();
  });

  test('counts only the Run on this photo: 3 views of one photo and 4 of another make nothing', async () => {
    await Promise.all(TURNTABLE_VIEWS.map((v, i) => view(`due-c-${v}`, 'due-c', v, { photo: i < 3 ? 'photo' : 'other-photo' })));
    expect(await due('due-c-back')).toBeUndefined();
    expect(await due('due-c-right')).toBeUndefined();
  });

  test('does not count a deleted job, a failed one or a purged one', async () => {
    await views('due-d');
    await pool.query(`update jobs set deleted_at = now() where id = 'due-d-back'`);
    expect(await due('due-d-left')).toBeUndefined();
    await pool.query(`update jobs set deleted_at = null, status = 'failed' where id = 'due-d-back'`);
    expect(await due('due-d-left')).toBeUndefined();
    await pool.query(`update jobs set status = 'succeeded', purged_at = now() where id = 'due-d-back'`);
    expect(await due('due-d-left')).toBeUndefined();
    await view('due-d-back-retry', 'due-d', 'back'); // a retry keeps the Run's id
    expect(await due('due-d-back-retry')).toEqual(data('due-d'));
  });
});
