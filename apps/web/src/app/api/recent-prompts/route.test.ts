// Integration test of the recent prompts list against a disposable database on the compose Postgres (`pnpm services:up`).
import { randomBytes } from 'node:crypto';
import { createTestDatabase } from '@cvs/db/testing';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

const testDb = await createTestDatabase();
process.env.DATABASE_URL = testDb.url;
process.env.BETTER_AUTH_SECRET = randomBytes(32).toString('hex');
process.env.APP_URL = 'http://localhost';

const { auth, pool } = await import('@/lib/auth');
const { GET } = await import('./route');

const PASSWORD = 'correct-horse-battery';
const req = (path: string, cookie?: string) => new Request(`http://localhost${path}`, { headers: cookie ? { cookie } : {} });

async function newUser(email: string) {
  const id = (await auth.api.createUser({ body: { email, name: email, password: PASSWORD, role: 'member' } })).user.id;
  const res = await auth.api.signInEmail({ body: { email, password: PASSWORD }, asResponse: true });
  return { id, cookie: res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ') };
}

let seq = 0;
async function job(userId: string, feature: string, o: { prompt?: string; preset?: string; params?: Record<string, string>; deleted?: boolean } = {}) {
  seq++;
  await pool.query(
    `insert into jobs (id, user_id, team_id, feature, model, provider, preset_id, prompt, aspect, duration_s, params, input_asset_ids, status, created_at, deleted_at)
     values ($1, $2, 'team-unassigned', $3, 'recent-test', 'fal', $4, $5, '9:16', 8, $6, '{}', 'succeeded', now() + make_interval(secs => $7), case when $8 then now() end)`,
    [`job-${seq}`, userId, feature, o.preset ?? null, o.prompt ?? 'composed', JSON.stringify(o.params ?? {}), seq, o.deleted ?? false],
  );
}
const prompts = async (cookie: string, query: string) => ((await (await GET(req(`/api/recent-prompts?${query}`, cookie))).json()) as { prompts: string[] }).prompts;

let alice: Awaited<ReturnType<typeof newUser>>;
let bob: Awaited<ReturnType<typeof newUser>>;

beforeAll(async () => {
  await pool.query(`insert into model_configs (id, provider, endpoint, label, ratios, durations_sec, max_images, output_resolution, usd_per_second, sources, enabled) values ('recent-test', 'fal', 'x', 'Recent test', '{9:16}', '{8}', 2, '720p', 0.1, '{}', true)`);
  alice = await newUser('alice@example.test');
  bob = await newUser('bob@example.test');
});

afterAll(async () => {
  await pool.end();
  await testDb.drop();
});

describe('GET /api/recent-prompts', () => {
  test('lists own distinct words newest first, at most 10, per page; preset video prompts are not own words', async () => {
    await job(alice.id, 'video', { prompt: 'a dog runs' });
    await job(alice.id, 'video', { prompt: 'the preset text', preset: 'gentle-push-in' });
    await job(alice.id, 'video', { prompt: 'a cat sleeps' });
    await job(alice.id, 'video', { prompt: '  a dog runs ' }); // the same words again move to the top
    await job(alice.id, 'video', { prompt: 'deleted words', deleted: true });
    await job(bob.id, 'video', { prompt: 'bob words' });
    await job(alice.id, 'image', { prompt: 'an image prompt' });
    expect(await prompts(alice.cookie, 'feature=video')).toEqual(['a dog runs', 'a cat sleeps']);
    expect(await prompts(alice.cookie, 'feature=image')).toEqual(['an image prompt']);
    expect(await prompts(bob.cookie, 'feature=video')).toEqual(['bob words']);
    for (let i = 0; i < 12; i++) await job(alice.id, 'image', { prompt: `image ${i}` });
    expect(await prompts(alice.cookie, 'feature=image')).toEqual(Array.from({ length: 10 }, (_, i) => `image ${11 - i}`));
  });

  test('reads the kept brief on composed pages, splits Marketing by format and includes Motion Control prompts', async () => {
    await job(alice.id, 'try_on', { prompt: 'composed try-on', params: { brief: 'red dress' } });
    await job(alice.id, 'try_on', { prompt: 'server default' });
    await job(alice.id, 'marketing', { params: { brief: 'ugc brief' } });
    await job(alice.id, 'marketing', { params: { brief: 'advanced brief', format: 'advanced' } });
    await job(alice.id, 'motion_control', { prompt: 'dance on stage' });
    await job(alice.id, 'motion_control', { prompt: '' });
    expect(await prompts(alice.cookie, 'feature=try_on')).toEqual(['red dress']);
    expect(await prompts(alice.cookie, 'feature=marketing')).toEqual(['ugc brief']);
    expect(await prompts(alice.cookie, 'feature=marketing&format=advanced')).toEqual(['advanced brief']);
    expect(await prompts(alice.cookie, 'feature=motion_control')).toEqual(['dance on stage']);
  });

  test('checks the session and the query', async () => {
    expect((await GET(req('/api/recent-prompts?feature=video'))).status).toBe(401);
    expect((await GET(req('/api/recent-prompts', alice.cookie))).status).toBe(400);
    expect((await GET(req('/api/recent-prompts?feature=nope', alice.cookie))).status).toBe(400);
    expect((await GET(req('/api/recent-prompts?feature=marketing&format=ugc', alice.cookie))).status).toBe(400);
  });
});
