// Motion Control on the rows migration 0019 seeds (Kling V3 Motion Control Pro and Standard, disabled), against a disposable database on the compose Postgres.
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
const { GET: GET_JOB } = await import('./[id]/route');

const PASSWORD = 'correct-horse-battery';
let cookie = '';

const call = (path: string, method = 'GET', body?: unknown) =>
  new Request(`http://localhost${path}`, { method, headers: { cookie, 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
const run = (body: Record<string, unknown>) => POST(call('/api/jobs', 'POST', { feature: 'motion_control', modelId: 'kling-v3-motion-pro', ratio: 'auto', ...body }));
const orientationOf = async (job: string) => ((await (await GET_JOB(call(`/api/jobs/${job}`), { params: Promise.resolve({ id: job }) })).json()) as { orientation: string | null }).orientation; // what Reuse refills
const errorOf = async (res: Response) => ((await res.json()) as { error: string }).error;

beforeAll(async () => {
  const { user } = await auth.api.createUser({ body: { email: 'member@example.test', name: 'Member', password: PASSWORD, role: 'member' } });
  const res = await auth.api.signInEmail({ body: { email: 'member@example.test', password: PASSWORD }, asResponse: true });
  cookie = res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
  await pool.query(
    `insert into assets (id, owner_id, kind, s3_key, filename, mime, bytes, duration_ms) values
       ('img', $1, 'input', 'img', 'a.png', 'image/png', 1, null),
       ('img2', $1, 'input', 'img2', 'b.png', 'image/png', 1, null),
       ('vid', $1, 'input', 'vid', 'dance.mp4', 'video/mp4', 1, 5400),
       ('mid', $1, 'input', 'mid', 'mid.mp4', 'video/mp4', 1, 12000),
       ('long', $1, 'input', 'long', 'long.mp4', 'video/mp4', 1, 30500)`,
    [user.id],
  );
  await pool.query(`update model_configs set enabled = true where id in ('kling-v3-motion-pro', 'kling-v3-motion-standard', 'kling-o3-pro')`);
  await pool.query(`update model_configs set enabled = false where id in ('veo-3.1', 'veo-3.1-vertex')`); // migration 0075 enables them; this file lists only its own models
});

afterAll(async () => {
  await stopBoss();
  await pool.end();
  await testDb.drop();
});

describe('the Motion Control picker', () => {
  test('lists the two Motion Control models for ratio auto, priced by the second, and keeps them out of the Create picker', async () => {
    const motion = (await (await GET_MODELS(call('/api/models?feature=motion_control&ratio=auto&durationSec=6'))).json()) as { models: { id: string; estimateUsd: string }[] };
    expect(motion.models.map((m) => [m.id, m.estimateUsd])).toEqual([['kling-v3-motion-pro', '1.0080'], ['kling-v3-motion-standard', '0.7560']]);
    const create = (await (await GET_MODELS(call('/api/models?feature=video&ratio=9:16&durationSec=8'))).json()) as { models: { id: string }[] };
    expect(create.models.map((m) => m.id)).toEqual(['kling-o3-pro']);
  });
});

describe('POST /api/jobs for Motion Control', () => {
  test('queues the image and the video, with the video length rounded up as the duration, no prompt and its estimate', async () => {
    const res = await run({ assetIds: ['img', 'vid'], durationSec: 1 });
    expect(res.status).toBe(201);
    const { id } = (await res.json()) as { id: string };
    const job = (await pool.query('select feature, aspect, duration_s, prompt, input_asset_ids from jobs where id = $1', [id])).rows[0];
    expect(job).toEqual({ feature: 'motion_control', aspect: 'auto', duration_s: 6, prompt: '', input_asset_ids: ['img', 'vid'] });
    expect((await pool.query(`select usd::text from cost_entries where job_id = $1 and kind = 'estimate'`, [id])).rows[0].usd).toBe('1.0080');
  });

  test('keeps a written prompt', async () => {
    const res = await run({ assetIds: ['img', 'vid'], prompt: '  a dancer on a stage ' });
    expect(res.status).toBe(201);
    const { id } = (await res.json()) as { id: string };
    expect((await pool.query('select prompt from jobs where id = $1', [id])).rows[0].prompt).toBe('a dancer on a stage');
    expect(await orientationOf(id)).toBeNull(); // a job made without the option reuses with none: the form's default, video
  });

  test('refuses the wrong inputs: a video first, two images, one input, a preset, or a video longer than the model allows', async () => {
    expect(await errorOf(await run({ assetIds: ['vid', 'img'] }))).toBe('Motion Control needs the character image first, then the reference video');
    expect(await errorOf(await run({ assetIds: ['img', 'img2'] }))).toBe('Motion Control needs the character image first, then the reference video');
    expect((await run({ assetIds: ['img'] })).status).toBe(400);
    expect((await run({ assetIds: ['img', 'vid'], presetId: 'gentle-push-in' })).status).toBe(400);
    expect(await errorOf(await run({ assetIds: ['img', 'long'] }))).toBe('the model does not allow this ratio, duration or number of images'); // 31 s
    expect((await run({ assetIds: ['img', 'vid'], ratio: '9:16' })).status).toBe(400);
  });

  test('stores the orientation of the image on a reference of at most 10 s, at the same price per second as the video orientation', async () => {
    const image = await run({ assetIds: ['img', 'vid'], params: { orientation: 'image' } });
    expect(image.status).toBe(201);
    const { id } = (await image.json()) as { id: string };
    expect((await pool.query('select params from jobs where id = $1', [id])).rows[0].params).toEqual({ orientation: 'image' });
    const video = (await (await run({ assetIds: ['img', 'vid'], params: { orientation: 'video' } })).json()) as { id: string };
    const usd = async (job: string) => (await pool.query(`select usd::text from cost_entries where job_id = $1 and kind = 'estimate'`, [job])).rows[0].usd;
    expect(await usd(id)).toBe('1.0080'); // 6 s, as the video orientation
    expect(await usd(video.id)).toBe('1.0080');
    expect([await orientationOf(id), await orientationOf(video.id)]).toEqual(['image', 'video']); // Reuse brings the choice back
  });

  test('refuses the orientation of the image on a reference over 10 s, while the video orientation takes it', async () => {
    expect(await errorOf(await run({ assetIds: ['img', 'mid'], params: { orientation: 'image' } }))).toBe('with the orientation of the image the reference video may last at most 10 seconds');
    expect((await run({ assetIds: ['img', 'mid'], params: { orientation: 'video' } })).status).toBe(201);
    expect((await run({ assetIds: ['img', 'mid'] })).status).toBe(201); // no orientation: the default, video
  });

  test('refuses an orientation that is neither video nor image', async () => {
    expect(await errorOf(await run({ assetIds: ['img', 'vid'], params: { orientation: 'left' } }))).toBe('params.orientation must be video or image');
  });

  test('no other feature takes a video input', async () => {
    const res = await POST(call('/api/jobs', 'POST', { feature: 'video', modelId: 'kling-o3-pro', assetIds: ['img', 'vid'], presetId: 'gentle-push-in', ratio: '9:16', durationSec: 8 }));
    expect(await errorOf(res)).toBe('only Motion Control takes a video input');
  });
});
