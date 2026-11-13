// Migration 0094 on the real rows: the ratios 21:9 and auto of Create Video, and Seedance 2.5 at 1080p. Against a disposable database on the compose Postgres.
import { randomBytes } from 'node:crypto';
import { createTestDatabase } from '@cvs/db/testing';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

const testDb = await createTestDatabase();
process.env.DATABASE_URL = testDb.url;
process.env.BETTER_AUTH_SECRET = randomBytes(32).toString('hex');
process.env.APP_URL = 'http://localhost';

const { auth, pool } = await import('@/lib/auth');
const { stopBoss } = await import('@/lib/queue');
const { GET: videoModels } = await import('./route');
const { GET: listJobs, POST: postJob } = await import('../jobs/route');

const PASSWORD = 'correct-horse-battery';
let cookie = '';
let userId = '';

const as = (path: string, init: RequestInit = {}) => new Request(`http://localhost${path}`, { ...init, headers: { cookie, 'content-type': 'application/json' } });
const only = (ids: string[]) => pool.query(`update model_configs set enabled = (id = any($1))`, [ids]);
const create = (body: unknown) => postJob(as('/api/jobs', { method: 'POST', body: JSON.stringify(body) }));

beforeAll(async () => {
  userId = (await auth.api.createUser({ body: { email: 'member@example.test', name: 'Member', password: PASSWORD, role: 'member' } })).user.id;
  const res = await auth.api.signInEmail({ body: { email: 'member@example.test', password: PASSWORD }, asResponse: true });
  cookie = res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
  await pool.query(`insert into assets (id, owner_id, kind, s3_key, filename, mime, bytes) values ('img', $1, 'input', 'img', 'a.png', 'image/png', 1)`, [userId]);
  await pool.query('update settings set member_daily_clip_cap = 1000, member_daily_usd_cap = 1000, member_monthly_usd_cap = 1000, monthly_cap_usd = 100000 where id = 1');
});

afterAll(async () => {
  await stopBoss();
  await pool.end();
  await testDb.drop();
});

type Listed = { id: string; ratios: string[]; resolution: string; estimateUsd: string; audioEstimateUsd: string | null; supported: boolean };
const listed = async (ratio: string, images: number) => {
  const res = await videoModels(as(`/api/models?feature=video&ratio=${ratio}&durationSec=5&images=${images}`));
  return { status: res.status, models: ((await res.json()) as { models?: Listed[] }).models ?? [] };
};
const supported = async (ratio: string, images: number) => (await listed(ratio, images)).models.filter((m) => m.supported).map((m) => m.id).sort();
const ON = ['seedance-2.5-image', 'seedance-2.5-image-1080p', 'seedance-2.5-reference', 'seedance-2.0', 'flux-3', 'kling-o3-pro', 'veo-3.1-vertex'];

describe('21:9 and auto on Create Video', () => {
  beforeAll(() => only(ON));

  test('21:9 is served by the rows whose schema takes it, with or without an image, and by no Kling or Veo row', async () => {
    expect(await supported('21:9', 1)).toEqual(['flux-3', 'seedance-2.0', 'seedance-2.5-reference']);
    expect(await supported('21:9', 0)).toEqual(['flux-3', 'seedance-2.0', 'seedance-2.5-reference']);
  });

  test('auto is served only for a Run with an image, by the image-to-video rows that follow it', async () => {
    expect(await supported('auto', 1)).toEqual(['flux-3', 'seedance-2.0', 'seedance-2.5-image', 'seedance-2.5-image-1080p']);
    expect(await supported('auto', 0)).toEqual([]);
  });

  test('a ratio no video schema lists is still refused', async () => {
    expect((await listed('5:4', 1)).status).toBe(400);
  });

  test('the Seedance 2.5 1080p row is its own entry at fal’s $1.164 a second, and 5 s of it estimate $5.82 beside $2.365 for the 720p row, with sound costing nothing more', async () => {
    const { models } = await listed('auto', 1);
    const row = (id: string) => models.find((m) => m.id === id)!;
    expect(row('seedance-2.5-image-1080p')).toMatchObject({ resolution: '1080p', estimateUsd: '5.8200', audioEstimateUsd: '5.8200' });
    expect(row('seedance-2.5-image')).toMatchObject({ resolution: '720p', estimateUsd: '2.3650', audioEstimateUsd: '2.3650' });
  });
});

describe('a Run asking for auto', () => {
  const run = (assetIds: string[], ratio: string, modelId = 'seedance-2.5-image-1080p') => create({ assetIds, modelId, prompt: 'a slow push-in', ratio, durationSec: 5 });

  test('needs an image, and books the 1080p row’s own price when it has one', async () => {
    await only(ON);
    const none = await run([], 'auto');
    expect(none.status).toBe(400);
    expect(((await none.json()) as { error: string }).error).toMatch(/auto follows the input image/);
    expect((await run(['img'], 'auto')).status).toBe(201);
    const { rows } = await pool.query(`select j.aspect, j.model, c.usd::text as usd from jobs j join cost_entries c on c.job_id = j.id and c.kind = 'estimate' where j.model = 'seedance-2.5-image-1080p'`);
    expect(rows).toEqual([{ aspect: 'auto', model: 'seedance-2.5-image-1080p', usd: '5.8200' }]);
  });

  test('is refused by a row that does not list it', async () => {
    expect((await run(['img'], 'auto', 'kling-o3-pro')).status).toBe(400);
  });
});
