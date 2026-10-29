// Create video's end frame and Run from the prompt alone on the rows the migrations seed (Kling O3 Pro takes both, Kling O1 neither), against a
// disposable database on the compose Postgres.
import { randomBytes } from 'node:crypto';
import { createTestDatabase } from '@cvs/db/testing';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

const testDb = await createTestDatabase();
process.env.DATABASE_URL = testDb.url;
process.env.BETTER_AUTH_SECRET = randomBytes(32).toString('hex');
process.env.APP_URL = 'http://localhost';

const { auth, pool } = await import('@/lib/auth');
const { stopBoss } = await import('@/lib/queue');
const { POST } = await import('./route');
const { GET: GET_MODELS } = await import('../models/route');

const PASSWORD = 'correct-horse-battery';
let cookie = '';

const call = (path: string, method = 'GET', body?: unknown) =>
  new Request(`http://localhost${path}`, { method, headers: { cookie, 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
const run = (body: Record<string, unknown>) => POST(call('/api/jobs', 'POST', { modelId: 'kling-o3-pro', prompt: 'a slow turn', ratio: '9:16', durationSec: 5, assetIds: ['img'], ...body }));
const errorOf = async (res: Response) => ((await res.json()) as { error: string }).error;

beforeAll(async () => {
  const { user } = await auth.api.createUser({ body: { email: 'member@example.test', name: 'Member', password: PASSWORD, role: 'member' } });
  const other = await auth.api.createUser({ body: { email: 'other@example.test', name: 'Other', password: PASSWORD, role: 'member' } });
  const res = await auth.api.signInEmail({ body: { email: 'member@example.test', password: PASSWORD }, asResponse: true });
  cookie = res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
  await pool.query(
    `insert into assets (id, owner_id, kind, s3_key, filename, mime, bytes, duration_ms) values
       ('img', $1, 'input', 'img', 'a.png', 'image/png', 1, null),
       ('end', $1, 'input', 'end', 'end.png', 'image/png', 1, null),
       ('vid', $1, 'input', 'vid', 'dance.mp4', 'video/mp4', 1, 5400),
       ('theirs', $2, 'input', 'theirs', 't.png', 'image/png', 1, null),
       ('c5a', $1, 'input', 'c5a', 'a.mp3', 'audio/mpeg', 1, 5000),
       ('c5b', $1, 'input', 'c5b', 'b.wav', 'audio/wav', 1, 5000),
       ('c5c', $1, 'input', 'c5c', 'c.mp3', 'audio/mpeg', 1, 5000),
       ('c2', $1, 'input', 'c2', 'd.mp3', 'audio/mpeg', 1, 2000),
       ('short', $1, 'input', 'short', 'e.mp3', 'audio/mpeg', 1, 1900),
       ('their-clip', $2, 'input', 'their-clip', 'f.mp3', 'audio/mpeg', 1, 5000)`,
    [user.id, other.user.id],
  );
  await pool.query(`update model_configs set enabled = true where id in ('kling-o3-pro', 'kling-o1')`);
  // The caps are not under test here, and this file queues more jobs than a day's 5 clips.
  await pool.query('update settings set member_daily_clip_cap = 1000, member_daily_usd_cap = 1000 where id = 1');
});

afterAll(async () => {
  await stopBoss();
  await pool.end();
  await testDb.drop();
});

describe('the end frame', () => {
  test('the Create picker says which models take one', async () => {
    const r = (await (await GET_MODELS(call('/api/models?feature=video&ratio=9:16&durationSec=5'))).json()) as { models: { id: string; endFrame: boolean }[] };
    expect(r.models.map((m) => [m.id, m.endFrame])).toEqual([['kling-o3-pro', true], ['kling-o1', false]]);
  });

  test('a Run keeps the caller’s own image as params.endAssetId, at the same estimate', async () => {
    const res = await run({ params: { audio: 'off', endAssetId: 'end' } });
    expect(res.status).toBe(201);
    const { id } = (await res.json()) as { id: string };
    expect((await pool.query('select params, input_asset_ids from jobs where id = $1', [id])).rows[0]).toEqual({ params: { audio: 'off', endAssetId: 'end' }, input_asset_ids: ['img'] });
    expect((await pool.query(`select usd::text from cost_entries where job_id = $1`, [id])).rows).toEqual([{ usd: '0.5600' }]);
    expect((await run({ params: { endAssetId: 'img' } })).status).toBe(201); // the first image again, for a clip that loops
  });

  test('the end frame may be the input itself, for a clip that loops', async () => {
    expect((await run({ params: { endAssetId: 'img' } })).status).toBe(201);
  });

  test('refuses an end frame that is not the caller’s own live image, or on a model without one', async () => {
    for (const endAssetId of ['theirs', 'vid', 'nope']) expect(await errorOf(await run({ params: { endAssetId } }))).toBe('params.endAssetId must be one of your own images');
    expect(await errorOf(await run({ params: { endAssetId: ['end'] } }))).toMatch(/as text/);
    expect(await errorOf(await run({ modelId: 'kling-o1', params: { endAssetId: 'end' } }))).toBe('the model does not take an end frame');
    expect(await errorOf(await run({ feature: 'marketing', assetIds: ['img', 'end'], params: { endAssetId: 'end' } }))).toMatch(/params may hold only/);
  });

  test('a retry is refused once its end frame was deleted', async () => {
    await pool.query(`insert into assets (id, owner_id, kind, s3_key, filename, mime, bytes) select 'end2', owner_id, 'input', 'end2', 'e.png', 'image/png', 1 from assets where id = 'img'`);
    const { id } = (await (await run({ params: { endAssetId: 'end2' } })).json()) as { id: string };
    await pool.query(`update jobs set status = 'failed' where id = $1`, [id]);
    await pool.query(`update assets set deleted_at = now() where id = 'end2'`);
    expect(await errorOf(await run({ retryOf: id }))).toBe('one or more assets were deleted');
  });
});

describe('a Run from the prompt alone', () => {
  test('the Create picker says which models take one', async () => {
    const r = (await (await GET_MODELS(call('/api/models?feature=video&ratio=9:16&durationSec=5'))).json()) as { models: { id: string; textOnly: boolean }[] };
    expect(r.models.map((m) => [m.id, m.textOnly])).toEqual([['kling-o3-pro', true], ['kling-o1', false]]);
  });

  test('queues a job with no input on a model with a text twin, at the row’s own estimate', async () => {
    const res = await run({ assetIds: [], params: { audio: 'on' } });
    expect(res.status).toBe(201);
    const { id } = (await res.json()) as { id: string };
    expect((await pool.query('select input_asset_ids, prompt, preset_id from jobs where id = $1', [id])).rows[0]).toEqual({ input_asset_ids: [], prompt: 'a slow turn', preset_id: null });
    expect((await pool.query(`select usd::text from cost_entries where job_id = $1`, [id])).rows).toEqual([{ usd: '0.7000' }]);
  });

  test('refuses no image on a model without a twin, with a preset, with an end frame, or without a prompt', async () => {
    expect(await errorOf(await run({ assetIds: [], modelId: 'kling-o1' }))).toBe('the model needs at least one input image');
    expect(await errorOf(await run({ assetIds: [], prompt: null, presetId: 'gentle-push-in' }))).toBe('a Run with no image takes a prompt, and no preset, end frame or audio');
    expect(await errorOf(await run({ assetIds: [], params: { endAssetId: 'end' } }))).toBe('a Run with no image takes a prompt, and no preset, end frame or audio');
    expect((await run({ assetIds: [], prompt: '   ' })).status).toBe(400);
    expect((await run({ assetIds: [], feature: 'marketing' })).status).toBe(400);
  });
});

describe('reference audio', () => {
  const ref20 = { modelId: 'seedance-2.0-reference' };
  beforeAll(async () => {
    await pool.query(`update model_configs set enabled = true where id in ('seedance-2.0-reference', 'seedance-2.5-reference')`);
  });

  test('the Create picker gives each model’s clip count and total length, null where it takes none', async () => {
    const r = (await (await GET_MODELS(call('/api/models?feature=video&ratio=9:16&durationSec=5'))).json()) as { models: { id: string; audioClips: unknown }[] };
    expect(Object.fromEntries(r.models.map((m) => [m.id, m.audioClips]))).toEqual({
      'kling-o3-pro': null, 'kling-o1': null, 'seedance-2.0-reference': { max: 3, seconds: 15 }, 'seedance-2.5-reference': { max: 10, seconds: 30 },
    });
  });

  test('a Run keeps the caller’s clips as params.audioAssetIds, at the same estimate', async () => {
    const res = await run({ ...ref20, params: { audioAssetIds: 'c5a,c5b,c5c' } });
    expect(res.status).toBe(201);
    const { id } = (await res.json()) as { id: string };
    expect((await pool.query('select params, input_asset_ids from jobs where id = $1', [id])).rows[0]).toEqual({ params: { audioAssetIds: 'c5a,c5b,c5c' }, input_asset_ids: ['img'] });
    expect((await pool.query(`select usd::text from cost_entries where job_id = $1`, [id])).rows).toEqual([{ usd: '1.8500' }]);
    expect((await run({ modelId: 'seedance-2.5-reference', params: { audioAssetIds: 'c5a,c5b,c5c,c2' } })).status).toBe(201); // 4 clips, 17 s: within Seedance 2.5's 10 and 30 s
  });

  test('refuses clips that are not the caller’s own audio, a short clip, too many or too long, a model without audio, and audio among the images', async () => {
    for (const audioAssetIds of ['their-clip', 'img', 'c5a,c5a', 'nope', '']) expect(await errorOf(await run({ ...ref20, params: { audioAssetIds } }))).toBe('params.audioAssetIds must list your own audio clips, separated by commas');
    expect(await errorOf(await run({ ...ref20, params: { audioAssetIds: 'c5a,short' } }))).toBe('each audio clip must last at least 2 seconds');
    expect(await errorOf(await run({ ...ref20, params: { audioAssetIds: 'c5a,c5b,c5c,c2' } }))).toBe('the model takes at most 3 audio clips, 15 seconds in all');
    await pool.query(`update assets set duration_ms = 5001 where id = 'c5c'`);
    try {
      expect(await errorOf(await run({ ...ref20, params: { audioAssetIds: 'c5a,c5b,c5c' } }))).toBe('the model takes at most 3 audio clips, 15 seconds in all');
    } finally {
      await pool.query(`update assets set duration_ms = 5000 where id = 'c5c'`);
    }
    expect(await errorOf(await run({ params: { audioAssetIds: 'c5a' } }))).toBe('the model does not take reference audio');
    expect(await errorOf(await run({ ...ref20, assetIds: ['img', 'c5a'] }))).toBe('an audio clip goes in params.audioAssetIds, not assetIds');
    expect(await errorOf(await run({ ...ref20, assetIds: [], params: { audioAssetIds: 'c5a' } }))).toBe('a Run with no image takes a prompt, and no preset, end frame or audio');
  });
});
