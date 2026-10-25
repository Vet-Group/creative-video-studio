// M.6 on the rows migration 0013 seeds (Kling O3 Pro enabled with 7/10, Seedance 2.5 disabled with 6/9), against a disposable database on the compose Postgres.
import { randomBytes } from 'node:crypto';
import { createTestDatabase } from '@cvs/db/testing';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

const testDb = await createTestDatabase();
process.env.DATABASE_URL = testDb.url;
process.env.BETTER_AUTH_SECRET = randomBytes(32).toString('hex');
process.env.APP_URL = 'http://localhost';

const { auth, pool } = await import('@/lib/auth');
const { stopBoss } = await import('@/lib/queue');
const { GET } = await import('./route');
const { POST: POST_JOB } = await import('../jobs/route');
const { PUT: PUT_SETTINGS } = await import('../admin/settings/route');

const PASSWORD = 'correct-horse-battery';

async function newUser(email: string, role: 'member' | 'admin') {
  const id = (await auth.api.createUser({ body: { email, name: email, password: PASSWORD, role } })).user.id;
  const res = await auth.api.signInEmail({ body: { email, password: PASSWORD }, asResponse: true });
  return { id, cookie: res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ') };
}

const call = (cookie: string, path: string, method = 'GET', body?: unknown) =>
  new Request(`http://localhost${path}`, { method, headers: { cookie, 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
const picker = async (cookie: string) =>
  (await GET(call(cookie, '/api/models?ratio=9:16&durationSec=8'))).json() as Promise<{ models: { id: string; passRate: number | null; passes: number; total: number; estimateUsd: string; score: number; recommended: boolean }[]; defaultModelId: string | null }>;
const enabled = async (id: string) => (await pool.query('select enabled from model_configs where id = $1', [id])).rows[0].enabled as boolean;

let admin: Awaited<ReturnType<typeof newUser>>;
let member: Awaited<ReturnType<typeof newUser>>;

beforeAll(async () => {
  admin = await newUser('admin@example.test', 'admin');
  member = await newUser('member@example.test', 'member');
  await pool.query(`insert into assets (id, owner_id, kind, s3_key, filename, mime, bytes) values ('in-1', $1, 'input', 'in-1', 'a.png', 'image/png', 1)`, [member.id]);
});

afterAll(async () => {
  await stopBoss();
  await pool.end();
  await testDb.drop();
});

describe('the model picker', () => {
  test('lists the enabled models with rate and estimate, and hides a disabled one', async () => {
    const before = await picker(member.cookie);
    expect(before.models.map((m) => m.id)).toEqual(['kling-o3-pro']);
    expect(before).toMatchObject({ defaultModelId: 'kling-o3-pro', models: [{ passRate: 0.7, passes: 7, total: 10, estimateUsd: '0.8960' }] });

    await pool.query(`update model_configs set enabled = true where id = 'seedance-2.5'`);
    const both = await picker(member.cookie);
    expect(both.models.map((m) => [m.id, m.passes, m.total, m.estimateUsd])).toEqual([['kling-o3-pro', 7, 10, '0.8960'], ['seedance-2.5', 6, 9, '1.8496']]);
    expect(both.models[1]!.passRate).toBeCloseTo(6 / 9);
    expect(both.defaultModelId).toBe('kling-o3-pro'); // 70% against 67%
    expect(both.models.map((m) => [m.id, m.score, m.recommended])).toEqual([['kling-o3-pro', 64, true], ['seedance-2.5', 62, false]]);
    expect(before.models[0]!.recommended).toBe(false); // one model: nothing to recommend between
    await pool.query(`update model_configs set enabled = false where id = 'seedance-2.5'`);
  });

  test('real jobs that fail lower the score, so the badge and the pre-selection move to the other model; mock jobs do not count', async () => {
    await pool.query(`update model_configs set enabled = true where id = 'seedance-2.5'`);
    await pool.query(
      `insert into jobs (id, user_id, team_id, model, provider, prompt, aspect, duration_s, input_asset_ids, status, is_mock) values
         ('fail-1', $1, 'team-unassigned', 'kling-o3-pro', 'fal', 'p', '9:16', 8, '{}', 'failed', false),
         ('fail-2', $1, 'team-unassigned', 'kling-o3-pro', 'fal', 'p', '9:16', 8, '{}', 'timed_out', false),
         ('fail-mock', $1, 'team-unassigned', 'kling-o3-pro', 'fal', 'p', '9:16', 8, '{}', 'failed', true)`,
      [member.id],
    );
    const after = await picker(member.cookie);
    expect(after.models.map((m) => [m.id, m.score, m.recommended])).toEqual([['kling-o3-pro', 43, false], ['seedance-2.5', 62, true]]); // 9/14 x 4/6
    expect(after.defaultModelId).toBe('seedance-2.5');
    await pool.query(`delete from jobs where id in ('fail-1', 'fail-2', 'fail-mock')`);
    await pool.query(`update model_configs set enabled = false where id = 'seedance-2.5'`);
  });

  test('adds the marked clips of a model to its seed: (seed passes + marked passes) / (seed n + marked n)', async () => {
    await pool.query(
      `insert into jobs (id, user_id, team_id, model, provider, prompt, aspect, duration_s, input_asset_ids) values ('marked-1', $1, 'team-unassigned', 'kling-o3-pro', 'fal', 'p', '9:16', 8, '{}'), ('unmarked-1', $1, 'team-unassigned', 'kling-o3-pro', 'fal', 'p', '9:16', 8, '{}')`,
      [member.id],
    );
    await pool.query(`insert into verdicts (id, job_id, verdict, marked_by) values ('v-marked', 'marked-1', 'pass', $1)`, [member.id]);
    const kling = (await picker(member.cookie)).models[0]!;
    expect([kling.passes, kling.total]).toEqual([8, 11]); // the unmarked clip is left out
    expect(kling.passRate).toBeCloseTo(8 / 11);
  });
});

describe('a disabled model', () => {
  const job = (modelId: string) => POST_JOB(call(member.cookie, '/api/jobs', 'POST', { modelId, presetId: 'gentle-push-in', ratio: '9:16', durationSec: 8, assetIds: ['in-1'] }));

  test('is refused by the server when a Run names it, and accepted once enabled', async () => {
    const refused = await job('seedance-2.5');
    expect(refused.status).toBe(400);
    expect(((await refused.json()) as { error: string }).error).toMatch(/not enabled/);
    expect((await job('kling-o3-pro')).status).toBe(201);
  });
});

describe('PUT /api/admin/settings', () => {
  const put = (body: unknown) => PUT_SETTINGS(call(admin.cookie, '/api/admin/settings', 'PUT', body));

  test('enables a video model with no bake-off record, and one under 70% (Seedance 2.5, 6/9): the record only feeds the score; each change audited', async () => {
    await pool.query(
      `insert into model_configs (id, provider, endpoint, label, ratios, durations_sec, max_images, output_resolution, usd_per_second, sources)
       values ('new-model', 'fal', 'x', 'New model', '{9:16}', '{5}', 2, '720p', 0.2, '{}')`,
    );
    expect((await put({ models: [{ id: 'new-model', enabled: true }, { id: 'seedance-2.5', enabled: true }] })).status).toBe(200);
    expect([await enabled('new-model'), await enabled('seedance-2.5')]).toEqual([true, true]);
    const audits = (await pool.query(`select count(*)::int as n from audit_entries where action = 'model.set_enabled'`)).rows[0].n;
    expect(audits).toBe(2);
    await put({ models: [{ id: 'new-model', enabled: false }, { id: 'seedance-2.5', enabled: false }] });
  });

  test('still refuses a model whose price is not recorded, and changes nothing', async () => {
    await pool.query(`update model_configs set usd_per_second = null where id = 'new-model'`);
    const res = await put({ monthlyCapUsd: 999, models: [{ id: 'new-model', enabled: true }] });
    expect([res.status, await enabled('new-model')]).toEqual([400, false]);
    expect((await pool.query('select monthly_cap_usd::text as cap from settings')).rows[0].cap).toBe('200.0000');
  });
});
