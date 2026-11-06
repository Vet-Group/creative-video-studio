// Marketing Studio Advanced's reference video (params.videoAssetId): who may name it, which models take it and within what limits, and the estimate that includes its
// billed seconds, against a disposable database on the compose Postgres.
import { randomBytes } from 'node:crypto';
import { videoInputs } from '@cvs/core/providers/fal';
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
const advanced = (body: Record<string, unknown> = {}) =>
  POST(call('/api/jobs', 'POST', { feature: 'marketing', modelId: 'seedance-2.0-reference', prompt: 'a creator walks', ratio: '9:16', durationSec: 5, assetIds: ['img'], ...body, params: { format: 'advanced', audio: 'off', videoAssetId: 'rv', ...(body.params as object) } }));
const errorOf = async (res: Response) => ((await res.json()) as { error: string }).error;
const estimateOf = async (res: Response) => {
  const { id } = (await res.json()) as { id: string };
  return (await pool.query(`select usd::text from cost_entries where job_id = $1`, [id])).rows[0].usd as string;
};

beforeAll(async () => {
  const { user } = await auth.api.createUser({ body: { email: 'member@example.test', name: 'Member', password: PASSWORD, role: 'member' } });
  const other = await auth.api.createUser({ body: { email: 'other@example.test', name: 'Other', password: PASSWORD, role: 'member' } });
  const res = await auth.api.signInEmail({ body: { email: 'member@example.test', password: PASSWORD }, asResponse: true });
  cookie = res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
  await pool.query(
    `insert into assets (id, owner_id, kind, s3_key, filename, mime, bytes, duration_ms) values
       ('img', $1, 'input', 'img', 'a.png', 'image/png', 1, null),
       ('img2', $1, 'input', 'img2', 'b.png', 'image/png', 1, null),
       ('img3', $1, 'input', 'img3', 'c.png', 'image/png', 1, null),
       ('img4', $1, 'input', 'img4', 'd.png', 'image/png', 1, null),
       ('img5', $1, 'input', 'img5', 'e.png', 'image/png', 1, null),
       ('rv', $1, 'input', 'rv', 'ref.mp4', 'video/mp4', 1000, 4200),
       ('rv-mov', $1, 'input', 'rv-mov', 'ref.mov', 'video/quicktime', 1000, 5000),
       ('rv-short', $1, 'input', 'rv-short', 's.mp4', 'video/mp4', 1000, 2500),
       ('rv-long', $1, 'input', 'rv-long', 'l.mp4', 'video/mp4', 1000, 20000),
       ('rv-big', $1, 'input', 'rv-big', 'b.mp4', 'video/mp4', 60000000, 5000),
       ('rv-theirs', $2, 'input', 'rv-theirs', 't.mp4', 'video/mp4', 1000, 5000),
       ('aud', $1, 'input', 'aud', 'a.mp3', 'audio/mpeg', 1, 5000)`,
    [user.id, other.user.id],
  );
  await pool.query(`update model_configs set enabled = true where id in ('kling-o3-pro', 'seedance-2.0-reference', 'seedance-2.5-reference')`);
  await pool.query('update settings set member_daily_clip_cap = 1000, member_daily_usd_cap = 1000 where id = 1');
});

afterAll(async () => {
  await stopBoss();
  await pool.end();
  await testDb.drop();
});

describe('the models API', () => {
  test('gives each model its reference video limits, and prices the Run with the clip’s seconds when videoSec is given', async () => {
    const get = async (q = '') => ((await (await GET_MODELS(call(`/api/models?feature=marketing&ratio=9:16&durationSec=5${q}`))).json()) as { models: { id: string; videoRefs: unknown; estimateUsd: string }[] }).models;
    const plain = Object.fromEntries((await get()).map((m) => [m.id, m]));
    expect(plain['seedance-2.0-reference']!.videoRefs).toEqual({ max: 1, minSec: 2, maxSec: 15, maxMb: 50, maxImages: null });
    expect(plain['kling-o3-pro']!.videoRefs).toEqual({ max: 1, minSec: 3, maxSec: 15, maxMb: 200, maxImages: 4 });
    const withVideo = Object.fromEntries((await get('&videoSec=5')).map((m) => [m.id, m]));
    expect(withVideo['seedance-2.0-reference']!.estimateUsd).toBe('2.2200'); // 0.222 x (5 + 5)
    expect(withVideo['kling-o3-pro']!.estimateUsd).toBe('0.8400'); // 0.168 x 5, the reference is not billed
    expect((await GET_MODELS(call('/api/models?feature=marketing&ratio=9:16&durationSec=5&videoSec=-1'))).status).toBe(400);
  });
});

describe('a Run with a reference video', () => {
  test('keeps the caller’s own clip as params.videoAssetId and books the estimate with its seconds, rounded up', async () => {
    const res = await advanced();
    expect(res.status).toBe(201);
    const { id } = (await res.json()) as { id: string };
    expect((await pool.query('select params, input_asset_ids from jobs where id = $1', [id])).rows[0]).toEqual({ params: { format: 'advanced', audio: 'off', videoAssetId: 'rv' }, input_asset_ids: ['img'] });
    expect((await pool.query(`select usd::text from cost_entries where job_id = $1`, [id])).rows[0].usd).toBe('2.2200'); // 4.2 s counts as 5: 0.222 x (5 + 5)
    expect(await estimateOf(await advanced({ modelId: 'seedance-2.5-reference', params: { videoAssetId: 'rv-mov' } }))).toBe('2.8380'); // 0.2838 x (5 + 5)
    expect(await estimateOf(await advanced({ modelId: 'kling-o3-pro', params: { videoAssetId: 'rv-mov', audio: 'on' } }))).toBe('0.8400'); // 0.168 x 5 with or without sound
  });

  test('is for Advanced and the caller’s own MP4 or MOV only', async () => {
    for (const videoAssetId of ['rv-theirs', 'img', 'aud', 'nope']) expect(await errorOf(await advanced({ params: { videoAssetId } }))).toBe('params.videoAssetId must be one of your own videos');
    const ugc = await POST(call('/api/jobs', 'POST', { feature: 'marketing', modelId: 'seedance-2.0-reference', prompt: 'p', ratio: '9:16', durationSec: 5, assetIds: ['img', 'img2'], params: { audio: 'off', videoAssetId: 'rv' } }));
    expect(await errorOf(ugc)).toBe('params.videoAssetId is for Advanced only');
    const video = await POST(call('/api/jobs', 'POST', { modelId: 'seedance-2.0-reference', prompt: 'p', ratio: '9:16', durationSec: 5, assetIds: ['img'], params: { videoAssetId: 'rv' } }));
    expect(video.status).toBe(400);
  });

  test('is refused on a model without one, outside the model’s length, over its size, or with too many images for Kling', async () => {
    const without = (await pool.query(`select id, endpoint from model_configs where 'marketing' = any(features) and kind = 'video'`)).rows.find((r) => !videoInputs(r.endpoint).videoRefs);
    expect(without).toBeDefined();
    await pool.query('update model_configs set enabled = true where id = $1', [without.id]);
    expect(await errorOf(await advanced({ modelId: without.id }))).toBe('the model does not take a reference video');
    expect(await errorOf(await advanced({ params: { videoAssetId: 'rv-long' } }))).toBe('the reference video must last 2 to 15 seconds on this model');
    expect(await errorOf(await advanced({ modelId: 'kling-o3-pro', params: { videoAssetId: 'rv-short' } }))).toBe('the reference video must last 3 to 15 seconds on this model');
    expect((await advanced({ modelId: 'seedance-2.0-reference', params: { videoAssetId: 'rv-short' } })).status).toBe(201); // 2.5 s is within Seedance 2.0's 2 to 15
    expect(await errorOf(await advanced({ params: { videoAssetId: 'rv-big' } }))).toBe('the reference video may be at most 50 MB on this model');
    const five = ['img', 'img2', 'img3', 'img4', 'img5'];
    expect(await errorOf(await advanced({ modelId: 'kling-o3-pro', assetIds: five }))).toBe('the model takes at most 4 images with a reference video');
    expect((await advanced({ modelId: 'kling-o3-pro', assetIds: five.slice(0, 4) })).status).toBe(201);
  });
});

describe('a retry', () => {
  test('keeps the clip and is refused once it was deleted', async () => {
    const { id } = (await (await advanced()).json()) as { id: string };
    await pool.query(`update jobs set status = 'failed' where id = $1`, [id]);
    await pool.query(`insert into assets (id, owner_id, kind, s3_key, filename, mime, bytes, duration_ms) select 'rv-gone', owner_id, 'input', 'rv-gone', 'g.mp4', 'video/mp4', 1000, 5000 from assets where id = 'rv'`);
    const second = (await (await advanced({ params: { videoAssetId: 'rv-gone' } })).json()) as { id: string };
    await pool.query(`update jobs set status = 'failed' where id = $1`, [second.id]);
    await pool.query(`update assets set deleted_at = now() where id = 'rv-gone'`);
    expect(await errorOf(await POST(call('/api/jobs', 'POST', { retryOf: second.id })))).toBe('one or more assets were deleted');
    expect(await estimateOf(await POST(call('/api/jobs', 'POST', { retryOf: id })))).toBe('2.2200');
  });
});
