// Integration test of the M.5 admin APIs (teams, stores, store reassignment, settings, presets, audit log) against a disposable
// database on the compose Postgres (`pnpm services:up`). Users have their own test in users/route.test.ts.
import { randomBytes } from 'node:crypto';
import { readdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createTestDatabase } from '@cvs/db/testing';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

const testDb = await createTestDatabase();
process.env.DATABASE_URL = testDb.url;
process.env.BETTER_AUTH_SECRET = randomBytes(32).toString('hex');
process.env.APP_URL = 'http://localhost';

const { auth, pool } = await import('@/lib/auth');
const teamsRoute = await import('./teams/route');
const teamRoute = await import('./teams/[id]/route');
const storesRoute = await import('./stores/route');
const storeRoute = await import('./stores/[id]/route');
const { GET: GET_PUBLIC_STORES } = await import('../stores/route');
const { PUT: PUT_REASSIGN } = await import('./jobs/[id]/store/route');
const settingsRoute = await import('./settings/route');
const presetsRoute = await import('../presets/route');
const presetRoute = await import('../presets/[id]/route');
const { GET: GET_AUDIT } = await import('./audit/route');

const PASSWORD = 'correct-horse-battery';
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

async function newUser(email: string, role: 'member' | 'admin') {
  const id = (await auth.api.createUser({ body: { email, name: email, password: PASSWORD, role } })).user.id;
  const res = await auth.api.signInEmail({ body: { email, password: PASSWORD }, asResponse: true });
  return { id, cookie: res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ') };
}

const call = (cookie: string | undefined, path: string, method = 'GET', body?: unknown) =>
  new Request(`http://localhost${path}`, { method, headers: { ...(cookie ? { cookie } : {}), 'content-type': 'application/json' }, ...(body === undefined || method === 'GET' ? {} : { body: JSON.stringify(body) }) });

// Rows by a person: migration 0065 audits its own prompt changes as the system (no actor).
const audits = async (target: string) => (await pool.query('select actor_id, action, old_value, new_value from audit_entries where target = $1 and actor_id is not null order by id', [target])).rows;
const auditCount = async () => (await pool.query('select count(*)::int as n from audit_entries')).rows[0].n as number;

let admin: Awaited<ReturnType<typeof newUser>>;
let member: Awaited<ReturnType<typeof newUser>>;

beforeAll(async () => {
  admin = await newUser('admin@example.test', 'admin');
  member = await newUser('member@example.test', 'member');
});

afterAll(async () => {
  await pool.end();
  await testDb.drop();
});

describe('every /api/admin route', () => {
  test('answers 401 without a session and 403 to a Member, on every method of every route file', async () => {
    const root = fileURLToPath(new URL('.', import.meta.url));
    const files = (readdirSync(root, { recursive: true }) as string[]).map((f) => f.replaceAll('\\', '/')).filter((f) => f.endsWith('route.ts'));
    expect(files.length).toBeGreaterThanOrEqual(19);
    let handlers = 0;
    for (const file of files) {
      const mod = (await import(/* @vite-ignore */ pathToFileURL(`${root}${file}`).href)) as Record<string, (r: Request, c: ReturnType<typeof ctx>) => Promise<Response>>;
      for (const method of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']) {
        if (typeof mod[method] !== 'function') continue;
        handlers++;
        expect((await mod[method](call(undefined, '/api/admin/x', method, {}), ctx('x'))).status, `${method} ${file} without a session`).toBe(401);
        expect((await mod[method](call(member.cookie, '/api/admin/x', method, {}), ctx('x'))).status, `${method} ${file} as a Member`).toBe(403);
      }
    }
    expect(handlers).toBeGreaterThanOrEqual(23);
  });

  test('nothing else is deleted: only a store nothing points at may be (owner decision, 2026-11-11; tested under stores)', () => {
    for (const mod of [teamsRoute, teamRoute, storesRoute, presetRoute]) expect(mod).not.toHaveProperty('DELETE');
    expect(storeRoute).toHaveProperty('DELETE');
  });
});

describe('teams', () => {
  const list = async (query = '') =>
    ((await (await teamsRoute.GET(call(admin.cookie, `/api/admin/teams${query}`))).json()) as { teams: { id: string; name: string; costCentreCode: string | null; hidden: boolean; defaultTool: string | null }[] }).teams;
  const patch = (id: string, body: unknown) => teamRoute.PATCH(call(admin.cookie, `/api/admin/teams/${id}`, 'PATCH', body), ctx(id));

  test('creates a team with a name and an optional cost-centre code, audited once', async () => {
    const res = await teamsRoute.POST(call(admin.cookie, '/api/admin/teams', 'POST', { name: ' Marketing ', costCentreCode: 'CC-10' }));
    expect(res.status).toBe(201);
    const team = (await res.json()) as { id: string; name: string; costCentreCode: string; hidden: boolean };
    expect(team).toMatchObject({ name: 'Marketing', costCentreCode: 'CC-10', hidden: false });
    expect(await audits(`team:${team.id}`)).toEqual([{ actor_id: admin.id, action: 'team.create', old_value: null, new_value: { name: 'Marketing', costCentreCode: 'CC-10' } }]);
    const plain = (await (await teamsRoute.POST(call(admin.cookie, '/api/admin/teams', 'POST', { name: 'Sales' }))).json()) as { id: string; costCentreCode: null };
    expect(plain.costCentreCode).toBeNull();
  });

  test.each([{}, { name: '  ' }, { name: 5 }, { name: 'X', costCentreCode: 7 }])('refuses a create with %j', async (body) => {
    const before = await auditCount();
    expect((await teamsRoute.POST(call(admin.cookie, '/api/admin/teams', 'POST', body))).status).toBe(400);
    expect(await auditCount()).toBe(before);
  });

  test('renames a team and changes its code, audited once with old and new values', async () => {
    const { id } = (await (await teamsRoute.POST(call(admin.cookie, '/api/admin/teams', 'POST', { name: 'Ops', costCentreCode: 'CC-1' }))).json()) as { id: string };
    expect((await patch(id, { name: 'Operations', costCentreCode: 'CC-2' })).status).toBe(200);
    expect((await patch(id, { name: 'Operations' })).status).toBe(200); // unchanged: no entry
    expect((await audits(`team:${id}`)).slice(1)).toEqual([
      { actor_id: admin.id, action: 'team.rename', old_value: { name: 'Ops', costCentreCode: 'CC-1', defaultTool: null }, new_value: { name: 'Operations', costCentreCode: 'CC-2', defaultTool: null } },
    ]);
    expect((await patch(id, { costCentreCode: null })).status).toBe(200);
    expect((await list()).find((t) => t.id === id)).toMatchObject({ name: 'Operations', costCentreCode: null });
  });

  test('sets and clears a team default landing tool, audited; rejects an unknown route', async () => {
    const { id } = (await (await teamsRoute.POST(call(admin.cookie, '/api/admin/teams', 'POST', { name: 'Seller' }))).json()) as { id: string };
    expect((await patch(id, { defaultTool: '/marketing-studio' })).status).toBe(200);
    expect((await list()).find((t) => t.id === id)).toMatchObject({ defaultTool: '/marketing-studio' });
    expect((await patch(id, { defaultTool: '/nope' })).status).toBe(400); // not a known landing route
    expect((await patch(id, { defaultTool: null })).status).toBe(200);
    expect((await list()).find((t) => t.id === id)).toMatchObject({ defaultTool: null });
    expect((await audits(`team:${id}`)).slice(1)).toEqual([
      { actor_id: admin.id, action: 'team.rename', old_value: { name: 'Seller', costCentreCode: null, defaultTool: null }, new_value: { name: 'Seller', costCentreCode: null, defaultTool: '/marketing-studio' } },
      { actor_id: admin.id, action: 'team.rename', old_value: { name: 'Seller', costCentreCode: null, defaultTool: '/marketing-studio' }, new_value: { name: 'Seller', costCentreCode: null, defaultTool: null } },
    ]);
  });

  test('hides a team, audited once; a hidden team is not listed for the new-user form but stays listed for the Admin page', async () => {
    const { id } = (await (await teamsRoute.POST(call(admin.cookie, '/api/admin/teams', 'POST', { name: 'Old team' }))).json()) as { id: string };
    expect((await list()).map((t) => t.id)).toContain(id);
    expect((await patch(id, { hidden: true })).status).toBe(200);
    expect((await list()).map((t) => t.id)).not.toContain(id);
    expect((await list('?includeHidden=1')).find((t) => t.id === id)).toMatchObject({ hidden: true });
    expect((await audits(`team:${id}`)).slice(1)).toEqual([{ actor_id: admin.id, action: 'team.hide', old_value: { hidden: false }, new_value: { hidden: true } }]);
    // a hidden team is refused for a new user
    const body = { email: 'late@example.test', name: 'Late', teamId: id };
    const { POST } = await import('./users/route');
    expect((await POST(call(admin.cookie, '/api/admin/users', 'POST', body))).status).toBe(400);
  });

  test('refuses an empty change, a bad value and an unknown team', async () => {
    expect((await patch('team-unassigned', {})).status).toBe(400);
    expect((await patch('team-unassigned', { hidden: 'yes' })).status).toBe(400);
    expect((await patch('team-unassigned', { name: '' })).status).toBe(400);
    expect((await patch('no-such-team', { name: 'X' })).status).toBe(404);
  });
});

describe('stores', () => {
  const list = async (query = '') => ((await (await storesRoute.GET(call(admin.cookie, `/api/admin/stores${query}`))).json()) as { stores: { id: string; code: string; hidden: boolean; hasCost: boolean }[] }).stores;
  const create = async (name: string, code: string) => storesRoute.POST(call(admin.cookie, '/api/admin/stores', 'POST', { name, code }));
  const patch = (id: string, body: unknown) => storeRoute.PATCH(call(admin.cookie, `/api/admin/stores/${id}`, 'PATCH', body), ctx(id));
  const publicIds = async () => ((await (await GET_PUBLIC_STORES(call(member.cookie, '/api/stores'))).json()) as { stores: { id: string }[] }).stores.map((s) => s.id);

  test('creates a store with a unique code, audited once, and refuses a duplicate code with 409', async () => {
    const res = await create('Shop One', 'POD-1');
    expect(res.status).toBe(201);
    const store = (await res.json()) as { id: string };
    expect(await audits(`store:${store.id}`)).toEqual([{ actor_id: admin.id, action: 'store.create', old_value: null, new_value: { name: 'Shop One', code: 'POD-1' } }]);
    const before = await auditCount();
    expect((await create('Shop Copy', 'POD-1')).status).toBe(409);
    expect(await auditCount()).toBe(before);
    expect((await list()).filter((s) => s.code === 'POD-1')).toHaveLength(1);
    expect((await create('', 'POD-9')).status).toBe(400);
    expect((await create('No code', ' ')).status).toBe(400);
  });

  test('hides a store, audited once; it leaves the picker but stays in the Admin list', async () => {
    const { id } = (await (await create('Shop Two', 'POD-2')).json()) as { id: string };
    expect(await publicIds()).toContain(id);
    expect((await patch(id, { hidden: true })).status).toBe(200);
    expect(await publicIds()).not.toContain(id);
    expect((await list()).map((s) => s.id)).not.toContain(id);
    expect((await list('?includeHidden=1')).find((s) => s.id === id)).toMatchObject({ hidden: true });
    expect((await audits(`store:${id}`)).slice(1)).toEqual([{ actor_id: admin.id, action: 'store.hide', old_value: { hidden: false }, new_value: { hidden: true } }]);
  });

  test('lets the code change before and after the store has cost entries, audited; the costs stay with the store; a taken code is 409', async () => {
    const { id } = (await (await create('Shop Three', 'POD-3')).json()) as { id: string };
    expect((await patch(id, { code: 'POD-3B' })).status).toBe(200);
    expect((await patch(id, { code: 'POD-1' })).status).toBe(409); // another store's code
    expect((await list()).find((s) => s.id === id)).toMatchObject({ code: 'POD-3B', hasCost: false });

    await seedJob('code-change-job', id);
    expect((await list()).find((s) => s.id === id)).toMatchObject({ hasCost: true });
    expect((await patch(id, { code: 'POD-3C' })).status).toBe(200);
    expect((await patch(id, { code: 'POD-1' })).status).toBe(409); // still unique once it has cost
    expect((await patch(id, { code: 'POD-3C' })).status).toBe(200); // same code is not a change
    expect((await patch(id, { name: 'Shop Three renamed' })).status).toBe(200);
    expect((await pool.query('select name, code from stores where id = $1', [id])).rows[0]).toEqual({ name: 'Shop Three renamed', code: 'POD-3C' });
    expect((await pool.query('select distinct store_id from cost_entries where job_id = $1', ['code-change-job'])).rows).toEqual([{ store_id: id }]);
    expect((await audits(`store:${id}`)).slice(1)).toEqual([
      { actor_id: admin.id, action: 'store.update', old_value: { name: 'Shop Three', code: 'POD-3' }, new_value: { name: 'Shop Three', code: 'POD-3B' } },
      { actor_id: admin.id, action: 'store.update', old_value: { name: 'Shop Three', code: 'POD-3B' }, new_value: { name: 'Shop Three', code: 'POD-3C' } },
      { actor_id: admin.id, action: 'store.update', old_value: { name: 'Shop Three', code: 'POD-3C' }, new_value: { name: 'Shop Three renamed', code: 'POD-3C' } },
    ]);
  });

  test('refuses an empty change and an unknown store', async () => {
    expect((await patch('no-such-store', { name: 'X' })).status).toBe(404);
    expect((await patch('no-such-store', {})).status).toBe(400);
    expect((await patch('no-such-store', { paused: 'yes' })).status).toBe(400);
  });

  test('pauses a store, audited once: the picker keeps it after the open stores, marked, and resuming brings it back', async () => {
    const { id } = (await (await create('Aaa Paused Shop', 'POD-P')).json()) as { id: string };
    const picker = async () => ((await (await GET_PUBLIC_STORES(call(member.cookie, '/api/stores'))).json()) as { stores: { id: string; name: string; paused: boolean }[] }).stores;
    expect((await picker())[0]).toMatchObject({ id, name: 'Aaa Paused Shop', paused: false }); // first by name while open
    expect((await patch(id, { paused: true })).status).toBe(200);
    const paused = await picker();
    expect(paused.at(-1)).toEqual(expect.objectContaining({ id, name: 'Aaa Paused Shop (tạm dừng)', paused: true }));
    expect((await list()).find((s) => s.id === id)).toMatchObject({ paused: true, hidden: false });
    expect((await pool.query('select name from stores where id = $1', [id])).rows[0].name).toBe('Aaa Paused Shop'); // the mark is the picker's, not the name
    expect((await patch(id, { paused: false })).status).toBe(200);
    expect((await picker())[0]).toMatchObject({ id, name: 'Aaa Paused Shop', paused: false });
    expect((await audits(`store:${id}`)).slice(1)).toEqual([
      { actor_id: admin.id, action: 'store.pause', old_value: { paused: false }, new_value: { paused: true } },
      { actor_id: admin.id, action: 'store.pause', old_value: { paused: true }, new_value: { paused: false } },
    ]);
  });

  test('deletes a store nothing points at, audited; refuses one with a clip (409, nothing changed) and an unknown one (404)', async () => {
    const remove = (id: string) => storeRoute.DELETE(call(admin.cookie, `/api/admin/stores/${id}`, 'DELETE'), ctx(id));
    const { id: unused } = (await (await create('Shop Unused', 'POD-U')).json()) as { id: string };
    const { id: used } = (await (await create('Shop Used', 'POD-V')).json()) as { id: string };
    await seedJob('delete-guard-job', used);
    expect((await list()).filter((s) => [unused, used].includes(s.id)).map((s) => [s.code, (s as { inUse?: boolean }).inUse])).toEqual([['POD-U', false], ['POD-V', true]]);

    const before = await auditCount();
    expect((await remove(used)).status).toBe(409);
    expect(await auditCount()).toBe(before);
    expect((await pool.query('select 1 from stores where id = $1', [used])).rowCount).toBe(1);

    expect((await remove(unused)).status).toBe(200);
    expect((await pool.query('select 1 from stores where id = $1', [unused])).rowCount).toBe(0);
    expect(await audits(`store:${unused}`)).toContainEqual({ actor_id: admin.id, action: 'store.delete', old_value: { name: 'Shop Unused', code: 'POD-U' }, new_value: null });
    expect((await remove(unused)).status).toBe(404);
    expect((await create('Shop Unused again', 'POD-U')).status).toBe(201); // the code is free again
  });
});

async function seedModel() {
  await pool.query(
    `insert into model_configs (id, provider, endpoint, label, ratios, durations_sec, max_images, output_resolution, usd_per_second, sources, enabled, pass_seed_passes, pass_seed_total)
     values ('fal-test', 'fal', 'x', 'Fal test', '{9:16}', '{5}', 2, '720p', 0.2, '{}', true, 7, 10) on conflict do nothing`,
  );
}

/** A job of the Member with a 1.6 USD estimate booked on the given store. */
async function seedJob(id: string, storeId: string | null) {
  await seedModel();
  await pool.query(
    `insert into jobs (id, user_id, team_id, store_id, model, provider, prompt, aspect, duration_s, input_asset_ids)
     values ($1, $2, 'team-unassigned', $3, 'fal-test', 'fal', 'p', '9:16', 5, '{}')`,
    [id, member.id, storeId],
  );
  await pool.query(
    `insert into cost_entries (kind, usd, month, day, user_id, team_id, store_id, job_id)
     select 'estimate', 1.6, to_char(created_at at time zone 'Asia/Ho_Chi_Minh', 'YYYY-MM'), (created_at at time zone 'Asia/Ho_Chi_Minh')::date, user_id, team_id, store_id, id from jobs where id = $1`,
    [id],
  );
}

describe('store reassignment', () => {
  const reassign = (cookie: string | undefined, jobId: string, storeId: unknown) => PUT_REASSIGN(call(cookie, `/api/admin/jobs/${jobId}/store`, 'PUT', { storeId }), ctx(jobId));
  const perStore = async (jobId: string) =>
    Object.fromEntries((await pool.query(`select store_id, sum(usd)::text as usd from cost_entries where job_id = $1 group by store_id`, [jobId])).rows.map((r) => [r.store_id ?? 'none', r.usd]));

  beforeAll(async () => {
    await pool.query(`insert into stores (id, name, code) values ('sa', 'A', 'RA'), ('sb', 'B', 'RB'), ('sc', 'C', 'RC')`);
    await pool.query(`insert into stores (id, name, code, hidden) values ('sh', 'Hidden', 'RH', true)`);
  });

  test('moves the whole job total to the new store as a store_reassign pair in the job month, with one audit entry', async () => {
    await seedJob('re-1', 'sa');
    const res = await reassign(admin.cookie, 're-1', 'sb');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: 're-1', storeId: 'sb', changed: true });
    expect((await pool.query('select store_id from jobs where id = $1', ['re-1'])).rows[0].store_id).toBe('sb');
    expect(await perStore('re-1')).toEqual({ sa: '0.0000', sb: '1.6000' });
    const pair = (
      await pool.query(
        `select store_id, usd::text as usd, month = (select to_char(created_at at time zone 'Asia/Ho_Chi_Minh', 'YYYY-MM') from jobs where id = 're-1') as job_month
           from cost_entries where job_id = 're-1' and kind = 'store_reassign' order by id`,
      )
    ).rows;
    expect(pair).toEqual([
      { store_id: 'sa', usd: '-1.6000', job_month: true },
      { store_id: 'sb', usd: '1.6000', job_month: true },
    ]);
    expect(await audits('job:re-1')).toEqual([{ actor_id: admin.id, action: 'store.reassign', old_value: { storeId: 'sa' }, new_value: { storeId: 'sb' } }]);
  });

  test('nets correctly after two reassignments, also from and to no store', async () => {
    await seedJob('re-2', 'sa');
    expect((await reassign(admin.cookie, 're-2', 'sb')).status).toBe(200);
    expect((await reassign(admin.cookie, 're-2', 'sc')).status).toBe(200);
    expect(await perStore('re-2')).toEqual({ sa: '0.0000', sb: '0.0000', sc: '1.6000' });
    expect((await pool.query(`select sum(usd)::text as usd from cost_entries where job_id = 're-2'`)).rows[0].usd).toBe('1.6000');
    expect(await audits('job:re-2')).toHaveLength(2);

    await seedJob('re-3', null);
    expect((await reassign(admin.cookie, 're-3', 'sa')).status).toBe(200);
    expect((await reassign(admin.cookie, 're-3', null)).status).toBe(200);
    expect(await perStore('re-3')).toEqual({ none: '1.6000', sa: '0.0000' });
  });

  test('does nothing for the store the job already has', async () => {
    await seedJob('re-4', 'sa');
    const res = await reassign(admin.cookie, 're-4', 'sa');
    expect(await res.json()).toEqual({ id: 're-4', storeId: 'sa', changed: false });
    expect(await audits('job:re-4')).toEqual([]);
    expect((await pool.query(`select count(*)::int as n from cost_entries where job_id = 're-4'`)).rows[0].n).toBe(1);
  });

  test('gives a Member 403 and changes nothing; refuses a hidden or unknown store and an unknown job', async () => {
    await seedJob('re-5', 'sa');
    expect((await reassign(member.cookie, 're-5', 'sb')).status).toBe(403);
    expect((await reassign(admin.cookie, 're-5', 'sh')).status).toBe(400);
    expect((await reassign(admin.cookie, 're-5', 'no-such-store')).status).toBe(400);
    expect((await reassign(admin.cookie, 're-5', 7)).status).toBe(400);
    expect((await reassign(admin.cookie, 'no-such-job', 'sb')).status).toBe(404);
    expect((await pool.query('select store_id from jobs where id = $1', ['re-5'])).rows[0].store_id).toBe('sa');
    expect(await perStore('re-5')).toEqual({ sa: '1.6000' });
    expect(await audits('job:re-5')).toEqual([]);
  });
});

describe('settings', () => {
  const get = async () => (await settingsRoute.GET(call(admin.cookie, '/api/admin/settings'))).json() as Promise<{ monthlyCapUsd: string; memberDailyClipCap: number; models: { id: string; enabled: boolean; priced: boolean }[] }>;
  const put = (body: unknown) => settingsRoute.PUT(call(admin.cookie, '/api/admin/settings', 'PUT', body));

  test('reads the two caps and the models', async () => {
    await seedModel();
    await pool.query(`insert into model_configs (id, provider, endpoint, label, ratios, durations_sec, sources, enabled) values ('draft-model', 'fal', 'x', 'Draft', '{}', '{}', '{}', false)`);
    const body = await get();
    expect(body).toMatchObject({ monthlyCapUsd: '200.0000', memberDailyClipCap: 5 });
    expect(body.models.find((m) => m.id === 'draft-model')).toMatchObject({ enabled: false, priced: false });
    expect(body.models.find((m) => m.id === 'fal-test')).toMatchObject({ enabled: true, priced: true });
  });

  test('lists the seeded image models as priced and lets an Admin switch one on and off, audited; one without prices cannot be enabled', async () => {
    const pro = (await get()).models.find((m) => m.id === 'nano-banana-pro-vertex');
    expect(pro).toMatchObject({ enabled: false, priced: true });
    expect((await put({ models: [{ id: 'nano-banana-pro-vertex', enabled: true }] })).status).toBe(200);
    expect((await audits('model:nano-banana-pro-vertex')).at(-1)).toEqual({ actor_id: admin.id, action: 'model.set_enabled', old_value: { enabled: false }, new_value: { enabled: true } });
    expect((await put({ models: [{ id: 'nano-banana-pro-vertex', enabled: false }] })).status).toBe(200);
    await pool.query(`insert into model_configs (id, provider, endpoint, label, kind, ratios, durations_sec, max_images, sources) values ('draft-image', 'fal', 'x', 'Draft image', 'image', '{auto}', '{}', 2, '{}')`);
    expect((await get()).models.find((m) => m.id === 'draft-image')).toMatchObject({ enabled: false, priced: false });
    expect((await put({ models: [{ id: 'draft-image', enabled: true }] })).status).toBe(400);
  });

  test('does not list the dearer row of a duplicate pair, refuses to switch it, and leaves it out of the Overview count', async () => {
    const listed = (await get()).models.map((m) => m.id);
    expect(listed).toContain('nano-banana-pro-vertex');
    for (const id of ['nano-banana-pro', 'seedream-5-pro', 'veo-3.1-vertex']) expect(listed, id).not.toContain(id);
    const hidden = (await pool.query('select count(*)::int as n from model_configs where twin_of is not null')).rows[0].n;
    const total = (await pool.query('select count(*)::int as n from model_configs')).rows[0].n;
    expect(listed).toHaveLength(total - hidden);
    const before = (await pool.query(`select enabled from model_configs where id = 'nano-banana-pro'`)).rows[0];
    expect((await put({ models: [{ id: 'nano-banana-pro', enabled: !before.enabled }] })).status).toBe(400);
    expect((await pool.query(`select enabled from model_configs where id = 'nano-banana-pro'`)).rows[0]).toEqual(before);
    expect(await audits('model:nano-banana-pro')).toEqual([]);
  });

  test('changes the caps, audited once with the old and new values, and writes nothing when they are unchanged', async () => {
    expect((await put({ monthlyCapUsd: '350.5', memberDailyClipCap: 8 })).status).toBe(200);
    expect(await get()).toMatchObject({ monthlyCapUsd: '350.5000', memberDailyClipCap: 8 });
    expect(await audits('settings:1')).toEqual([
      { actor_id: admin.id, action: 'settings.update', old_value: { monthlyCapUsd: '200.0000', memberDailyClipCap: 5 }, new_value: { monthlyCapUsd: '350.5000', memberDailyClipCap: 8 } },
    ]);
    expect((await put({ monthlyCapUsd: 350.5 })).status).toBe(200);
    expect(await audits('settings:1')).toHaveLength(1);
  });

  test('reads and changes the image and apps caps and the soft per-feature caps, each audited once', async () => {
    const before = (await (await settingsRoute.GET(call(admin.cookie, '/api/admin/settings'))).json()) as {
      featuresMonthlyCapUsd: string; memberDailyUsdCap: string; memberMonthlyUsdCap: string; featureCaps: { feature: string; monthlyUsd: string }[];
    };
    expect(before).toMatchObject({ featuresMonthlyCapUsd: '260.0000', memberDailyUsdCap: '10.0000', memberMonthlyUsdCap: '50.0000' });
    expect(before.featureCaps.find((c) => c.feature === 'motion_control')).toEqual({ feature: 'motion_control', monthlyUsd: '40.0000' });
    expect(before.featureCaps).toHaveLength(12);

    expect((await put({ featuresMonthlyCapUsd: '310', memberDailyUsdCap: '12.5', featureCaps: [{ feature: 'image', monthlyUsd: '150' }, { feature: 'reframe', monthlyUsd: '5' }] })).status).toBe(200);
    const after = (await (await settingsRoute.GET(call(admin.cookie, '/api/admin/settings'))).json()) as typeof before;
    expect(after).toMatchObject({ featuresMonthlyCapUsd: '310.0000', memberDailyUsdCap: '12.5000', memberMonthlyUsdCap: '50.0000' });
    expect(after.featureCaps.find((c) => c.feature === 'image')?.monthlyUsd).toBe('150.0000');
    expect((await audits('settings:1')).at(-1)).toEqual({
      actor_id: admin.id, action: 'settings.update',
      old_value: { featuresMonthlyCapUsd: '260.0000', memberDailyUsdCap: '10.0000' }, new_value: { featuresMonthlyCapUsd: '310.0000', memberDailyUsdCap: '12.5000' },
    });
    expect(await audits('feature:image')).toEqual([{ actor_id: admin.id, action: 'feature_cap.update', old_value: { monthlyUsd: '135.0000' }, new_value: { monthlyUsd: '150.0000' } }]);
    expect(await audits('feature:reframe')).toEqual([]); // unchanged
    expect((await put({ featureCaps: [{ feature: 'no-such-feature', monthlyUsd: '1' }] })).status).toBe(404);
  });

  test.each([{}, { monthlyCapUsd: -1 }, { monthlyCapUsd: 'lots' }, { monthlyCapUsd: '' }, { monthlyCapUsd: '0x10' }, { monthlyCapUsd: '1e2' }, { monthlyCapUsd: '1.23456' }, { memberDailyClipCap: 1.5 }, { memberDailyClipCap: -1 }, { models: [{ id: 'fal-test' }] }, { models: 'all' }, { memberDailyUsdCap: -1 }, { featuresMonthlyCapUsd: 'lots' }, { featureCaps: [{ feature: 'image' }] }, { featureCaps: 'all' }])('refuses %j', async (body) => {
    expect((await put(body)).status).toBe(400);
  });

  test('disables and enables a model, each audited once; an incomplete model cannot be enabled and nothing else changes', async () => {
    expect((await put({ models: [{ id: 'fal-test', enabled: false }] })).status).toBe(200);
    expect((await audits('model:fal-test')).at(-1)).toEqual({ actor_id: admin.id, action: 'model.set_enabled', old_value: { enabled: true }, new_value: { enabled: false } });
    expect((await put({ models: [{ id: 'fal-test', enabled: true }] })).status).toBe(200);
    expect(await audits('model:fal-test')).toHaveLength(2);
    expect((await put({ models: [{ id: 'fal-test', enabled: true }] })).status).toBe(200); // unchanged
    expect(await audits('model:fal-test')).toHaveLength(2);

    const before = await auditCount();
    const res = await put({ monthlyCapUsd: 999, models: [{ id: 'draft-model', enabled: true }] });
    expect(res.status).toBe(400);
    expect((await get()).monthlyCapUsd).toBe('350.5000');
    expect((await get()).models.find((m) => m.id === 'draft-model')?.enabled).toBe(false);
    expect(await auditCount()).toBe(before);
    expect((await put({ models: [{ id: 'no-such-model', enabled: true }] })).status).toBe(404);
  });

  test('reads the Vertex accounts and the active one, and changes their credits, each change audited once', async () => {
    type Vertex = { projectId: string; creditTotal: string | null; creditCurrency: string; creditExpiresOn: string | null; stopWhenCreditsEnd: boolean; configured: boolean };
    const vertex = async () => (await (await settingsRoute.GET(call(admin.cookie, '/api/admin/settings'))).json()) as { vertexActiveProject: string | null; vertexAccounts: Vertex[] };
    const before = await vertex();
    expect(before.vertexActiveProject).toBeNull();
    expect(before.vertexAccounts.find((a) => a.projectId === 'cvs-vertex')).toMatchObject({ creditTotal: '7825800', creditCurrency: 'VND', creditExpiresOn: '2026-12-30', stopWhenCreditsEnd: true });
    const seeded = { projectId: 'cvs-vertex', creditTotal: 7825800, creditCurrency: 'VND', creditExpiresOn: '2026-12-30', stopWhenCreditsEnd: true };
    const next = { projectId: 'creative-video-studio', creditTotal: '300', creditCurrency: 'USD', creditExpiresOn: null, stopWhenCreditsEnd: false };
    expect((await put({ vertexAccounts: [seeded, next] })).status).toBe(200);
    expect(await audits('vertex_account:cvs-vertex')).toEqual([]); // unchanged
    expect(await audits('vertex_account:creative-video-studio')).toEqual([
      { actor_id: admin.id, action: 'vertex_account.update', old_value: null, new_value: { creditTotal: '300.0000', creditCurrency: 'USD', creditExpiresOn: null, stopWhenCreditsEnd: false } },
    ]);
    expect((await put({ vertexAccounts: [{ ...seeded, stopWhenCreditsEnd: false, creditExpiresOn: '2027-01-15' }] })).status).toBe(200);
    expect(await audits('vertex_account:cvs-vertex')).toEqual([
      {
        actor_id: admin.id, action: 'vertex_account.update',
        old_value: { creditTotal: '7825800', creditCurrency: 'VND', creditExpiresOn: '2026-12-30', stopWhenCreditsEnd: true },
        new_value: { creditTotal: '7825800.0000', creditCurrency: 'VND', creditExpiresOn: '2027-01-15', stopWhenCreditsEnd: false },
      },
    ]);
    expect((await vertex()).vertexAccounts.find((a) => a.projectId === 'creative-video-studio')).toMatchObject({ creditTotal: '300.0000', creditCurrency: 'USD', creditExpiresOn: null });
  });

  const credits = { projectId: 'cvs-vertex', creditTotal: '1', creditCurrency: 'VND', creditExpiresOn: null, stopWhenCreditsEnd: true };
  test.each([
    { vertexAccounts: 'all' }, { vertexAccounts: [null] }, { vertexAccounts: [{ ...credits, projectId: 'X' }] }, { vertexAccounts: [{ ...credits, creditTotal: -1 }] },
    { vertexAccounts: [{ ...credits, creditCurrency: 'vnd' }] }, { vertexAccounts: [{ ...credits, creditExpiresOn: '2026-02-30' }] }, { vertexAccounts: [{ ...credits, creditExpiresOn: 'soon' }] },
    { vertexAccounts: [{ ...credits, stopWhenCreditsEnd: 'yes' }] }, { vertexAccounts: [credits, credits] },
  ])('refuses %j', async (body) => {
    expect((await put(body)).status).toBe(400);
  });

  describe('the BytePlus Seedance 2.0 resource pack', () => {
    type Pack = { totalTokens: number; tokens: number; asOf: string; expiresAt: string } | null;
    const pack = async () => ((await (await settingsRoute.GET(call(admin.cookie, '/api/admin/settings'))).json()) as { byteplusPack: Pack }).byteplusPack;
    const entry = { totalTokens: 7_000_000, tokens: 6_500_000, asOf: new Date(Date.now() - 3_600_000).toISOString().slice(0, 19) + 'Z', expiresAt: '2027-02-01T15:59:59Z' };

    test('reads the seed of migration 0076, and a new pack replaces it, audited once with the old and new values', async () => {
      expect(await pack()).toEqual({ totalTokens: 7_000_000, tokens: 6_891_100, asOf: '2026-11-06T02:50:00Z', expiresAt: '2027-02-01T15:59:59Z' });
      const n = (await audits('settings:1')).length;
      expect((await put({ byteplusPack: entry })).status).toBe(200);
      expect(await pack()).toEqual(entry);
      expect((await audits('settings:1')).slice(n)).toEqual([
        { actor_id: admin.id, action: 'settings.update', old_value: { byteplusPack: { totalTokens: 7_000_000, tokens: 6_891_100, asOf: '2026-11-06T02:50:00Z', expiresAt: '2027-02-01T15:59:59Z' } }, new_value: { byteplusPack: entry } },
      ]);
    });

    test('takes now as the as-of moment when it is left out', async () => {
      const { asOf: _asOf, ...noAsOf } = entry;
      const before = Date.now();
      expect((await put({ byteplusPack: noAsOf })).status).toBe(200);
      const at = Date.parse((await pack())!.asOf);
      expect(at).toBeGreaterThanOrEqual(before - 1000);
      expect(at).toBeLessThanOrEqual(Date.now());
    });

    test.each([
      null, 'all', {}, { ...entry, totalTokens: 0 }, { ...entry, totalTokens: 1.5 }, { ...entry, totalTokens: '7000000' }, { ...entry, tokens: -1 }, { ...entry, tokens: 7_000_001 }, { ...entry, tokens: 1.5 },
      { ...entry, totalTokens: 3_000_000_000, tokens: 1 }, { ...entry, asOf: '2026-11-07' }, { ...entry, asOf: '2026-11-07T01:00:00+07:00' }, { ...entry, asOf: '2026-02-30T00:00:00Z' },
      { ...entry, asOf: '2999-01-01T00:00:00Z' }, { ...entry, expiresAt: '2027-02-01' }, { ...entry, expiresAt: entry.asOf }, { ...entry, expiresAt: '2026-11-01T00:00:00Z' },
    ])('refuses %j and changes nothing', async (byteplusPack) => {
      const before = await pack();
      const n = (await audits('settings:1')).length;
      expect((await put({ byteplusPack })).status).toBe(400);
      expect(await pack()).toEqual(before);
      expect(await audits('settings:1')).toHaveLength(n);
    });

    test('the database refuses a pack with some fields missing or tokens above the total', async () => {
      await expect(pool.query('update settings set byteplus_pack_tokens = null where id = 1')).rejects.toThrow(/settings_byteplus_pack_check/);
      await expect(pool.query('update settings set byteplus_pack_tokens = byteplus_pack_total_tokens + 1 where id = 1')).rejects.toThrow(/settings_byteplus_pack_check/);
    });
  });

  test('reads and changes the balance warning, audited once; the Replicate credit is gone from the answer and ignored on save', async () => {
    type Balances = { balanceWarningUsd: string; replicateCreditUsd?: string | null };
    const balances = async () => (await (await settingsRoute.GET(call(admin.cookie, '/api/admin/settings'))).json()) as Balances;
    expect(await balances()).toMatchObject({ balanceWarningUsd: '10.0000' });
    expect('replicateCreditUsd' in (await balances())).toBe(false);
    const n = (await audits('settings:1')).length;

    expect((await put({ balanceWarningUsd: '15', replicateCreditUsd: '25.5' })).status).toBe(200);
    expect(await balances()).toMatchObject({ balanceWarningUsd: '15.0000' });
    expect((await audits('settings:1')).slice(n)).toEqual([
      { actor_id: admin.id, action: 'settings.update', old_value: { balanceWarningUsd: '10.0000' }, new_value: { balanceWarningUsd: '15.0000' } },
    ]);
    expect((await put({ balanceWarningUsd: 15 })).status).toBe(200);
    expect(await audits('settings:1')).toHaveLength(n + 1);
  });

  test.each([{ balanceWarningUsd: -1 }, { balanceWarningUsd: null }, { balanceWarningUsd: 'low' }, { replicateCreditUsd: '40' }])('refuses %j', async (body) => {
    expect((await put(body)).status).toBe(400);
  });
});

describe('presets', () => {
  // An Admin edits presets as a template editor does, in the pickers (the Admin page for them is gone).
  const patch = (id: string, body: unknown) => presetRoute.PATCH(call(admin.cookie, `/api/presets/${id}`, 'PATCH', body), ctx(id));
  const list = async () => ((await (await presetsRoute.GET(call(admin.cookie, '/api/presets'))).json()) as { presets: { id: string; label: string; prompt: string; enabled: boolean; sortOrder: number }[] }).presets;

  test('lists the presets in display order, enabled or not', async () => {
    const presets = await list();
    expect(presets.length).toBeGreaterThan(0);
    expect(presets.map((p) => p.sortOrder)).toEqual([...presets.map((p) => p.sortOrder)].sort((a, b) => a - b));
  });

  test('edits label, prompt and order and toggles enabled, audited once per edit with only the changed fields', async () => {
    const first = (await list())[0]!;
    const res = await patch(first.id, { label: 'New label', prompt: 'A new prompt.', sortOrder: 99 });
    expect(res.status).toBe(200);
    expect((await list()).find((p) => p.id === first.id)).toMatchObject({ label: 'New label', prompt: 'A new prompt.', sortOrder: 99, enabled: first.enabled });
    expect(await audits(`preset:${first.id}`)).toEqual([
      {
        actor_id: admin.id, action: 'preset.update',
        old_value: { label: first.label, prompt: first.prompt, sortOrder: first.sortOrder }, new_value: { label: 'New label', prompt: 'A new prompt.', sortOrder: 99 },
      },
    ]);
    expect((await patch(first.id, { enabled: !first.enabled })).status).toBe(200);
    expect((await audits(`preset:${first.id}`))[1]).toMatchObject({ old_value: { enabled: first.enabled }, new_value: { enabled: !first.enabled } });
    expect((await patch(first.id, { label: 'New label' })).status).toBe(200); // unchanged
    expect(await audits(`preset:${first.id}`)).toHaveLength(2);
  });

  test('refuses blank text, a fractional order, an empty change and an unknown preset', async () => {
    const first = (await list())[0]!;
    for (const body of [{ label: ' ' }, { prompt: '' }, { sortOrder: 1.5 }, { enabled: 'no' }, {}]) expect((await patch(first.id, body)).status).toBe(400);
    expect((await patch('no-such-preset', { label: 'X' })).status).toBe(404);
  });
});

describe('GET /api/admin/audit', () => {
  const get = async (query = '') => {
    const res = await GET_AUDIT(call(admin.cookie, `/api/admin/audit${query}`));
    return { status: res.status, body: (await res.json()) as { entries: { id: number; action: string; actorName: string; oldValue: unknown; newValue: unknown }[]; hasMore: boolean } };
  };

  test('lists the entries newest first with the actor, old and new values', async () => {
    const { status, body } = await get();
    expect(status).toBe(200);
    const ids = body.entries.map((e) => e.id);
    expect(ids).toEqual([...ids].sort((a, b) => b - a));
    expect(body.entries[0]).toMatchObject({ actorName: 'admin@example.test' });
    expect(body.entries.find((e) => e.action === 'store.reassign')).toMatchObject({ oldValue: expect.any(Object), newValue: expect.any(Object) });
  });

  test('filters by action and pages with hasMore', async () => {
    const { body } = await get('?action=store.reassign');
    expect(body.entries.length).toBeGreaterThan(0);
    expect(new Set(body.entries.map((e) => e.action))).toEqual(new Set(['store.reassign']));
    const first = await get('?limit=2');
    expect(first.body).toMatchObject({ hasMore: true });
    expect(first.body.entries).toHaveLength(2);
    const second = await get('?limit=2&offset=2');
    expect(second.body.entries[0]!.id).toBeLessThan(first.body.entries[1]!.id);
    expect((await get('?action=no.such.action')).body).toEqual({ entries: [], hasMore: false });
  });

  test('names the system as the actor of an entry the worker wrote', async () => {
    await pool.query(`insert into audit_entries (actor_id, action, target, new_value) values (null, 'vertex.switch_account', 'settings:1', '{"project":"cvs-vertex"}')`);
    expect((await get('?action=vertex.switch_account')).body.entries).toEqual([expect.objectContaining({ actorName: 'Hệ thống', newValue: { project: 'cvs-vertex' } })]);
  });

  test.each(['?limit=0', '?limit=201', '?limit=x', '?offset=-1'])('answers 400 for %s', async (query) => {
    expect((await get(query)).status).toBe(400);
  });
});
