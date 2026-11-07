// Migration 0075 on the real rows: of a pair of duplicate models one is offered (cheaper first, fal on a tie), the dearer one only while its twin cannot serve, and a job
// BytePlus refused for a real person can be sent once to the fal twin. Against a disposable database on the compose Postgres.
import { randomBytes } from 'node:crypto';
import { createTestDatabase } from '@cvs/db/testing';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';

const testDb = await createTestDatabase();
process.env.DATABASE_URL = testDb.url;
process.env.BETTER_AUTH_SECRET = randomBytes(32).toString('hex');
process.env.APP_URL = 'http://localhost';

const { auth, pool } = await import('@/lib/auth');
const { stopBoss } = await import('@/lib/queue');
const { forgetFalBalance } = await import('@/lib/provider-credit');
const { GET: videoModels } = await import('./route');
const { GET: imageModels } = await import('../image-models/route');
const { GET: listJobs, POST: postJob } = await import('../jobs/route');

const PASSWORD = 'correct-horse-battery';
const REAL_PERSON = 'BytePlus: InputImageSensitiveContentDetected.PrivacyInformation';
let cookie = '';
let userId = '';

const as = (path: string, init: RequestInit = {}) => new Request(`http://localhost${path}`, { ...init, headers: { cookie, 'content-type': 'application/json' } });
const video = async () => ((await (await videoModels(as('/api/models?ratio=9:16&durationSec=8'))).json()) as { models: { id: string }[] }).models.map((m) => m.id);
const image = async () => ((await (await imageModels(as('/api/image-models?feature=image'))).json()) as { models: { id: string }[] }).models.map((m) => m.id);
const only = (ids: string[]) => pool.query(`update model_configs set enabled = (id = any($1))`, [ids]);
const vertex = (project: string | null) => pool.query('update settings set vertex_active_project = $1 where id = 1', [project]);
const create = (body: unknown) => postJob(as('/api/jobs', { method: 'POST', body: JSON.stringify(body) }));
const newJob = (modelId: string) => create({ assetIds: ['img'], modelId, presetId: 'gentle-push-in', ratio: '9:16', durationSec: 8 });

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

describe('the image picker', () => {
  test('offers the cheaper Vertex row alone, and the fal row alone when the Vertex credits ended or the Vertex row is off', async () => {
    await only(['nano-banana-pro', 'nano-banana-pro-vertex']);
    await vertex('project-one');
    expect(await image()).toEqual(['nano-banana-pro-vertex']);

    await vertex(null); // the worker's credits guard found no usable account
    expect(await image()).toEqual(['nano-banana-pro']);

    await vertex('project-one');
    await only(['nano-banana-pro']); // the Admin switched the Vertex row off
    expect(await image()).toEqual(['nano-banana-pro']);
  });

  test('offers the BytePlus row alone while both are on, whatever the Vertex accounts say', async () => {
    await only(['seedream-5-pro', 'seedream-5-pro-byteplus']);
    await vertex(null);
    expect(await image()).toEqual(['seedream-5-pro-byteplus']);
  });
});

describe('the video picker', () => {
  test('offers Veo 3.1 on fal, with its Vertex twin only in place of it when fal is off or its balance cannot pay', async () => {
    await only(['veo-3.1', 'veo-3.1-vertex']);
    await vertex('project-one');
    expect(await video()).toEqual(['veo-3.1']);

    await only(['veo-3.1-vertex']); // fal's row switched off
    expect(await video()).toEqual(['veo-3.1-vertex']);

    await only(['veo-3.1', 'veo-3.1-vertex']);
    vi.stubGlobal('fetch', async (url: string) => (url.startsWith('https://api.fal.ai/v1/account/billing') ? Response.json({ credits: { current_balance: 0.5, currency: 'USD' } }) : new Response('unexpected', { status: 500 })));
    process.env.FAL_KEY = 'fal-fixture-value'; // a made-up value, never a real key
    forgetFalBalance();
    try {
      expect(await video()).toEqual(['veo-3.1-vertex']); // 8 s at $0.20 is 1.60, over fal's 0.50
      await vertex(null);
      expect(await video()).toEqual(['veo-3.1']); // Vertex cannot serve either: the fal row stays, locked by the picker
    } finally {
      vi.unstubAllGlobals();
      process.env.FAL_KEY = ''; // vitest.setup.ts
      forgetFalBalance();
    }
  });

  test('keeps the fal Omni row while the Vertex Omni row is off, and swaps to the Vertex row once it is on and an account can serve', async () => {
    await only(['gemini-omni-flash']);
    await vertex('project-one');
    expect(await video()).toEqual(['gemini-omni-flash']); // the owner has not enabled the Vertex row yet: nothing disappears from users
    await only(['gemini-omni-flash', 'gemini-omni-flash-vertex']);
    expect(await video()).toEqual(['gemini-omni-flash-vertex']);
    await vertex(null);
    expect(await video()).toEqual(['gemini-omni-flash']);
  });
});

describe('POST /api/jobs on a pair', () => {
  test('refuses the dearer row while its twin serves and the twin while it cannot, and creates nothing', async () => {
    await only(['gemini-omni-flash', 'gemini-omni-flash-vertex']);
    await vertex('project-one');
    const before = (await pool.query('select count(*)::int as n from jobs')).rows[0].n;
    const refused = await newJob('gemini-omni-flash');
    expect(refused.status).toBe(400);
    expect(await refused.json()).toEqual({ error: 'the model is not offered now: its duplicate twin serves in its place' });
    expect((await pool.query('select count(*)::int as n from jobs')).rows[0].n).toBe(before);
    expect((await newJob('gemini-omni-flash-vertex')).status).toBe(201);

    await vertex(null);
    expect((await newJob('gemini-omni-flash-vertex')).status).toBe(400);
    expect((await newJob('gemini-omni-flash')).status).toBe(201);
  });
});

describe('a job BytePlus refused for a real person', () => {
  const failed = async (id: string, error: string, model = 'seedance-1.0-pro-byteplus', provider = 'byteplus') => {
    await pool.query(
      `insert into jobs (id, user_id, team_id, model, provider, prompt, aspect, duration_s, input_asset_ids, status, error) values ($1, $2, 'team-unassigned', $3, $4, 'My own prompt.', '9:16', 5, '{img}', 'failed', $5)`,
      [id, userId, model, provider, error],
    );
  };
  const mine = async (id: string) => ((await (await listJobs(as('/api/jobs?mine'))).json()) as { jobs: { id: string; twin: unknown }[] }).jobs.find((j) => j.id === id)!;
  const retry = (id: string, extra: object = { onTwin: true }) => create({ retryOf: id, ...extra });

  test('offers its enabled fal twin with that run’s price, and runs it there once, as a retry booked on fal', async () => {
    await only(['seedance-1.0-pro', 'seedance-1.0-pro-byteplus']);
    await failed('rp-1', REAL_PERSON);
    expect((await mine('rp-1')).twin).toEqual({ label: 'Seedance 1.0 Pro', estimateUsd: '0.6200' }); // 5 s at $0.124
    const res = await retry('rp-1');
    expect(res.status).toBe(201);
    const { id } = (await res.json()) as { id: string };
    expect((await pool.query('select model, provider, retry_of, prompt from jobs where id = $1', [id])).rows[0]).toEqual({ model: 'seedance-1.0-pro', provider: 'fal', retry_of: 'rp-1', prompt: 'My own prompt.' });
    expect((await pool.query(`select usd::text as usd from cost_entries where job_id = $1 and kind = 'estimate'`, [id])).rows[0].usd).toBe('0.6200');
    expect((await mine('rp-1')).twin).toBeNull(); // retried now
    expect((await retry('rp-1')).status).toBe(409);
  });

  test('has no twin to offer when the twin is off, and refuses the twin run for any other failure', async () => {
    await only(['seedance-1.0-pro-byteplus']);
    await failed('rp-2', REAL_PERSON);
    expect((await mine('rp-2')).twin).toBeNull();
    expect((await retry('rp-2')).status).toBe(409);

    await only(['seedance-1.0-pro', 'seedance-1.0-pro-byteplus']);
    await failed('rp-3', 'BytePlus: InputImageSensitiveContentDetected.Violence');
    await failed('rp-4', 'the provider timed out');
    for (const id of ['rp-3', 'rp-4']) {
      expect((await mine(id)).twin, id).toBeNull();
      expect((await retry(id)).status, id).toBe(409);
    }
    expect((await create({ assetIds: ['img'], modelId: 'seedance-1.0-pro', onTwin: true })).status).toBe(400); // only a retry has a twin run
    expect((await retry('rp-4', { onTwin: 'yes' })).status).toBe(400);
  });

  test('keeps the plain retry on the same model for a job that was not refused, as before', async () => {
    await failed('rp-5', 'the provider timed out');
    const res = await retry('rp-5', {});
    expect(res.status).toBe(201);
    expect((await pool.query('select model, provider from jobs where retry_of = $1', ['rp-5'])).rows[0]).toEqual({ model: 'seedance-1.0-pro-byteplus', provider: 'byteplus' });
  });
});

describe('a pair that acts as one model (migration 0078)', () => {
  type Listed = { id: string; provider: string; durationsSec: number[]; estimateUsd: string; audioEstimateUsd: string | null; supported: boolean; videoRefs: unknown; audioClips: unknown };
  const listed = async (query: string) => ((await (await videoModels(as(`/api/models?${query}`))).json()) as { models: Listed[] }).models;
  const run = (durationSec: number) => create({ assetIds: ['img'], modelId: 'seedance-2.5-byteplus', presetId: 'gentle-push-in', ratio: '9:16', durationSec });
  const booked = async (res: Response) => {
    expect(res.status).toBe(201);
    const { id } = (await res.json()) as { id: string };
    return (await pool.query(`select j.model, j.provider, c.usd::text as usd from jobs j join cost_entries c on c.job_id = j.id and c.kind = 'estimate' where j.id = $1`, [id])).rows[0];
  };

  test('lists Seedance 2.5 once, with the fal row’s longer clips, reference video and audio, priced as the row that would run', async () => {
    await only(['seedance-2.5-byteplus', 'seedance-2.5-reference']);
    const [short] = await listed('ratio=9:16&durationSec=8');
    expect(short).toMatchObject({ id: 'seedance-2.5-byteplus', provider: 'byteplus', estimateUsd: '1.8496', supported: true }); // 8 s at $0.2312
    expect(short!.durationsSec.at(-1)).toBe(30);
    expect(short!.videoRefs).not.toBeNull();
    expect(short!.audioClips).not.toBeNull();
    const long = await listed('ratio=9:16&durationSec=20');
    expect(long).toEqual([expect.objectContaining({ id: 'seedance-2.5-byteplus', provider: 'fal', estimateUsd: '9.4600', supported: true })]); // 20 s at $0.473
    expect((await listed('feature=marketing&ratio=9:16&durationSec=8')).map((m) => m.id)).toEqual(['seedance-2.5-byteplus']);
  });

  test('runs a clip of up to 15 s on BytePlus and a longer one on the fal twin, and refuses the longer one while the twin is off', async () => {
    await only(['seedance-2.5-byteplus', 'seedance-2.5-reference']);
    expect(await booked(await run(8))).toEqual({ model: 'seedance-2.5-byteplus', provider: 'byteplus', usd: '1.8496' });
    expect(await booked(await run(20))).toEqual({ model: 'seedance-2.5-reference', provider: 'fal', usd: '9.4600' });
    // BytePlus is priced for the silent clip, so a clip with sound runs on fal, and the picker's audio price is fal's.
    expect((await listed('ratio=9:16&durationSec=8'))[0]).toMatchObject({ estimateUsd: '1.8496', audioEstimateUsd: '3.7840' });
    expect(await booked(await create({ assetIds: ['img'], modelId: 'seedance-2.5-byteplus', presetId: 'gentle-push-in', ratio: '9:16', durationSec: 8, params: { audio: 'on' } }))).toEqual({ model: 'seedance-2.5-reference', provider: 'fal', usd: '3.7840' });
    await only(['seedance-2.5-byteplus']);
    expect((await listed('ratio=9:16&durationSec=8'))[0]!.durationsSec.at(-1)).toBe(15);
    expect((await run(20)).status).toBe(400);
  });

  test('offers the twin of the job’s own feature to a job BytePlus refused for a real person', async () => {
    await only(['seedance-2.0-byteplus', 'seedance-2.0', 'seedance-2.0-reference']); // seedance-2.0 (fal) is a twin for Create Video only
    await pool.query(
      `insert into jobs (id, user_id, team_id, model, provider, prompt, aspect, duration_s, input_asset_ids, status, error, feature) values ('rp-m', $1, 'team-unassigned', 'seedance-2.0-byteplus', 'byteplus', 'p', '9:16', 5, '{img}', 'failed', $2, 'marketing')`,
      [userId, REAL_PERSON],
    );
    const jobs = ((await (await listJobs(as('/api/jobs?mine'))).json()) as { jobs: { id: string; twin: { label: string } | null }[] }).jobs;
    expect(jobs.find((j) => j.id === 'rp-m')!.twin).toMatchObject({ label: 'Seedance 2.0 Reference' });
  });
});
