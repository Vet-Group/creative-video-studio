// The purge against a disposable database and bucket on the compose Postgres and MinIO (`pnpm services:up`).
import { randomBytes } from 'node:crypto';
import { DeleteBucketCommand, DeleteObjectsCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { createPool } from '@cvs/db/client';
import { createTestDatabase } from '@cvs/db/testing';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { purgeDeletedClips } from './purge';
import { bucketName, deleteObject, ensureBucket, putObject, s3 } from './storage';

const testDb = await createTestDatabase();
process.env.S3_BUCKET = `cvs-test-${randomBytes(6).toString('hex')}`;
const pool = createPool(testDb.url, 4);
const logged: string[] = [];
const log = (what: string) => logged.push(what);

const keys = async () => {
  const { Contents = [] } = await s3().send(new ListObjectsV2Command({ Bucket: bucketName() }));
  return Contents.flatMap(({ Key }) => (Key ? [Key] : [])).sort();
};

beforeAll(async () => {
  await ensureBucket();
  await pool.query(`insert into users (id, email, name) values ('u1', 'u1@example.test', 'u1')`);
  await pool.query(
    `insert into model_configs (id, provider, endpoint, label, ratios, durations_sec, max_images, output_resolution, usd_per_second, sources, enabled)
     values ('m', 'fal', 'x', 'M', '{9:16}', '{5}', 4, '720p', 0.2, '{}', true)`,
  );
});

afterAll(async () => {
  const Bucket = bucketName();
  const Objects = (await keys()).map((Key) => ({ Key }));
  if (Objects.length > 0) await s3().send(new DeleteObjectsCommand({ Bucket, Delete: { Objects } }));
  await s3().send(new DeleteBucketCommand({ Bucket }));
  await pool.end();
  await testDb.drop();
});

async function asset(id: string, kind: 'input' | 'output') {
  await pool.query(`insert into assets (id, owner_id, kind, s3_key, filename, mime, bytes) values ($1, 'u1', $2, $3, $1, 'x/y', 1)`, [id, kind, `assets/${id}`]);
  await putObject(`assets/${id}`, new Uint8Array(1), 'x/y');
}

/** A succeeded clip with a video, a poster, a verdict and an estimate plus a closing row in the ledger; `deletedDaysAgo` null leaves it live. */
async function clip(id: string, inputs: string[], deletedDaysAgo: number | null) {
  await asset(`${id}-video`, 'output');
  await asset(`${id}-poster`, 'output');
  await pool.query(
    `insert into jobs (id, user_id, team_id, model, provider, prompt, aspect, duration_s, input_asset_ids, status, output_asset_id, poster_asset_id, deleted_at)
     values ($1, 'u1', 'team-unassigned', 'm', 'fal', 'p', '9:16', 5, $2, 'succeeded', $3, $4, case when $5::int is null then null else now() - make_interval(days => $5::int) end)`,
    [id, inputs, `${id}-video`, `${id}-poster`, deletedDaysAgo],
  );
  await pool.query(`insert into verdicts (id, job_id, output_asset_id, verdict, marked_by) values ($1, $2, $3, 'pass', 'u1')`, [`v-${id}`, id, `${id}-video`]);
  for (const [kind, usd, isFinal] of [['estimate', '1.0000', false], ['actual_adjustment', '0.2500', true]] as const) {
    await pool.query(
      `insert into cost_entries (kind, usd, month, day, user_id, team_id, job_id, is_final) values ($1, $2, '2026-10', '2026-10-01', 'u1', 'team-unassigned', $3, $4)`,
      [kind, usd, id, isFinal],
    );
  }
}

describe('purgeDeletedClips', () => {
  test('purges a clip deleted over 30 days ago but keeps its job and ledger rows and any input a live clip still uses', async () => {
    await asset('in-shared', 'input');
    await asset('in-own', 'input');
    await asset('in-solo', 'input');
    await asset('in-other-live', 'input');
    await clip('old', ['in-shared', 'in-own', 'in-solo'], 31);
    await clip('live', ['in-shared'], null);
    await clip('recent', ['in-other-live'], 29);
    // A failed Run that still names the old clip's other input also keeps it.
    await pool.query(
      `insert into jobs (id, user_id, team_id, model, provider, prompt, aspect, duration_s, input_asset_ids, status) values ('failed', 'u1', 'team-unassigned', 'm', 'fal', 'p', '9:16', 5, '{in-own}', 'failed')`,
    );

    expect(await purgeDeletedClips(pool, deleteObject, log)).toBe(1);

    const job = (await pool.query(`select purged_at is not null as purged, output_asset_id, poster_asset_id, status from jobs where id = 'old'`)).rows[0];
    expect(job).toEqual({ purged: true, output_asset_id: null, poster_asset_id: null, status: 'succeeded' });
    expect((await pool.query(`select kind, usd::text, is_final from cost_entries where job_id = 'old' order by id`)).rows).toEqual([
      { kind: 'estimate', usd: '1.0000', is_final: false },
      { kind: 'actual_adjustment', usd: '0.2500', is_final: true },
    ]);
    expect((await pool.query(`select usd::text from job_costs where job_id = 'old'`)).rows).toEqual([{ usd: '1.2500' }]);
    // Gone: the video and poster of the old clip, and the input nothing else uses. Kept: the inputs a live clip or a failed Run names, the other clips, and every verdict (the old one loses its asset).
    expect((await pool.query(`select id from assets order by id`)).rows.map((r) => r.id)).toEqual([
      'in-other-live', 'in-own', 'in-shared', 'live-poster', 'live-video', 'recent-poster', 'recent-video',
    ]);
    expect((await pool.query(`select id, output_asset_id from verdicts order by id`)).rows).toEqual([
      { id: 'v-live', output_asset_id: 'live-video' },
      { id: 'v-old', output_asset_id: null },
      { id: 'v-recent', output_asset_id: 'recent-video' },
    ]);
    expect(await keys()).toEqual(['assets/in-other-live', 'assets/in-own', 'assets/in-shared', 'assets/live-poster', 'assets/live-video', 'assets/recent-poster', 'assets/recent-video']);
    expect((await pool.query(`select count(*)::int as n from jobs where purged_at is not null`)).rows[0].n).toBe(1);
    expect(logged).toEqual([]);
  });

  test('purges nothing the second time, and the recent clip once it is 30 days old', async () => {
    expect(await purgeDeletedClips(pool, deleteObject, log)).toBe(0);
    await pool.query(`update jobs set deleted_at = now() - interval '31 days' where id = 'recent'`);
    expect(await purgeDeletedClips(pool, deleteObject, log)).toBe(1);
    expect((await pool.query(`select id from assets order by id`)).rows.map((r) => r.id)).toEqual(['in-own', 'in-shared', 'live-poster', 'live-video']);
    expect((await pool.query(`select count(*)::int as n from jobs`)).rows[0].n).toBe(4);
  });

  test('logs a failing object delete and still purges the rows', async () => {
    await clip('broken', [], 40);
    const failing = async () => {
      throw new Error('minio is down');
    };
    expect(await purgeDeletedClips(pool, failing, log)).toBe(1);
    expect(logged.sort()).toEqual(['remove object assets/broken-poster', 'remove object assets/broken-video']);
    expect((await pool.query(`select purged_at is not null as purged from jobs where id = 'broken'`)).rows[0].purged).toBe(true);
  });
});
