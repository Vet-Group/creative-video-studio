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
type Model = { id: string; label: string; isMock: boolean; ratios: string[]; resolutions: string[]; prices: Record<string, string>; maxImages: number; score: number; recommended: boolean };
const list = async (feature: string, cookie = memberCookie) => ((await (await call(cookie, `?feature=${feature}`)).json()) as { models: Model[] }).models;
const setEnabled = (id: string, enabled: boolean) => pool.query('update model_configs set enabled = $2 where id = $1', [id, enabled]);

beforeAll(async () => {
  memberCookie = await newUser('member@example.test', 'member');
  adminCookie = await newUser('admin@example.test', 'admin');
  await pool.query(
    `insert into model_configs (id, provider, endpoint, label, kind, features, ratios, durations_sec, max_images, image_prices, sources, enabled) values
       ('t-both', 'fal', 'x', 'B both', 'image', '{image,try_on}', '{auto,1:1}', '{}', 4, '{"1K": "0.1500", "2K": "0.3000"}', '{}', true),
       ('t-image', 'fal', 'x', 'A image only', 'image', '{image}', '{auto}', '{}', 2, '{"1K": "0.04"}', '{}', true),
       ('t-tryon', 'fal', 'x', 'C try-on only', 'image', '{try_on}', '{auto}', '{}', 2, '{"1K": "0.075"}', '{}', true),
       ('t-mock', 'mock', 'mock', 'D mock', 'image', '{image,try_on}', '{auto,3:4}', '{}', 4, '{"1K": "0.1500"}', '{}', true),
       ('t-off', 'fal', 'x', 'E disabled', 'image', '{image,try_on}', '{auto}', '{}', 4, '{"1K": "0.1"}', '{}', false)`,
  );
  await pool.query(
    `insert into model_configs (id, provider, endpoint, label, kind, features, ratios, durations_sec, max_images, output_resolution, usd_per_second, sources, enabled)
     values ('t-video', 'fal', 'x', 'F video', 'video', '{video,image}', '{9:16}', '{5}', 4, '720p', 0.1, '{}', true)`,
  );
});

afterAll(async () => {
  await pool.end();
  await testDb.drop();
});

describe('GET /api/image-models', () => {
  test('answers 401 without a session, and 400 without an image feature', async () => {
    expect((await call(undefined, '?feature=image')).status).toBe(401);
    for (const q of ['', '?feature=', '?feature=video', '?feature=marketing', '?feature=nope']) expect((await call(memberCookie, q)).status, q).toBe(400);
  });

  test('lists the enabled image models of a feature, by label, with ratios, resolutions, prices and the image limit', async () => {
    const unscored = { passRate: null, reliability: 1, score: 50, passes: 0, total: 0, recommended: false }; // equal scores: no badge
    expect(await list('image')).toEqual([
      { id: 't-image', label: 'A image only', provider: 'fal', isMock: false, ratios: ['auto'], resolutions: ['1K'], prices: { '1K': '0.0400' }, maxImages: 2, ...unscored },
      { id: 't-both', label: 'B both', provider: 'fal', isMock: false, ratios: ['auto', '1:1'], resolutions: ['1K', '2K'], prices: { '1K': '0.1500', '2K': '0.3000' }, maxImages: 4, ...unscored },
      { id: 't-mock', label: 'D mock', provider: 'mock', isMock: true, ratios: ['auto', '3:4'], resolutions: ['1K'], prices: { '1K': '0.0000' }, maxImages: 4, ...unscored },
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
  });

  test('scores each model per feature from its prior and the marks of that feature, and badges the one that beats the rest', async () => {
    await pool.query(`update model_configs set pass_seed_passes = 8, pass_seed_total = 10 where id = 't-both'`);
    const memberId = (await pool.query(`select id from users where email = 'member@example.test'`)).rows[0].id;
    await pool.query(
      `insert into jobs (id, user_id, team_id, feature, model, provider, prompt, aspect, duration_s, input_asset_ids, status)
       values ('img-1', $1, 'team-unassigned', 'image', 't-both', 'fal', 'p', 'auto', 0, '{}', 'succeeded')`,
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

  test('answers an empty list for a feature no enabled model offers', async () => {
    expect(await list('reframe')).toEqual([]);
  });

  test('shows a seeded model only once an Admin has enabled it', async () => {
    await setEnabled('nano-banana-pro', true);
    try {
      const pro = (await list('try_on')).find((m) => m.id === 'nano-banana-pro');
      expect(pro).toMatchObject({ label: 'Nano Banana Pro', resolutions: ['1K', '2K', '4K'], prices: { '1K': '0.1500', '2K': '0.1500', '4K': '0.3000' }, maxImages: 4 });
      expect(pro!.ratios).toContain('21:9');
    } finally {
      await setEnabled('nano-banana-pro', false);
    }
    expect((await list('try_on')).map((m) => m.id)).not.toContain('nano-banana-pro');
  });
});
