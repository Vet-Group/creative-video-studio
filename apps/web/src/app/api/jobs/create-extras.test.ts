// Create video's end frame on the rows the migrations seed (Kling O3 Pro takes one, Kling O1 does not), against a disposable database on the compose Postgres.
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
       ('theirs', $2, 'input', 'theirs', 't.png', 'image/png', 1, null)`,
    [user.id, other.user.id],
  );
  await pool.query(`update model_configs set enabled = true where id in ('kling-o3-pro', 'kling-o1')`);
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
