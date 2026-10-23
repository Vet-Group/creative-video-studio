// The Run caps against a disposable database (needs the compose Postgres: `pnpm services:up`). The clock is the `at` argument; nothing sleeps.
import { bookShared, lateBill, reserve, withTransaction } from '@cvs/core/ledger';
import { checkCaps } from '@cvs/core/limits';
import { createPool } from '@cvs/db/client';
import { createTestDatabase } from '@cvs/db/testing';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

const testDb = await createTestDatabase();
const pool = createPool(testDb.url);

afterAll(async () => {
  await pool.end();
  await testDb.drop();
});

let seq = 0;
const next = (prefix: string) => `${prefix}${++seq}`;
const at = (iso: string) => new Date(iso);

beforeAll(async () => {
  await pool.query(`insert into teams (id, name) values ('team-b', 'Team B')`);
});

async function member(): Promise<string> {
  const id = next('user');
  await pool.query(`insert into users (id, email, name) values ($1, $1 || '@example.test', $1)`, [id]);
  return id;
}

async function newJob(userId: string, createdAt: string, o: { status?: string; estimate?: string } = {}): Promise<string> {
  const id = next('job');
  await pool.query(
    `insert into jobs (id, user_id, team_id, model, provider, prompt, aspect, duration_s, input_asset_ids, created_at)
     values ($1, $2, 'team-b', 'kling-o3-pro', 'fal', 'p', '9:16', 5, '{}', $3)`,
    [id, userId, createdAt],
  );
  if (o.estimate) await withTransaction(pool, (tx) => reserve(tx, id, o.estimate!));
  if (o.status) await pool.query('update jobs set status = $2 where id = $1', [id, o.status]);
  return id;
}

async function setCaps(monthlyUsd: string, dailyClips = 5) {
  await pool.query('update settings set monthly_cap_usd = $1, member_daily_clip_cap = $2', [monthlyUsd, dailyClips]);
}

describe('daily clips per Member (ICT day)', () => {
  test('the day ends at 00:00 ICT: 5 clips at 23:59 block until the next minute', async () => {
    const u = await member();
    for (let i = 0; i < 5; i++) await newJob(u, '2026-10-31T16:59:00Z'); // 23:59 ICT on 2026-10-31
    expect(await checkCaps(pool, u, '1.0000', at('2026-10-31T16:59:59Z'))).toBe('daily_clips');
    expect(await checkCaps(pool, u, '1.0000', at('2026-10-31T17:00:00Z'))).toBeNull(); // 00:00 ICT on 2026-11-01
  });

  test('the day starts at 00:00 ICT: a clip a second before midnight is yesterday', async () => {
    const u = await member();
    await newJob(u, '2026-10-30T16:59:59Z'); // 23:59:59 ICT on 2026-10-30
    for (let i = 0; i < 4; i++) await newJob(u, '2026-10-30T17:00:00Z'); // 00:00 ICT on 2026-10-31
    expect(await checkCaps(pool, u, '1.0000', at('2026-10-31T05:00:00Z'))).toBeNull(); // 4 today
    await newJob(u, '2026-10-31T01:00:00Z');
    expect(await checkCaps(pool, u, '1.0000', at('2026-10-31T05:00:00Z'))).toBe('daily_clips');
  });

  test('counts only the Member own clips, and frees the slot of a failed job that cost nothing', async () => {
    const u = await member();
    const other = await member();
    const jobs: string[] = [];
    for (let i = 0; i < 4; i++) jobs.push(await newJob(u, '2026-10-31T05:00:00Z', { estimate: '1.0000' }));
    for (let i = 0; i < 5; i++) await newJob(other, '2026-10-31T05:00:00Z');
    expect(await checkCaps(pool, u, '1.0000', at('2026-10-31T06:00:00Z'))).toBeNull();
    await newJob(u, '2026-10-31T05:00:00Z', { estimate: '1.0000', status: 'timed_out' }); // timed_out still counts
    expect(await checkCaps(pool, u, '1.0000', at('2026-10-31T06:00:00Z'))).toBe('daily_clips');
    await pool.query(`update jobs set status = 'failed' where id = $1`, [jobs[0]]);
    expect(await checkCaps(pool, u, '1.0000', at('2026-10-31T06:00:00Z'))).toBe('daily_clips'); // failed, but its estimate is still booked
    await pool.query(
      `insert into cost_entries (kind, usd, month, day, user_id, team_id, job_id, provider, model, is_final) select 'release', -usd, month, day, user_id, team_id, job_id, provider, model, true from cost_entries where job_id = $1`,
      [jobs[0]],
    );
    expect(await checkCaps(pool, u, '1.0000', at('2026-10-31T06:00:00Z'))).toBeNull(); // failed and total 0: the slot is back
  });
});

describe('monthly USD (ICT month)', () => {
  test('refuses an estimate that pushes the month over the cap, counting reservations, and allows exactly the cap', async () => {
    await setCaps('200');
    const u = await member();
    await newJob(u, '2027-03-15T05:00:00Z', { estimate: '199.5000', status: 'running' }); // a running job's reservation
    expect(await checkCaps(pool, u, '0.5001', at('2027-03-20T00:00:00Z'))).toBe('monthly_usd');
    expect(await checkCaps(pool, u, '0.5000', at('2027-03-20T00:00:00Z'))).toBeNull();
  });

  test('the month ends at 00:00 ICT: spend of August does not count in September', async () => {
    await setCaps('200');
    const u = await member();
    await newJob(u, '2027-08-15T05:00:00Z', { estimate: '199.5000', status: 'running' }); // its own reserve, in its own month
    expect(await checkCaps(pool, u, '1.0000', at('2027-08-31T16:59:59Z'))).toBe('monthly_usd'); // 23:59:59 ICT on 2027-08-31
    expect(await checkCaps(pool, u, '1.0000', at('2027-08-31T17:00:00Z'))).toBeNull(); // 00:00 ICT on 2027-09-01
  });

  test('a late bill written next month stays in the month of the Run', async () => {
    const u = await member();
    const id = await newJob(u, '2027-05-31T16:59:00Z', { estimate: '2.0000', status: 'timed_out' }); // 23:59 ICT on 2027-05-31
    expect(await lateBill(pool, id, 3.5)).toBe(true); // written now, long after
    expect((await pool.query(`select month, sum(usd)::text as usd from cost_entries where job_id = $1 group by month`, [id])).rows).toEqual([{ month: '2027-05', usd: '3.5000' }]);
    expect(await checkCaps(pool, u, '196.5000', at('2027-05-31T10:00:00Z'))).toBeNull(); // 3.5 + 196.5 = 200
    expect(await checkCaps(pool, u, '196.5001', at('2027-05-31T10:00:00Z'))).toBe('monthly_usd');
    expect(await checkCaps(pool, u, '200.0000', at('2027-06-02T00:00:00Z'))).toBeNull(); // nothing booked in June
  });

  test('sums 1,000 random entries exactly, against a BigInt reference in 1/10000 USD', async () => {
    let state = 12345;
    const rand = (n: number) => (state = (state * 1103515245 + 12345) % 2 ** 31) % n;
    let units = 0n;
    for (let i = 0; i < 1000; i++) {
      const u = rand(120_000_000) - 30_000_000; // -3000.0000 .. 9000.0000
      units += BigInt(u);
      const usd = `${u < 0 ? '-' : ''}${Math.floor(Math.abs(u) / 10_000)}.${String(Math.abs(u) % 10_000).padStart(4, '0')}`;
      await bookShared(pool, u < 0 || i % 2 ? { kind: 'manual_adjustment', usd, month: '2030-01', ref: `rand-${i}`, note: 'test' } : { kind: 'bakeoff', usd, month: '2030-01', provider: 'fal', ref: `rand-${i}` });
    }
    const text = (n: bigint) => `${n < 0n ? '-' : ''}${(n < 0n ? -n : n) / 10_000n}.${String((n < 0n ? -n : n) % 10_000n).padStart(4, '0')}`;
    const sum = text(units);
    expect((await pool.query(`select sum(usd)::text as usd from cost_entries where month = '2030-01'`)).rows[0].usd).toBe(sum);

    const u = await member();
    await setCaps(sum);
    expect(await checkCaps(pool, u, '0', at('2030-01-15T00:00:00Z'))).toBeNull();
    expect(await checkCaps(pool, u, '0.0001', at('2030-01-15T00:00:00Z'))).toBe('monthly_usd');
    await setCaps(text(units - 1n));
    expect(await checkCaps(pool, u, '0', at('2030-01-15T00:00:00Z'))).toBe('monthly_usd');
    await setCaps('200');
  });
});

describe('image and apps features', () => {
  async function featureJob(userId: string, feature: string, createdAt: string, estimate: string): Promise<string> {
    const id = next('job');
    await pool.query(
      `insert into jobs (id, user_id, team_id, model, provider, prompt, aspect, duration_s, input_asset_ids, created_at, feature)
       values ($1, $2, 'team-b', 'kling-o3-pro', 'fal', 'p', '1:1', 5, '{}', $3, $4)`,
      [id, userId, createdAt, feature],
    );
    await withTransaction(pool, (tx) => reserve(tx, id, estimate));
    return id;
  }
  async function setFeatureCaps(month: string, memberDay: string, memberMonth: string) {
    await pool.query('update settings set features_monthly_cap_usd = $1, member_daily_usd_cap = $2, member_monthly_usd_cap = $3', [month, memberDay, memberMonth]);
  }

  test('a member is refused once the ICT day reaches the daily USD cap, and the next ICT day starts fresh', async () => {
    await setFeatureCaps('260', '10', '50');
    const u = await member();
    await featureJob(u, 'image', '2031-01-10T03:00:00Z', '9.8500');
    expect(await checkCaps(pool, u, '0.1500', at('2031-01-10T16:59:59Z'), 'image')).toBeNull(); // 9.85 + 0.15 = 10
    expect(await checkCaps(pool, u, '0.1501', at('2031-01-10T16:59:59Z'), 'try_on')).toBe('member_daily_usd');
    expect(await checkCaps(pool, u, '0.1501', at('2031-01-10T17:00:00Z'), 'try_on')).toBeNull(); // 00:00 ICT on 2031-01-11
  });

  test('a member is refused once the ICT month reaches the monthly USD cap', async () => {
    await setFeatureCaps('260', '10', '50');
    const u = await member();
    for (const day of ['02', '05', '08', '11', '14']) await featureJob(u, 'reframe', `2031-02-${day}T03:00:00Z`, '9.9000'); // 49.50 over 5 days
    expect(await checkCaps(pool, u, '0.5000', at('2031-02-20T03:00:00Z'), 'reframe')).toBeNull();
    expect(await checkCaps(pool, u, '0.5001', at('2031-02-20T03:00:00Z'), 'reframe')).toBe('member_monthly_usd');
    expect(await checkCaps(pool, u, '1.0000', at('2031-03-01T03:00:00Z'), 'reframe')).toBeNull(); // a new month
  });

  test('the image and apps month is shared by every member, and video spend does not count against it', async () => {
    await setFeatureCaps('20', '1000', '1000');
    const [a, b] = [await member(), await member()];
    await featureJob(a, 'image', '2031-04-03T03:00:00Z', '12.0000');
    await featureJob(b, 'face_swap', '2031-04-04T03:00:00Z', '7.0000');
    await newJob(a, '2031-04-04T03:00:00Z', { estimate: '150.0000' }); // a video job
    expect(await checkCaps(pool, b, '1.0000', at('2031-04-05T03:00:00Z'), 'image')).toBeNull(); // 19 + 1 = 20
    expect(await checkCaps(pool, b, '1.0001', at('2031-04-05T03:00:00Z'), 'image')).toBe('features_monthly_usd');
    await setFeatureCaps('260', '10', '50');
  });

  test('image and apps spend does not count against the video month or the daily clips', async () => {
    await setCaps('5', 1);
    const u = await member();
    await featureJob(u, 'image_upscale', '2031-05-03T03:00:00Z', '9.0000');
    expect(await checkCaps(pool, u, '5.0000', at('2031-05-03T04:00:00Z'))).toBeNull(); // the 9 USD of upscales are not video
    await newJob(u, '2031-05-03T03:30:00Z', { estimate: '1.0000' });
    expect(await checkCaps(pool, u, '1.0000', at('2031-05-03T04:00:00Z'))).toBe('daily_clips');
    await setCaps('200');
  });

  test('soft caps never refuse a Run, even past 100 %', async () => {
    await setFeatureCaps('100000', '100000', '100000');
    const u = await member();
    await featureJob(u, 'face_swap', '2031-06-03T03:00:00Z', '6.0000'); // soft cap 5
    expect(await checkCaps(pool, u, '1.0000', at('2031-06-20T03:00:00Z'), 'face_swap')).toBeNull();
    await setFeatureCaps('260', '10', '50');
  });

  test('one member\'s spend does not count against another member\'s day or month', async () => {
    await setFeatureCaps('260', '10', '50');
    const [a, b] = [await member(), await member()];
    await featureJob(a, 'image', '2031-08-03T03:00:00Z', '10.0000');
    expect(await checkCaps(pool, a, '0.0001', at('2031-08-03T04:00:00Z'), 'image')).toBe('member_daily_usd');
    expect(await checkCaps(pool, b, '10.0000', at('2031-08-03T04:00:00Z'), 'image')).toBeNull();
  });

  test('shared ledger rows (no job) stay in the video month', async () => {
    await setFeatureCaps('5', '1000', '1000');
    await setCaps('1000');
    await bookShared(pool, { kind: 'bakeoff', usd: '50.0000', month: '2031-09', provider: 'fal', ref: 'shared-1' });
    const u = await member();
    expect(await checkCaps(pool, u, '5.0000', at('2031-09-10T03:00:00Z'), 'image')).toBeNull();
    await setCaps('50');
    expect(await checkCaps(pool, u, '0.0001', at('2031-09-10T03:00:00Z'))).toBe('monthly_usd');
    await setCaps('200');
    await setFeatureCaps('260', '10', '50');
  });
});
