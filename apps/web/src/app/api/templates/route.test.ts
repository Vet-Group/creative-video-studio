// Integration test against a disposable database on the compose Postgres (`pnpm services:up`).
import { randomBytes } from 'node:crypto';
import { createTestDatabase } from '@cvs/db/testing';
import { afterAll, describe, expect, test } from 'vitest';

const testDb = await createTestDatabase();
process.env.DATABASE_URL = testDb.url;
process.env.BETTER_AUTH_SECRET = randomBytes(32).toString('hex');
process.env.APP_URL = 'http://localhost';

const { auth, pool } = await import('@/lib/auth');
const { GET: list, POST } = await import('./route');
const { GET: one, DELETE } = await import('./[id]/route');

const PASSWORD = 'correct-horse-battery';
let seq = 0;

async function newUser(role: 'member' | 'admin' = 'member') {
  const email = `t${++seq}@example.test`;
  const { user } = await auth.api.createUser({ body: { email, name: email, password: PASSWORD, role } });
  const res = await auth.api.signInEmail({ body: { email, password: PASSWORD }, asResponse: true });
  const cookie = res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
  await pool.query(`insert into assets (id, owner_id, kind, s3_key, filename, mime, bytes) values ($1, $2, 'input', $1, 'own.png', 'image/png', 1)`, [`${user.id}-a`, user.id]);
  return { id: user.id, cookie, asset: `${user.id}-a` };
}
type User = Awaited<ReturnType<typeof newUser>>;

const req = (u: User, path: string, init: RequestInit = {}) => new Request(`http://localhost${path}`, { ...init, headers: { 'content-type': 'application/json', cookie: u.cookie } });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const save = (u: User, body: Record<string, unknown>) => POST(req(u, '/api/templates', { method: 'POST', body: JSON.stringify(body) }));
const error = async (res: Response) => ((await res.json()) as { error: string }).error;
const tryOn = (u: User) => ({ feature: 'try_on', name: 'Red dress', data: { images: [u.asset], brief: 'red dress', garments: 1, ratio: '3:4', resolution: '2K', modelId: 'm1' } });

afterAll(async () => {
  await pool.end();
  await testDb.drop();
});

describe('/api/templates', () => {
  test('saves a form and gives it back to its owner in the shape the pages refill from', async () => {
    const u = await newUser();
    const res = await save(u, tryOn(u));
    expect(res.status).toBe(201);
    const { id } = (await res.json()) as { id: string };
    expect(await (await list(req(u, '/api/templates?feature=try_on'))).json()).toEqual({ templates: [{ id, name: 'Red dress', isCompany: false, mine: true }], canShare: false });
    expect(await (await one(req(u, `/api/templates/${id}`), ctx(id))).json()).toMatchObject({
      id, feature: 'try_on', images: [{ id: u.asset, filename: 'own.png' }], brief: 'red dress', garments: 1, ratio: '3:4', resolution: '2K', modelId: 'm1', prompt: null,
    });
    expect(await (await list(req(u, '/api/templates?feature=image'))).json()).toEqual({ templates: [], canShare: false });
  });

  test("hides another member's template, and lets only its owner delete it", async () => {
    const [a, b] = [await newUser(), await newUser()];
    const { id } = (await (await save(a, tryOn(a))).json()) as { id: string };
    expect((await one(req(b, `/api/templates/${id}`), ctx(id))).status).toBe(404);
    expect(await (await list(req(b, '/api/templates?feature=try_on'))).json()).toEqual({ templates: [], canShare: false });
    expect((await DELETE(req(b, `/api/templates/${id}`, { method: 'DELETE' }), ctx(id))).status).toBe(404);
    expect((await DELETE(req(a, `/api/templates/${id}`, { method: 'DELETE' }), ctx(id))).status).toBe(204);
    expect((await one(req(a, `/api/templates/${id}`), ctx(id))).status).toBe(404);
  });

  test("refuses another member's photo, a bad name, an unknown field or feature, and sharing by a member", async () => {
    const [a, b] = [await newUser(), await newUser()];
    expect(await error(await save(a, { ...tryOn(a), data: { images: [b.asset] } }))).toBe('data.images may hold only your own uploads');
    expect(await error(await save(a, { ...tryOn(a), name: 'x'.repeat(61) }))).toBe('name must have 1 to 60 characters');
    expect(await error(await save(a, { ...tryOn(a), name: '   ' }))).toBe('name must have 1 to 60 characters');
    expect(await error(await save(a, { ...tryOn(a), data: { images: [], seed: 1 } }))).toBe('data.seed is not a template field');
    expect(await error(await save(a, { ...tryOn(a), data: { images: [], hook: 'nope' } }))).toBe('data.hook is not a hook');
    expect(await error(await save(a, { ...tryOn(a), feature: 'media_optimizer' }))).toBe('feature must be a page that takes templates'); // Motion Control refills since History saves it
    const shared = await save(a, { ...tryOn(a), isCompany: true });
    expect([shared.status, await error(shared)]).toEqual([403, 'only an Admin shares a template with the company']);
    expect((await pool.query('select count(*)::int as n from user_templates where user_id = $1', [a.id])).rows[0].n).toBe(0);
  });

  test('keeps at most 50 per member and refuses the 51st', async () => {
    const u = await newUser();
    for (let i = 0; i < 50; i++) expect((await save(u, { feature: 'image', name: `t${i}`, data: { images: [] } })).status).toBe(201);
    const res = await save(u, { feature: 'image', name: 't50', data: { images: [] } });
    expect([res.status, await error(res)]).toEqual([409, 'you can keep at most 50 templates; delete one first']);
  });

  test("shares an Admin's company template with everyone, without the Admin's photos, and only an Admin deletes it", async () => {
    const [admin, m] = [await newUser('admin'), await newUser()];
    const { id } = (await (await save(admin, { ...tryOn(admin), isCompany: true })).json()) as { id: string };
    expect(await (await list(req(m, '/api/templates?feature=try_on'))).json()).toEqual({ templates: [{ id, name: 'Red dress', isCompany: true, mine: false }], canShare: false });
    expect(((await (await list(req(admin, '/api/templates?feature=try_on'))).json()) as { canShare: boolean }).canShare).toBe(true);
    expect(await (await one(req(m, `/api/templates/${id}`), ctx(id))).json()).toMatchObject({ images: [], brief: 'red dress', garments: 1 });
    expect((await DELETE(req(m, `/api/templates/${id}`, { method: 'DELETE' }), ctx(id))).status).toBe(404);
    const other = await newUser('admin');
    expect((await DELETE(req(other, `/api/templates/${id}`, { method: 'DELETE' }), ctx(id))).status).toBe(204);
  });

  test("takes own and company custom hooks and locations in data, refuses another member's private one, and keeps a company template to built-in or company ones", async () => {
    const [a, b, admin] = [await newUser(), await newUser(), await newUser('admin')];
    const choice = (id: string, userId: string, kind: string, company = false) =>
      pool.query(`insert into user_choices (id, user_id, kind, name, phrase, is_company) values ($1, $2, $3, 'n', 'p', $4)`, [id, userId, kind, company]);
    await choice(`${a.id}-hook`, a.id, 'hook');
    await choice(`${admin.id}-spot`, admin.id, 'location', true);
    await choice(`${admin.id}-hook`, admin.id, 'hook');
    const marketing = (u: User, data: Record<string, unknown>, extra: Record<string, unknown> = {}) => save(u, { feature: 'marketing', name: 'M', data: { images: [], ...data }, ...extra });
    expect((await marketing(a, { hook: `${a.id}-hook`, location: `${admin.id}-spot` })).status).toBe(201);
    expect(await error(await marketing(b, { hook: `${a.id}-hook` }))).toBe('data.hook is not a hook');
    expect(await error(await marketing(a, { location: `${a.id}-hook` }))).toBe('data.location is not a location');
    expect(await error(await marketing(a, { hook: 5 }))).toBe('data.hook is not a hook');
    expect((await marketing(admin, { hook: 'blizzard', location: `${admin.id}-spot` }, { isCompany: true })).status).toBe(201);
    const leak = await marketing(admin, { hook: `${admin.id}-hook` }, { isCompany: true });
    expect([leak.status, await error(leak)]).toEqual([400, 'a company template may use only built-in or company hooks and locations']);
    expect((await marketing(admin, { hook: `${admin.id}-hook` })).status).toBe(201); // private, it may
  });

  describe("fromJob (History's Lưu mẫu)", () => {
    let jobSeq = 0;
    type Row = { feature: string; model: string; prompt?: string; preset?: string | null; aspect?: string; duration?: number; params?: Record<string, string>; inputs: string[]; store?: string | null; enhance?: boolean };
    async function job(u: User, row: Row) {
      const id = `tj-${++jobSeq}`;
      await pool.query(
        `insert into jobs (id, user_id, team_id, feature, model, provider, preset_id, prompt, enhance, aspect, duration_s, params, input_asset_ids, store_id, status)
         values ($1, $2, 'team-unassigned', $3, $4, 'fal', $5, $6, $7, $8, $9, $10, $11, $12, 'succeeded')`,
        [id, u.id, row.feature, row.model, row.preset ?? null, row.prompt ?? 'composed', row.enhance ?? false, row.aspect ?? '9:16', row.duration ?? 0, JSON.stringify(row.params ?? {}), row.inputs, row.store ?? null],
      );
      return id;
    }
    const fromJob = (u: User, id: unknown, extra: Record<string, unknown> = {}) => save(u, { name: 'From history', fromJob: id, ...extra });
    const saved = async (res: Response) => {
      expect(res.status).toBe(201);
      return (await pool.query('select feature, data from user_templates where id = $1', [((await res.json()) as { id: string }).id])).rows[0];
    };

    test('builds the data of a Try On, a Marketing and a Motion Control job, and of a free-prompt and a preset video', async () => {
      const u = await newUser();
      await pool.query(`insert into assets (id, owner_id, kind, s3_key, filename, mime, bytes, duration_ms) values ($1, $2, 'input', $1, 'ref.mp4', 'video/mp4', 1, 5300)`, [`${u.id}-v`, u.id]);
      await pool.query(`insert into assets (id, owner_id, kind, s3_key, filename, mime, bytes) values ($1, $2, 'input', $1, 'g.png', 'image/png', 1)`, [`${u.id}-g`, u.id]);
      await pool.query(`insert into user_choices (id, user_id, kind, name, phrase) values ($1, $2, 'hook', 'n', 'p')`, [`${u.id}-hook`, u.id]);
      const tryOn = await job(u, { feature: 'try_on', model: 'nano-banana-pro', aspect: '3:4', params: { resolution: '2K', garments: '1', brief: 'red dress' }, inputs: [u.asset, `${u.id}-g`] });
      expect(await saved(await fromJob(u, tryOn))).toEqual({ feature: 'try_on', data: { images: [u.asset, `${u.id}-g`], brief: 'red dress', garments: 1, ratio: '3:4', resolution: '2K', modelId: 'nano-banana-pro' } });
      const mkt = await job(u, { feature: 'marketing', model: 'kling-o3-pro', duration: 10, params: { format: 'advanced', audio: 'on', hook: `${u.id}-hook`, location: 'kitchen', brief: 'b', script: 's' }, inputs: [u.asset] });
      expect(await saved(await fromJob(u, mkt))).toEqual({
        feature: 'marketing', data: { images: [u.asset], brief: 'b', script: 's', hook: `${u.id}-hook`, location: 'kitchen', format: 'advanced', audio: 'on', ratio: '9:16', modelId: 'kling-o3-pro', durationSec: 10 },
      });
      const motion = await job(u, { feature: 'motion_control', model: 'kling-v3-motion-pro', prompt: 'stage light', aspect: 'auto', duration: 6, inputs: [u.asset, `${u.id}-v`] });
      expect(await saved(await fromJob(u, motion))).toEqual({ feature: 'motion_control', data: { images: [u.asset, `${u.id}-v`], prompt: 'stage light', ratio: 'auto', modelId: 'kling-v3-motion-pro' } });
      const free = await job(u, { feature: 'video', model: 'kling-o3-pro', prompt: 'a slow turn', enhance: true, duration: 5, params: { audio: 'off' }, inputs: [u.asset] });
      expect((await saved(await fromJob(u, free))).data).toEqual({ images: [u.asset], prompt: 'a slow turn', enhance: true, audio: 'off', ratio: '9:16', modelId: 'kling-o3-pro', durationSec: 5 });
      const preset = await job(u, { feature: 'video', model: 'kling-o3-pro', preset: 'gentle-push-in', duration: 5, inputs: [u.asset] });
      expect((await saved(await fromJob(u, preset))).data).toEqual({ images: [u.asset], enhance: false, ratio: '9:16', modelId: 'kling-o3-pro', presetId: 'gentle-push-in', durationSec: 5 });
      // The template refills Motion Control with the video's type and length.
      const { id } = (await (await fromJob(u, motion)).json()) as { id: string };
      expect(((await (await one(req(u, `/api/templates/${id}`), ctx(id))).json()) as { images: unknown[] }).images).toEqual([
        { id: u.asset, filename: 'own.png', mime: 'image/png', durationMs: null },
        { id: `${u.id}-v`, filename: 'ref.mp4', mime: 'video/mp4', durationMs: 5300 },
      ]);
    });

    test("leaves out another member's and deleted inputs, a hidden store and a hook the member cannot use, and keeps a visible store", async () => {
      const [u, other] = [await newUser(), await newUser()];
      await pool.query(`insert into stores (id, name, code, hidden) values ('tpl-ok', 'Ok', 'TPLOK', false), ('tpl-hidden', 'Hidden', 'TPLH', true)`);
      await pool.query(`insert into assets (id, owner_id, kind, s3_key, filename, mime, bytes, deleted_at) values ($1, $2, 'input', $1, 'x.png', 'image/png', 1, now())`, [`${u.id}-gone`, u.id]);
      const base = { feature: 'video', model: 'kling-o3-pro', prompt: 'p', duration: 5, inputs: [other.asset, `${u.id}-gone`, u.asset] };
      expect((await saved(await fromJob(u, await job(u, { ...base, store: 'tpl-hidden' })))).data).toEqual({ images: [u.asset], prompt: 'p', enhance: false, ratio: '9:16', modelId: 'kling-o3-pro', durationSec: 5 });
      expect((await saved(await fromJob(u, await job(u, { ...base, store: 'tpl-ok' })))).data).toMatchObject({ images: [u.asset], storeId: 'tpl-ok' });
      const mkt = await job(u, { feature: 'marketing', model: 'kling-o3-pro', duration: 5, params: { hook: `${other.id}-private`, location: 'gym' }, inputs: [u.asset] });
      expect((await saved(await fromJob(u, mkt))).data).toEqual({ images: [u.asset], location: 'gym', ratio: '9:16', modelId: 'kling-o3-pro', durationSec: 5 });
    });

    test("refuses another member's or a deleted job, fromJob with data or feature, a page without templates, and sharing by a member; an Admin shares one", async () => {
      const [u, other, admin] = [await newUser(), await newUser(), await newUser('admin')];
      const id = await job(u, { feature: 'image', model: 'nano-banana-pro', prompt: 'a flat lay', aspect: '1:1', params: { resolution: '1K' }, inputs: [u.asset] });
      const theirs = await fromJob(other, id);
      expect([theirs.status, await error(theirs)]).toEqual([404, 'the job does not exist']);
      expect(await error(await fromJob(u, id, { data: { images: [] } }))).toBe('fromJob is a job id, given without feature and data');
      expect(await error(await fromJob(u, id, { feature: 'image' }))).toBe('fromJob is a job id, given without feature and data');
      expect(await error(await fromJob(u, 5))).toBe('fromJob is a job id, given without feature and data');
      const shared = await fromJob(u, id, { isCompany: true });
      expect([shared.status, await error(shared)]).toEqual([403, 'only an Admin shares a template with the company']);
      const soon = await job(u, { feature: 'media_optimizer', model: 'nano-banana-pro', inputs: [u.asset] });
      expect(await error(await fromJob(u, soon))).toBe('the job is of a page that takes no templates');
      const purged = await job(u, { feature: 'video', model: 'kling-o3-pro', prompt: 'p', duration: 5, inputs: [u.asset] });
      await pool.query('update jobs set purged_at = now() where id = $1', [purged]);
      expect((await fromJob(u, purged)).status).toBe(404);
      await pool.query('update jobs set deleted_at = now() where id = $1', [id]);
      expect((await fromJob(u, id)).status).toBe(404);
      expect((await pool.query('select count(*)::int as n from user_templates where user_id = $1', [u.id])).rows[0].n).toBe(0);

      const mine = await job(admin, { feature: 'image', model: 'nano-banana-pro', prompt: 'p', aspect: '1:1', params: { resolution: '1K' }, inputs: [admin.asset] });
      expect((await fromJob(admin, mine, { isCompany: true })).status).toBe(201);
      expect(await (await list(req(u, '/api/templates?feature=image'))).json()).toMatchObject({ templates: [{ name: 'From history', isCompany: true, mine: false }] });
      // A company template from a job may not hold the Admin's private hook.
      await pool.query(`insert into user_choices (id, user_id, kind, name, phrase) values ($1, $2, 'hook', 'n', 'p')`, [`${admin.id}-hook`, admin.id]);
      const mkt = await job(admin, { feature: 'marketing', model: 'kling-o3-pro', duration: 5, params: { hook: `${admin.id}-hook` }, inputs: [admin.asset] });
      expect(await error(await fromJob(admin, mkt, { isCompany: true }))).toBe('a company template may use only built-in or company hooks and locations');
    });
  });
});
