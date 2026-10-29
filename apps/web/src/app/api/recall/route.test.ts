// Integration test against a disposable database on the compose Postgres (`pnpm services:up`).
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
let seq = 0;

async function newUser() {
  const email = `r${++seq}@example.test`;
  const { user } = await auth.api.createUser({ body: { email, name: email, password: PASSWORD, role: 'member' } });
  const res = await auth.api.signInEmail({ body: { email, password: PASSWORD }, asResponse: true });
  return { id: user.id, cookie: res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ') };
}
type User = Awaited<ReturnType<typeof newUser>>;

/** One job of `u`; each call is a second newer than the last, so the order is known. */
let at = Date.parse('2026-10-01T00:00:00Z');
async function job(u: User, j: { feature?: string; model?: string; aspect?: string; duration?: number; params?: Record<string, string>; preset?: string | null; enhance?: boolean; store?: string | null; deleted?: boolean }) {
  const id = `job-${++seq}`;
  await pool.query(
    `insert into jobs (id, user_id, team_id, store_id, feature, model, provider, preset_id, prompt, aspect, duration_s, params, input_asset_ids, enhance, created_at, deleted_at)
     select $1, $2, team_id, $3, $4, $5, 'mock', $6, 'p', $7, $8, $9::jsonb, '{}', $10, $11, case when $12 then now() end from users where id = $2`,
    [id, u.id, j.store ?? null, j.feature ?? 'video', j.model ?? 'rv', j.preset ?? null, j.aspect ?? '9:16', j.duration ?? 5, JSON.stringify(j.params ?? {}), j.enhance ?? false, new Date((at += 1000)), j.deleted ?? false],
  );
  return id;
}
const recall = async (u: User | null, query: string) => {
  const res = await GET(new Request(`http://localhost/api/recall?${query}`, { headers: u ? { cookie: u.cookie } : {} }));
  return { status: res.status, body: (await res.json()) as { settings: Record<string, unknown> | null; error?: string } };
};
const settings = async (u: User, query: string) => (await recall(u, query)).body.settings;

beforeAll(async () => {
  await pool.query(
    `insert into model_configs (id, provider, endpoint, label, kind, features, ratios, durations_sec, max_images, image_prices, usd_per_second, output_resolution, sources, enabled) values
       ('rv', 'mock', 'mock', 'Video', 'video', '{video,marketing}', '{9:16,1:1}', '{5,8}', 4, '{}', 0.1, '720p', '{}', true),
       ('rv-silent', 'fal', 'fal-ai/silent', 'Silent', 'video', '{video}', '{9:16}', '{5}', 4, '{}', 0.1, '720p', '{}', true),
       ('rv-off', 'mock', 'mock', 'Off', 'video', '{video}', '{9:16}', '{5}', 4, '{}', 0.1, '720p', '{}', false),
       ('ri', 'mock', 'mock', 'Image', 'image', '{image,try_on}', '{auto,3:4}', '{}', 4, '{"1K": "0.1", "2K": "0.2"}', 0, null, '{}', true)`,
  );
  await pool.query(`insert into stores (id, name, code, hidden) values ('st', 'Shop', 'RS', false), ('st-hidden', 'Hidden', 'RH', true)`);
});

afterAll(async () => {
  await pool.end();
  await testDb.drop();
});

describe('/api/recall', () => {
  test('gives null without a job, and the latest own job of the page otherwise; another member and deleted jobs are not seen', async () => {
    const [a, b] = [await newUser(), await newUser()];
    expect(await settings(a, 'feature=video')).toBeNull();
    await job(a, { aspect: '9:16', duration: 5, params: { audio: 'off' }, enhance: false });
    await job(a, { aspect: '1:1', duration: 8, params: { audio: 'on' }, enhance: true, store: 'st' });
    await job(a, { aspect: '9:16', duration: 5, deleted: true });
    await job(b, { aspect: '9:16', duration: 5 });
    await job(a, { feature: 'image', model: 'ri', aspect: '3:4', duration: 0, params: { resolution: '2K' } });
    expect(await settings(a, 'feature=video')).toEqual({ modelId: 'rv', ratio: '1:1', durationSec: 8, resolution: null, audio: true, enhance: true, storeId: 'st' });
    expect(await settings(a, 'feature=image')).toEqual({ modelId: 'ri', ratio: '3:4', durationSec: null, resolution: '2K', audio: null, enhance: false, storeId: null });
    expect(await settings(b, 'feature=image')).toBeNull();
  });

  test('a disabled model gives null; a ratio, duration or resolution the model dropped gives a null field', async () => {
    const u = await newUser();
    await job(u, { model: 'rv-off' });
    expect(await settings(u, 'feature=video')).toBeNull();
    await job(u, { feature: 'try_on', model: 'ri', aspect: '1:1', duration: 0, params: { resolution: '4K' } });
    expect(await settings(u, 'feature=try_on')).toMatchObject({ modelId: 'ri', ratio: null, resolution: null });
    await job(u, { aspect: '1:1', duration: 10 });
    expect(await settings(u, 'feature=video')).toMatchObject({ modelId: 'rv', ratio: '1:1', durationSec: null });
    // A model that no longer lists the page is dropped too.
    await job(u, { feature: 'marketing', model: 'rv-silent', duration: 5 });
    expect(await settings(u, 'feature=marketing')).toBeNull();
  });

  test('a preset video job gives no Enhance, a model without an audio price gives no audio, and a hidden store is dropped', async () => {
    const u = await newUser();
    await job(u, { preset: 'gentle-push-in', enhance: false, params: { audio: 'on' }, store: 'st-hidden' });
    expect(await settings(u, 'feature=video')).toMatchObject({ enhance: null, audio: true, storeId: null });
    await job(u, { model: 'rv-silent', params: { audio: 'off' }, enhance: true });
    expect(await settings(u, 'feature=video')).toMatchObject({ modelId: 'rv-silent', enhance: true, audio: null });
  });

  test('keeps Marketing Studio UGC and Advanced apart', async () => {
    const u = await newUser();
    await job(u, { feature: 'marketing', aspect: '1:1', duration: 8, params: { format: 'advanced', audio: 'off' } });
    await job(u, { feature: 'marketing', aspect: '9:16', duration: 5, params: { audio: 'on' } });
    expect(await settings(u, 'feature=marketing&format=advanced')).toMatchObject({ ratio: '1:1', durationSec: 8, audio: false, enhance: null });
    expect(await settings(u, 'feature=marketing')).toMatchObject({ ratio: '9:16', durationSec: 5, audio: true });
  });

  test('refuses a bad feature or format, and a caller who is not signed in', async () => {
    const u = await newUser();
    expect((await recall(u, 'feature=nope')).status).toBe(400);
    expect((await recall(u, '')).status).toBe(400);
    expect((await recall(u, 'feature=video&format=advanced')).status).toBe(400);
    expect((await recall(u, 'feature=marketing&format=ugc')).status).toBe(400);
    expect((await recall(null, 'feature=video')).status).toBe(401);
  });
});
