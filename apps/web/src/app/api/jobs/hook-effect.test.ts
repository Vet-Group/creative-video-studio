// The hook effects app on the two 480p MiniMax H3 rows migration 0123 lists it on (enabled here, as they are on prod), against a disposable database on the compose Postgres.
// POST only queues a job: no key is set, so nothing reaches fal.
import { randomBytes } from 'node:crypto';
import { createTestDatabase } from '@cvs/db/testing';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';

vi.stubEnv('FAL_KEY', ''); // falBalance() must never read fal's real balance from a developer .env
const testDb = await createTestDatabase();
process.env.DATABASE_URL = testDb.url;
process.env.BETTER_AUTH_SECRET = randomBytes(32).toString('hex');
process.env.APP_URL = 'http://localhost';

const { auth, pool } = await import('@/lib/auth');
const { stopBoss } = await import('@/lib/queue');
const { dailyClips } = await import('@cvs/core/limits');
const { CAP_MESSAGES } = await import('@/lib/caps');
const { hookEffectPrompt } = await import('@/lib/apps');
const { GET: GET_LIST, POST } = await import('./route');
const { GET: GET_MODELS } = await import('../models/route');
const { GET: GET_JOB } = await import('./[id]/route');

const PASSWORD = 'correct-horse-battery';
const TURBO = 'minimax-h3-max-turbo-480p';
const REFERENCE = 'minimax-h3-max-reference-480p';
let cookie = '';
let userId = '';

const call = (path: string, method = 'GET', body?: unknown) =>
  new Request(`http://localhost${path}`, { method, headers: { cookie, 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
/** The body the page sends. */
const hook = (effect: string, over: Record<string, unknown> = {}) => ({
  feature: 'hook_effect', modelId: effect === 'box-burst' ? REFERENCE : TURBO, assetIds: ['img'], ratio: '9:16', durationSec: 5, prompt: hookEffectPrompt(effect), params: { effect, endAssetId: 'img' }, ...over,
});
const run = (body: Record<string, unknown>) => POST(call('/api/jobs', 'POST', body));
const errorOf = async (res: Response) => ((await res.json()) as { error: string }).error;
const models = async (query: string) => (await (await GET_MODELS(call(`/api/models?${query}`))).json()) as { models: { id: string; estimateUsd: string }[]; defaultModelId: string | null };
const picker = (effect: string) => models(`feature=hook_effect&effect=${effect}&ratio=9:16&durationSec=5&images=1&endFrame=1`);
const jobOf = async (id: string) => (await (await GET_JOB(call(`/api/jobs/${id}`), { params: Promise.resolve({ id }) })).json()) as Record<string, unknown>;
const estimateOf = async (id: string) => (await pool.query(`select usd::text from cost_entries where job_id = $1 and kind = 'estimate'`, [id])).rows[0].usd as string;

beforeAll(async () => {
  const { user } = await auth.api.createUser({ body: { email: 'member@example.test', name: 'Member', password: PASSWORD, role: 'member' } });
  userId = user.id;
  const res = await auth.api.signInEmail({ body: { email: 'member@example.test', password: PASSWORD }, asResponse: true });
  cookie = res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
  await pool.query(
    `insert into assets (id, owner_id, kind, s3_key, filename, mime, bytes, duration_ms, workspace_id) values
       ('img', $1, 'input', 'img', 'cap.jpg', 'image/jpeg', 1, null, 'ws_vet'),
       ('img2', $1, 'input', 'img2', 'b.png', 'image/png', 1, null, 'ws_vet'),
       ('vid', $1, 'input', 'vid', 'dance.mp4', 'video/mp4', 1, 5400, 'ws_vet')`,
    [user.id],
  );
  await pool.query(`update model_configs set enabled = true where id in ($1, $2)`, [TURBO, REFERENCE]);
  await pool.query(`update model_configs set enabled = false where id in ('veo-3.1', 'veo-3.1-vertex')`); // migration 0075 enables them; this file lists only its own models
});

afterAll(async () => {
  try {
    await stopBoss();
    await pool.end();
  } finally {
    await testDb.drop();
  }
});

describe('the hook effects picker', () => {
  test.each([['squish', TURBO, '0.1250'], ['melt', TURBO, '0.1250'], ['drop', TURBO, '0.1250'], ['box-burst', REFERENCE, '0.2500']])('%s lists only its own endpoint, priced for 5 s, and that row is the default', async (effect, id, usd) => {
    const r = await picker(effect);
    expect(r.models.map((m) => [m.id, m.estimateUsd])).toEqual([[id, usd]]);
    // The endpoint filter runs before the default is chosen: with both rows enabled, the other effect's row never becomes the default.
    expect(r.defaultModelId).toBe(id);
  });

  test('refuses a missing or unknown effect', async () => {
    expect((await GET_MODELS(call('/api/models?feature=hook_effect&ratio=9:16&durationSec=5'))).status).toBe(400);
    expect((await GET_MODELS(call('/api/models?feature=hook_effect&effect=confetti&ratio=9:16&durationSec=5'))).status).toBe(400);
  });
});

describe('POST /api/jobs for a hook effect', () => {
  test.each([['squish', '0.1250'], ['melt', '0.1250'], ['drop', '0.1250'], ['box-burst', '0.2500']])('queues the page\'s exact body for %s with the effect, its fixed prompt, the end frame and the reserve', async (effect, usd) => {
    const body = hook(effect);
    const res = await run(body);
    expect(res.status).toBe(201);
    const { id } = (await res.json()) as { id: string };
    const job = (await pool.query('select feature, model, prompt, aspect, duration_s, params, input_asset_ids from jobs where id = $1', [id])).rows[0];
    expect(job).toEqual({ feature: 'hook_effect', model: body.modelId, prompt: hookEffectPrompt(effect), aspect: '9:16', duration_s: 5, params: { effect, endAssetId: 'img' }, input_asset_ids: ['img'] });
    expect(await estimateOf(id)).toBe(usd);
    expect(await jobOf(id)).toMatchObject({ feature: 'hook_effect', effect, prompt: hookEffectPrompt(effect), ratio: '9:16', durationSec: 5 });
  });

  test('refuses, with 400 and never 500, an unknown or missing effect, another prompt, the wrong inputs, ratio or length, a missing or other end frame, other params, Enhance, the brand and a preset', async () => {
    const bad: [string, Record<string, unknown>][] = [
      ['an unknown effect', hook('confetti', { prompt: 'x' })],
      ['no effect', hook('squish', { params: { endAssetId: 'img' } })],
      ['another prompt', hook('squish', { prompt: 'make it fly' })],
      ['no prompt', hook('squish', { prompt: null })],
      ['the prompt of another effect', hook('squish', { prompt: hookEffectPrompt('melt') })],
      ['no image', hook('squish', { assetIds: [] })],
      ['two images', hook('squish', { assetIds: ['img', 'img2'] })],
      ['a video input', hook('squish', { assetIds: ['vid'], params: { effect: 'squish', endAssetId: 'vid' } })],
      ['a preset', hook('squish', { presetId: 'gentle-push-in', prompt: null })],
      ['ratio 1:1', hook('squish', { ratio: '1:1' })],
      ['6 seconds', hook('squish', { durationSec: 6 })],
      ['no end frame', hook('squish', { params: { effect: 'squish' } })],
      ['another end frame', hook('squish', { assetIds: ['img'], params: { effect: 'squish', endAssetId: 'img2' } })],
      ['audio', hook('squish', { params: { effect: 'squish', endAssetId: 'img', audio: 'on' } })],
      ['a batch', hook('squish', { params: { effect: 'squish', endAssetId: 'img', batch: '7d0e2f54-3c55-4a0e-9a59-2f3f0c8b1a11' } })],
      ['another key', hook('squish', { params: { effect: 'squish', endAssetId: 'img', hookText: 'x' } })],
      ['enhance', hook('squish', { enhance: true })],
      ['the brand', hook('squish', { useBrand: true })],
      ['a model that does not list the feature', hook('squish', { modelId: 'kling-o3-pro' })],
      ['the other effect\'s model', hook('squish', { modelId: REFERENCE })],
      ['the other effect\'s model, reversed', hook('box-burst', { modelId: TURBO })],
    ];
    // The hook checks' own words, so a case cannot pass on an unrelated 400.
    const said: Record<string, string> = {
      'an unknown effect': 'params.effect must be one of the hook effects',
      'no effect': 'params.effect must be one of the hook effects',
      'no end frame': 'params.endAssetId must be the product image: the clip ends on it',
      'another end frame': 'params.endAssetId must be the product image: the clip ends on it',
      "the other effect's model": 'the effect runs on its own model',
      "the other effect's model, reversed": 'the effect runs on its own model',
    };
    for (const [what, body] of bad) {
      const res = await run(body);
      expect(res.status, what).toBe(400);
      if (said[what]) expect(await errorOf(res), what).toBe(said[what]);
    }
    expect(await errorOf(await run(hook('squish', { modelId: REFERENCE })))).toBe('the effect runs on its own model');
    expect((await pool.query(`select count(*)::int as n from jobs where feature = 'hook_effect' and prompt = 'make it fly'`)).rows[0].n).toBe(0);
  });
});

describe('retry, rerun and read-back', () => {
  test('a retry of a failed hook job copies its params and passes the pin; the list and the job both carry the effect, null on other jobs', async () => {
    const { id } = (await (await run(hook('melt'))).json()) as { id: string };
    await pool.query(`update jobs set status = 'failed' where id = $1`, [id]);
    const res = await run({ retryOf: id });
    expect(res.status).toBe(201);
    const retry = (await res.json()) as { id: string };
    expect((await pool.query('select retry_of, params, model from jobs where id = $1', [retry.id])).rows[0]).toEqual({ retry_of: id, params: { effect: 'melt', endAssetId: 'img' }, model: TURBO });
    await pool.query(`insert into jobs (id, user_id, team_id, model, provider, prompt, aspect, duration_s, input_asset_ids, status, workspace_id) values ('plain-job', $1, 'team-unassigned', 'minimax-h3-max-turbo-480p', 'fal', 'p', '9:16', 5, '{}', 'succeeded', 'ws_vet')`, [userId]);
    const list = (await (await GET_LIST(call('/api/jobs?mine=1'))).json()) as { jobs: { id: string; effect: string | null }[] };
    expect(list.jobs.find((j) => j.id === id)?.effect).toBe('melt');
    expect(list.jobs.find((j) => j.id === 'plain-job')?.effect).toBeNull();
    expect((await jobOf('plain-job')).effect).toBeNull();
  });

  test('a rerun of a hook job made before its effect was reworded sends the effect\'s prompt as it is now', async () => {
    await pool.query(
      `insert into jobs (id, user_id, team_id, model, provider, prompt, aspect, duration_s, input_asset_ids, status, params, feature, workspace_id, output_asset_id)
       values ('old-words', $1, 'team-unassigned', $2, 'fal', 'old prompt', '9:16', 5, '{img}', 'succeeded', '{"effect":"drop","endAssetId":"img"}', 'hook_effect', 'ws_vet', 'img')`,
      [userId, TURBO],
    );
    const res = await run({ rerunOf: 'old-words', maxUsd: 10 });
    expect(res.status).toBe(201);
    const { id } = (await res.json()) as { id: string };
    expect((await jobOf(id)).prompt).toBe(hookEffectPrompt('drop'));
  });

  test('a retry or a rerun of a job whose effect is no longer offered is refused with 409, not 500', async () => {
    const seed = (id: string, status: string) =>
      pool.query(
        `insert into jobs (id, user_id, team_id, model, provider, prompt, aspect, duration_s, input_asset_ids, status, params, feature, workspace_id)
         values ($1, $2, 'team-unassigned', $3, 'fal', 'old prompt', '9:16', 5, '{img}', $4, '{"effect":"confetti","endAssetId":"img"}', 'hook_effect', 'ws_vet')`,
        [id, userId, TURBO, status],
      );
    await seed('gone-failed', 'failed');
    await seed('gone-succeeded', 'succeeded');
    const retry = await run({ retryOf: 'gone-failed' });
    expect([retry.status, await errorOf(retry)]).toEqual([409, 'this effect is no longer offered']);
    const rerun = await run({ rerunOf: 'gone-succeeded', maxUsd: 10 });
    expect([rerun.status, await errorOf(rerun)]).toEqual([409, 'this effect is no longer offered']);
  });
});

describe('the caps', () => {
  test('a hook clip is not a daily clip: a member at the daily clip cap still gets 201, and the count is unchanged', async () => {
    await pool.query(`update settings set member_daily_clip_cap = 1`);
    try {
      await pool.query(`insert into jobs (id, user_id, team_id, model, provider, prompt, aspect, duration_s, input_asset_ids, status, workspace_id) values ('today-clip', $1, 'team-unassigned', 'minimax-h3-max-turbo-480p', 'fal', 'p', '9:16', 5, '{}', 'succeeded', 'ws_vet')`, [userId]);
      const before = await dailyClips(pool, userId);
      expect(before.today).toBeGreaterThanOrEqual(1);
      expect((await run({ feature: 'video', modelId: 'kling-o3-pro', assetIds: ['img'], ratio: '9:16', durationSec: 8, prompt: 'p' })).status).toBe(429); // the cap is real
      expect((await run(hook('squish'))).status).toBe(201);
      expect(await dailyClips(pool, userId)).toEqual(before);
    } finally {
      await pool.query(`update settings set member_daily_clip_cap = 5`);
    }
  });

  test('a hook Run over the member daily USD cap is refused with 429 and the cap message', async () => {
    await pool.query(`update settings set member_daily_usd_cap = 0.0500`);
    try {
      const res = await run(hook('squish'));
      expect([res.status, await errorOf(res)]).toEqual([429, CAP_MESSAGES.member_daily_usd]);
    } finally {
      await pool.query(`update settings set member_daily_usd_cap = 10`);
    }
  });
});
