// Integration test of the image-model picker API against a disposable database on the compose Postgres (`pnpm services:up`).
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
let memberCookie = '';
let adminCookie = '';

async function newUser(email: string, role: 'member' | 'admin') {
  await auth.api.createUser({ body: { email, name: email, password: PASSWORD, role } });
  const res = await auth.api.signInEmail({ body: { email, password: PASSWORD }, asResponse: true });
  return res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
}
const call = (cookie: string | undefined, query: string) => GET(new Request(`http://localhost/api/image-models${query}`, { headers: cookie ? { cookie } : {} }));
type Model = { id: string; label: string; isMock: boolean; ratios: string[]; resolutions: string[]; prices: Record<string, string>; maxImages: number; maxPromptChars: number; textToImage: boolean; thinking: string[]; thinkingPrices: Record<string, Record<string, string>>; score: number; recommended: boolean; isNew: boolean; creditShown: boolean; typicalSec: { p50: number; p75: number } | null };
const list = async (feature: string, cookie = memberCookie) => ((await (await call(cookie, `?feature=${feature}`)).json()) as { models: Model[] }).models;
const setEnabled = (id: string, enabled: boolean) => pool.query('update model_configs set enabled = $2 where id = $1', [id, enabled]);

beforeAll(async () => {
  memberCookie = await newUser('member@example.test', 'member');
  adminCookie = await newUser('admin@example.test', 'admin');
  await pool.query(
    `insert into model_configs (id, provider, endpoint, label, kind, features, ratios, durations_sec, max_images, image_prices, sources, enabled, max_prompt_chars) values
       ('t-both', 'fal', 'x', 'B both', 'image', '{image,try_on}', '{auto,1:1}', '{}', 4, '{"1K": "0.1500", "2K": "0.3000"}', '{}', true, 50000),
       ('t-image', 'fal', 'fal-ai/nano-banana/edit', 'A image only', 'image', '{image}', '{auto}', '{}', 2, '{"1K": "0.04"}', '{}', true, 2000),
       ('t-tryon', 'fal', 'x', 'C try-on only', 'image', '{try_on}', '{auto}', '{}', 2, '{"1K": "0.075"}', '{}', true, 2000),
       ('t-mock', 'mock', 'mock', 'D mock', 'image', '{image,try_on}', '{auto,3:4}', '{}', 4, '{"1K": "0.1500"}', '{}', true, 4096),
       ('t-off', 'fal', 'x', 'E disabled', 'image', '{image,try_on}', '{auto}', '{}', 4, '{"1K": "0.1"}', '{}', false, 2000)`,
  );
  await pool.query(`update model_configs set thinking_levels = '{minimal,medium,high}', thinking_prices = '{"minimal": {"1K": "0.15", "2K": "0.3"}, "high": {"1K": "0.2318", "2K": "0.394"}}' where id = 't-both'`);
  await pool.query(
    `insert into model_configs (id, provider, endpoint, label, kind, features, ratios, durations_sec, max_images, output_resolution, usd_per_second, sources, enabled)
     values ('t-video', 'fal', 'x', 'F video', 'video', '{video,image}', '{9:16}', '{5}', 4, '720p', 0.1, '{}', true)`,
  );
});

afterAll(async () => {
  try {
    await pool.end();
  } finally {
    await testDb.drop();
  }
});

describe('GET /api/image-models', () => {
  test('answers 401 without a session, and 400 without an image feature', async () => {
    expect((await call(undefined, '?feature=image')).status).toBe(401);
    for (const q of ['', '?feature=', '?feature=video', '?feature=marketing', '?feature=nope']) expect((await call(memberCookie, q)).status, q).toBe(400);
  });

  test('lists the enabled image models of a feature, by label, with ratios, resolutions, prices, the image limit and the thinking levels with their prices (a level without its own at image_prices)', async () => {
    const unscored = { passRate: null, reliability: 1, score: 50, passes: 0, total: 0, recommended: false }; // equal scores: no badge
    expect(await list('image')).toEqual([
      { id: 't-image', label: 'A image only', provider: 'fal', isMock: false, ratios: ['auto'], resolutions: ['1K'], prices: { '1K': '0.0400' }, maxImages: 2, maxPromptChars: 2000, textToImage: true, thinking: [], thinkingPrices: {}, isNew: true, creditUsd: null, creditShown: false, typicalSec: null, ...unscored }, // its endpoint has a text-to-image twin
      { id: 't-both', label: 'B both', provider: 'fal', isMock: false, ratios: ['auto', '1:1'], resolutions: ['1K', '2K'], prices: { '1K': '0.1500', '2K': '0.3000' }, maxImages: 4, maxPromptChars: 5000, textToImage: false, thinking: ['minimal', 'medium', 'high'],
        thinkingPrices: { minimal: { '1K': '0.1500', '2K': '0.3000' }, medium: { '1K': '0.1500', '2K': '0.3000' }, high: { '1K': '0.2318', '2K': '0.3940' } }, isNew: true, creditUsd: null, creditShown: false, typicalSec: null, ...unscored }, // 50000 in its schema, under the ceiling
      { id: 't-mock', label: 'D mock', provider: 'mock', isMock: true, ratios: ['auto', '3:4'], resolutions: ['1K'], prices: { '1K': '0.0000' }, maxImages: 4, maxPromptChars: 4096, textToImage: true, thinking: [], thinkingPrices: {}, isNew: true, creditUsd: null, creditShown: false, typicalSec: null, ...unscored },
    ]);
    expect((await list('try_on')).map((m) => m.id)).toEqual(['t-both', 't-tryon', 't-mock']);
  });

  test('leaves out a disabled model and a video model, and shows an Admin the same list', async () => {
    expect((await list('image')).map((m) => m.id)).not.toContain('t-off');
    expect((await list('image')).map((m) => m.id)).not.toContain('t-video');
    await setEnabled('t-off', true);
    try {
      expect((await list('try_on', adminCookie)).map((m) => m.id)).toContain('t-off');
    } finally {
      await setEnabled('t-off', false);
    }
    expect((await list('try_on', adminCookie)).map((m) => m.id)).not.toContain('t-off');
    expect((await list('image', adminCookie)).every((m) => m.creditShown)).toBe(true); // only an Admin sees a locked model's provider balance
  });

  test('scores each model per feature from its prior and the marks of that feature, and badges the one that beats the rest', async () => {
    await pool.query(`update model_configs set pass_seed_passes = 8, pass_seed_total = 10 where id = 't-both'`);
    const memberId = (await pool.query(`select id from users where email = 'member@example.test'`)).rows[0].id;
    await pool.query(
      `insert into jobs (id, user_id, team_id, feature, model, provider, prompt, aspect, duration_s, input_asset_ids, status, workspace_id)
       values ('img-1', $1, 'team-unassigned', 'image', 't-both', 'fal', 'p', 'auto', 0, '{}', 'succeeded', 'ws_vet')`,
      [memberId],
    );
    await pool.query(`insert into verdicts (id, job_id, verdict, fault, marked_by) values ('v-img-1', 'img-1', 'fail', 'other', $1)`, [memberId]);
    try {
      const score = async (feature: string) => (await list(feature)).map((m) => [m.id, m.score, m.recommended]);
      expect(await score('image')).toEqual([['t-image', 50, false], ['t-both', 67, true], ['t-mock', 50, false]]); // (8 + 0 + 2) / (10 + 1 + 4)
      expect(await score('try_on')).toEqual([['t-both', 71, true], ['t-tryon', 50, false], ['t-mock', 50, false]]); // the image mark does not count here
    } finally {
      await pool.query(`delete from verdicts where id = 'v-img-1'`);
      await pool.query(`delete from jobs where id = 'img-1'`);
      await pool.query(`update model_configs set pass_seed_passes = null, pass_seed_total = null where id = 't-both'`);
    }
  });

  test('recommends the best Vertex model of Create Image while the active Vertex account runs on credits alone, and nothing changes otherwise', async () => {
    await pool.query(`update model_configs set pass_seed_passes = 8, pass_seed_total = 10 where id = 't-both'`);
    await pool.query(
      `insert into model_configs (id, provider, endpoint, label, kind, features, ratios, durations_sec, max_images, image_prices, sources, enabled, max_prompt_chars)
       values ('t-vertex', 'vertex', 'x', 'G vertex', 'image', '{image,try_on}', '{auto}', '{}', 2, '{"1K": "0.1000"}', '{}', true, 2000)`,
    );
    await pool.query(`insert into vertex_accounts (project_id, stop_when_credits_end) values ('t-paid', false)`);
    const recommended = async (project: string | null, feature = 'image') => {
      await pool.query('update settings set vertex_active_project = $1 where id = 1', [project]);
      return (await list(feature)).find((m) => m.recommended)?.id;
    };
    try {
      expect(await recommended(null)).toBe('t-both'); // 67 against the 50 of t-vertex
      expect(await recommended('t-paid')).toBe('t-both'); // an account that may bill money
      expect(await recommended('cvs-vertex')).toBe('t-vertex'); // credits only, though it scores less
      expect(await recommended('cvs-vertex', 'try_on')).toBe('t-both'); // Create Image only
    } finally {
      await pool.query('update settings set vertex_active_project = null where id = 1');
      await pool.query(`delete from vertex_accounts where project_id = 't-paid'`);
      await pool.query(`delete from model_configs where id = 't-vertex'`);
      await pool.query(`update model_configs set pass_seed_passes = null, pass_seed_total = null where id = 't-both'`);
    }
  });

  test("gives a model its usual run time from its latest succeeded real jobs of the feature, any member's, once it has three", async () => {
    const memberId = (await pool.query(`select id from users where email = 'member@example.test'`)).rows[0].id;
    // Run times of 60, 120, 180 and 600 s (one queued 5 minutes first, which does not count), a failed job and a try-on job that do not count either.
    const job = (id: string, secs: number, o: { status?: string; feature?: string; queued?: number } = {}) =>
      pool.query(
        `insert into jobs (id, user_id, team_id, feature, model, provider, prompt, aspect, duration_s, input_asset_ids, status, workspace_id, created_at, started_at, finished_at)
         values ($1, $2, 'team-unassigned', $3, 't-both', 'fal', 'p', 'auto', 0, '{}', $4, 'ws_vet', now() - make_interval(secs => $5::float8 + $6::float8), now() - make_interval(secs => $5::float8), now())`,
        [id, memberId, o.feature ?? 'image', o.status ?? 'succeeded', secs, o.queued ?? 0],
      );
    const wait = async () => (await list('image')).find((m) => m.id === 't-both')!.typicalSec;
    try {
      await job('rt-1', 60);
      await job('rt-2', 120, { queued: 300 });
      expect(await wait()).toBeNull(); // two runs say nothing yet
      await job('rt-3', 180);
      await job('rt-4', 600);
      await job('rt-5', 5000, { status: 'failed' });
      await job('rt-6', 5000, { feature: 'try_on' });
      expect(await wait()).toEqual({ p50: 120, p75: 180 });
      expect((await list('image')).find((m) => m.id === 't-image')!.typicalSec).toBeNull();
    } finally {
      await pool.query(`delete from jobs where id like 'rt-%'`);
    }
  });

  test('marks a model as new for 14 days after it was added', async () => {
    await pool.query(`update model_configs set created_at = now() - interval '15 days' where id = 't-image'`);
    try {
      expect((await list('image')).map((m) => [m.id, m.isNew])).toEqual([['t-image', false], ['t-both', true], ['t-mock', true]]);
    } finally {
      await pool.query(`update model_configs set created_at = now() where id = 't-image'`);
    }
  });

  test('answers an empty list for a feature no enabled model offers', async () => {
    expect(await list('reframe')).toEqual([]);
  });

  test('shows a seeded model only once an Admin has enabled it', async () => {
    await setEnabled('nano-banana-pro', true);
    try {
      const pro = (await list('try_on')).find((m) => m.id === 'nano-banana-pro');
      expect(pro).toMatchObject({ label: 'Nano Banana Pro', resolutions: ['1K', '2K', '4K'], prices: { '1K': '0.1500', '2K': '0.1500', '4K': '0.3000' }, maxImages: 14 }); // up to 14 reference images (0030)
      expect(pro!.ratios).toContain('21:9');
    } finally {
      await setEnabled('nano-banana-pro', false);
    }
    expect((await list('try_on')).map((m) => m.id)).not.toContain('nano-banana-pro');
  });
});
