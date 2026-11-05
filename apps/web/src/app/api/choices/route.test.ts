// Integration test against a disposable database on the compose Postgres (`pnpm services:up`).
import { randomBytes } from 'node:crypto';
import { createTestDatabase } from '@cvs/db/testing';
import { afterAll, describe, expect, test } from 'vitest';

const testDb = await createTestDatabase();
process.env.DATABASE_URL = testDb.url;
process.env.BETTER_AUTH_SECRET = randomBytes(32).toString('hex');
process.env.APP_URL = 'http://localhost';

const { auth, pool } = await import('@/lib/auth');
const { GET, POST } = await import('./route');
const { DELETE, PATCH } = await import('./[id]/route');
const { findChoice } = await import('@/lib/choices');
const { readableAsset } = await import('@/lib/assets');
const { ENDINGS, HOOKS } = await import('@/lib/marketing');

const PASSWORD = 'correct-horse-battery';
let seq = 0;

async function newUser(role: 'member' | 'admin' = 'member') {
  const email = `c${++seq}@example.test`;
  const { user } = await auth.api.createUser({ body: { email, name: email, password: PASSWORD, role } });
  const res = await auth.api.signInEmail({ body: { email, password: PASSWORD }, asResponse: true });
  return { id: user.id, cookie: res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ') };
}
type User = Awaited<ReturnType<typeof newUser>>;

const req = (u: User, path: string, init: RequestInit = {}) => new Request(`http://localhost${path}`, { ...init, headers: { 'content-type': 'application/json', cookie: u.cookie } });
const add = (u: User, body: Record<string, unknown>) => POST(req(u, '/api/choices', { method: 'POST', body: JSON.stringify(body) }));
type Listed = { id: string; name: string; desc: string; isCompany: boolean; mine: boolean; group: string; storeId: string | null; storeName: string | null; niche: string | null; imageAssetId: string | null };
type Lists = { hooks: Listed[]; locations: Listed[]; endings: Listed[]; often: { hook: string[]; location: string[]; ending: string[] }; posters: { hook: Record<string, string>; location: Record<string, string>; ending: Record<string, string> }; canShare: boolean };
const all = async (u: User, query = '') => (await (await GET(req(u, `/api/choices${query}`))).json()) as Lists;
/** The lists without the built-in choices, which every answer ends with. */
const lists = async (u: User, query = '') => {
  const l = await all(u, query);
  const own = (list: Listed[]) => list.filter((c) => c.group !== 'builtin');
  return { ...l, hooks: own(l.hooks), locations: own(l.locations), endings: own(l.endings) };
};
const change = (u: User, id: string, body: Record<string, unknown>) => PATCH(req(u, `/api/choices/${id}`, { method: 'PATCH', body: JSON.stringify(body) }), { params: Promise.resolve({ id }) });
const remove = (u: User, id: string) => DELETE(req(u, `/api/choices/${id}`, { method: 'DELETE' }), { params: Promise.resolve({ id }) });
const error = async (res: Response) => ((await res.json()) as { error: string }).error;
const hook = { kind: 'hook', name: 'Vẫy tay', phrase: 'The creator waves at the camera.' };

let jobSeq = 0;
/** A marketing job of the user, `days` ago, with the given params. */
async function job(userId: string, params: Record<string, string>, { days = 0, retryOf = null as string | null, deleted = false } = {}) {
  const id = `job-${++jobSeq}`;
  await pool.query(
    `insert into jobs (id, user_id, team_id, feature, model, provider, prompt, aspect, duration_s, params, input_asset_ids, status, retry_of, created_at, deleted_at)
     values ($1, $2, 'team-unassigned', 'marketing', 'kling-o3-pro', 'fal', 'p', '9:16', 5, $3, '{}', 'succeeded', $4, now() - make_interval(days => $5), case when $6 then now() end)`,
    [id, userId, JSON.stringify(params), retryOf, days, deleted],
  );
  return id;
}

/** A finished clip of the member's job: an output and a poster asset (the poster's id is returned), optionally the poster deleted since. */
async function clip(jobId: string, userId: string, { posterDeleted = false } = {}) {
  for (const kind of ['out', 'poster']) {
    await pool.query(`insert into assets (id, owner_id, kind, s3_key, filename, mime, bytes, deleted_at) values ($1, $2, 'output', $1, $1, $3, 1, case when $4 then now() end)`, [
      `${jobId}-${kind}`, userId, kind === 'out' ? 'video/mp4' : 'image/jpeg', kind === 'poster' && posterDeleted,
    ]);
  }
  await pool.query('update jobs set output_asset_id = $2, poster_asset_id = $3 where id = $1', [jobId, `${jobId}-out`, `${jobId}-poster`]);
  return `${jobId}-poster`;
}

afterAll(async () => {
  await pool.end();
  await testDb.drop();
});

describe('/api/choices', () => {
  test('adds a hook and lists it to its owner, own first then the company, newest first; a null description comes back empty', async () => {
    const [u, admin] = [await newUser(), await newUser('admin')];
    const res = await add(u, { ...hook, name: '  Vẫy tay  ', desc: 'Chào người xem' });
    expect(res.status).toBe(201);
    const created = (await res.json()) as { id: string };
    expect(created).toEqual({
      id: expect.any(String), kind: 'hook', name: 'Vẫy tay', desc: 'Chào người xem', phrase: hook.phrase, isCompany: false,
      group: 'mine', mine: true, storeId: null, storeName: null, niche: null, imageAssetId: null,
    });
    const second = (await (await add(u, { ...hook, name: 'Nhảy' })).json()) as { id: string };
    const company = (await (await add(admin, { ...hook, name: 'Công ty', isCompany: true })).json()) as { id: string };
    const spot = (await (await add(u, { kind: 'location', name: 'Quán', phrase: 'a small cafe' })).json()) as { id: string };
    const got = await lists(u);
    expect(got.hooks.map((h) => [h.id, h.mine, h.isCompany])).toEqual([[second.id, true, false], [created.id, true, false], [company.id, false, true]]);
    expect(got.hooks[0]!.desc).toBe(''); // null in the database
    expect(got.locations.map((l) => l.id)).toEqual([spot.id]);
    expect(got.canShare).toBe(false);
    expect((await lists(admin)).canShare).toBe(true);
  });

  test("hides a member's private item from another member and shows a company one to all; only the owner, or an Admin for a company one, deletes", async () => {
    const [a, b, admin, admin2] = [await newUser(), await newUser(), await newUser('admin'), await newUser('admin')];
    const own = (await (await add(a, hook)).json()) as { id: string };
    const company = (await (await add(admin, { ...hook, isCompany: true })).json()) as { id: string };
    const adminPrivate = (await (await add(admin, hook)).json()) as { id: string };
    const seen = async () => (await lists(b)).hooks.map((h) => h.id);
    expect(await seen()).toContain(company.id);
    expect(await seen()).not.toContain(own.id);
    expect(await seen()).not.toContain(adminPrivate.id);
    expect((await remove(b, own.id)).status).toBe(404);
    expect((await remove(b, company.id)).status).toBe(404);
    expect((await remove(admin2, own.id)).status).toBe(404); // an Admin deletes only company items of others
    expect((await remove(admin2, adminPrivate.id)).status).toBe(404);
    expect((await remove(a, own.id)).status).toBe(204);
    expect((await remove(admin2, company.id)).status).toBe(204);
    expect(await seen()).not.toContain(company.id);
    expect((await remove(a, own.id)).status).toBe(404);
  });

  test('refuses bad names, phrases, descriptions and kinds, control characters and newlines, and sharing by a member', async () => {
    const u = await newUser();
    for (const [body, message] of [
      [{ ...hook, name: '' }, 'name must have 1 to 40 characters on one line'],
      [{ ...hook, name: '   ' }, 'name must have 1 to 40 characters on one line'],
      [{ ...hook, name: 'x'.repeat(41) }, 'name must have 1 to 40 characters on one line'],
      [{ ...hook, name: 'a\nb' }, 'name must have 1 to 40 characters on one line'],
      [{ ...hook, phrase: 'x'.repeat(301) }, 'phrase must have 1 to 300 characters on one line'],
      [{ ...hook, phrase: 'line one\nline two' }, 'phrase must have 1 to 300 characters on one line'],
      [{ ...hook, phrase: 'tab\there' }, 'phrase must have 1 to 300 characters on one line'],
      [{ ...hook, phrase: 'bell\u0007' }, 'phrase must have 1 to 300 characters on one line'],
      [{ ...hook, phrase: 'line separator' }, 'phrase must have 1 to 300 characters on one line'],
      [{ ...hook, phrase: 5 }, 'phrase must have 1 to 300 characters on one line'],
      [{ ...hook, desc: 'x'.repeat(101) }, 'desc may have at most 100 characters on one line'],
      [{ ...hook, desc: 'a\rb' }, 'desc may have at most 100 characters on one line'],
      [{ ...hook, kind: 'music' }, 'kind must be hook, location or ending'],
      [{ ...hook, isCompany: 'yes' }, 'isCompany must be true or false'],
    ] as const) {
      const res = await add(u, body);
      expect([res.status, await error(res)], JSON.stringify(body)).toEqual([400, message]);
    }
    const shared = await add(u, { ...hook, isCompany: true });
    expect([shared.status, await error(shared)]).toEqual([403, 'only an Admin or a template editor shares with the company']);
    expect((await add(u, { ...hook, name: 'x'.repeat(40), phrase: 'y'.repeat(300), desc: 'z'.repeat(100) })).status).toBe(201);
    expect((await pool.query('select count(*)::int as n from user_choices where user_id = $1', [u.id])).rows[0].n).toBe(1);
  });

  test('keeps at most 50 of each kind per member and refuses the 51st, while the other kind still has room', async () => {
    const u = await newUser();
    await pool.query(`insert into user_choices (id, user_id, kind, name, phrase) select $1 || g, $1, 'hook', 'h' || g, 'p' from generate_series(1, 49) g`, [u.id]);
    expect((await add(u, hook)).status).toBe(201);
    const res = await add(u, hook);
    expect([res.status, await error(res)]).toEqual([409, 'you can keep at most 50 hooks; delete one first']);
    expect((await add(u, { kind: 'location', name: 'Quán', phrase: 'a cafe' })).status).toBe(201);
  });

  test('often: the ids used twice or more in 90 days by own first runs of that format, most used first, at most 12, only ids still in the lists', async () => {
    const [u, other] = [await newUser(), await newUser()];
    const mine = (await (await add(u, hook)).json()) as { id: string };
    const gone = (await (await add(u, hook)).json()) as { id: string };
    for (let i = 0; i < 3; i++) await job(u.id, { hook: mine.id, location: 'kitchen' });
    for (let i = 0; i < 2; i++) await job(u.id, { hook: 'blizzard', location: 'gym' });
    await job(u.id, { hook: 'flip-fail' }); // once
    await job(u.id, { hook: 'strange-mic' }, { days: 91 });
    await job(u.id, { hook: 'strange-mic' }, { days: 91 }); // twice, but too long ago
    const first = await job(u.id, { hook: 'product-drop' });
    await job(u.id, { hook: 'product-drop' }, { retryOf: first }); // a retry does not count
    await job(u.id, { hook: 'product-catch' });
    await job(u.id, { hook: 'product-catch' }, { deleted: true }); // nor does a deleted job
    await job(u.id, { hook: 'dramatic-arrival', format: 'advanced' });
    await job(u.id, { hook: 'dramatic-arrival', format: 'advanced' }); // Advanced only
    await job(u.id, { hook: gone.id });
    await job(u.id, { hook: gone.id });
    await remove(u, gone.id); // deleted since: not offered
    await job(other.id, { hook: 'flip-fail' }); // another member's
    await job(other.id, { hook: 'flip-fail' });
    expect((await lists(u)).often).toEqual({ hook: [mine.id, 'blizzard'], location: ['kitchen', 'gym'], ending: [] });
    expect((await lists(u, '?format=advanced')).often).toEqual({ hook: ['dramatic-arrival'], location: [], ending: [] });
    expect((await lists(await newUser())).often).toEqual({ hook: [], location: [], ending: [] });

    // At most 12: 13 own hooks used twice each.
    const many = await newUser();
    for (let i = 0; i < 13; i++) {
      const c = (await (await add(many, { ...hook, name: `h${i}` })).json()) as { id: string };
      await job(many.id, { hook: c.id }, { days: 13 - i });
      await job(many.id, { hook: c.id }, { days: 13 - i });
    }
    expect((await lists(many)).often.hook).toHaveLength(12);
  });

  test("posters: each often-used id gets the poster of the caller's latest live clip with it, never another member's", async () => {
    const [u, other] = [await newUser(), await newUser()];
    const mine = (await (await add(u, hook)).json()) as { id: string };
    const old = await clip(await job(u.id, { hook: mine.id, location: 'kitchen' }, { days: 3 }), u.id);
    const latest = await clip(await job(u.id, { hook: mine.id, location: 'kitchen' }, { days: 2 }), u.id);
    await clip(await job(u.id, { hook: mine.id }, { days: 1, deleted: true }), u.id); // a deleted clip is skipped
    await clip(await job(u.id, { hook: mine.id }), u.id, { posterDeleted: true }); // so is a clip whose poster is gone
    await job(u.id, { hook: 'blizzard' });
    await job(u.id, { hook: 'blizzard' }); // often used, but with no clip
    await clip(await job(other.id, { hook: 'blizzard' }), other.id);
    await clip(await job(other.id, { hook: 'blizzard' }), other.id); // another member's clips stay theirs
    await clip(await job(u.id, { hook: 'flip-fail' }), u.id); // used once: not often, so no poster
    const got = await lists(u);
    expect(got.often.hook).toEqual([mine.id, 'blizzard']);
    expect(got.posters).toEqual({ hook: { [mine.id]: latest }, location: { kitchen: latest }, ending: {} });
    expect(old).not.toBe(latest);
    expect((await lists(other)).posters.hook).toEqual({ blizzard: expect.stringMatching(/-poster$/) });
    expect((await lists(u, '?format=advanced')).posters).toEqual({ hook: {}, location: {}, ending: {} }); // the UGC clips are not Advanced ones
  });

  test('refuses a bad format and an unauthenticated caller', async () => {
    const u = await newUser();
    expect((await GET(req(u, '/api/choices?format=ugc'))).status).toBe(400);
    expect((await GET(new Request('http://localhost/api/choices'))).status).toBe(401);
    expect((await POST(new Request('http://localhost/api/choices', { method: 'POST', body: JSON.stringify(hook) }))).status).toBe(401);
  });
});

describe('/api/choices by store, niche, photo and ending', { timeout: 30_000 }, () => {
  let storeSeq = 0;
  async function store(hidden = false) {
    const id = `st${++storeSeq}`;
    await pool.query(`insert into stores (id, name, code, hidden) values ($1, $2, $1, $3)`, [id, `Shop ${id}`, hidden]);
    return id;
  }
  async function editor() {
    const u = await newUser();
    await pool.query('update users set can_edit_templates = true where id = $1', [u.id]);
    return u;
  }
  let assetSeq = 0;
  async function asset(ownerId: string, { mime = 'image/jpeg', kind = 'input', deleted = false } = {}) {
    const id = `ca${++assetSeq}`;
    await pool.query(`insert into assets (id, owner_id, kind, s3_key, filename, mime, bytes, deleted_at) values ($1, $2, $3, $1, 'f.jpg', $4, 1, case when $5 then now() end)`, [id, ownerId, kind, mime, deleted]);
    return id;
  }
  const created = async (res: Response) => {
    expect(res.status, await res.clone().text()).toBe(201);
    return (await res.json()) as Listed;
  };
  const ids = (list: Listed[]) => list.map((c) => c.id);

  test("a member shares to a store: every member sees it under that store (and with no store asked), not under another; the company's and own private ones show under any store", async () => {
    const [a, b, admin] = [await newUser(), await newUser(), await newUser('admin')];
    const [s1, s2] = [await store(), await store()];
    const shared = await created(await add(a, { ...hook, name: 'Cửa hàng 1', storeId: s1, niche: 'Áo dài' }));
    expect(shared).toMatchObject({ group: 'store', storeId: s1, storeName: `Shop ${s1}`, niche: 'Áo dài', isCompany: false, mine: true });
    const company = await created(await add(admin, { ...hook, isCompany: true }));
    const own = await created(await add(b, hook));
    // Own first, then newest first; company entries of the other tests left out.
    const these = async (query = '') => ids((await lists(b, query)).hooks).filter((id) => [own.id, company.id, shared.id].includes(id));
    expect(await these(`?storeId=${s1}`)).toEqual([own.id, company.id, shared.id]);
    expect(await these(`?storeId=${s2}`)).toEqual([own.id, company.id]);
    expect(await these()).toEqual([own.id, company.id, shared.id]);
    expect((await lists(b, `?storeId=${s1}`)).hooks.find((c) => c.id === shared.id)).toMatchObject({ group: 'store', mine: false, storeName: `Shop ${s1}` });
    expect((await lists(b)).hooks.find((c) => c.id === company.id)!.group).toBe('company');
    // A store hidden since takes its entries out of every list and out of what a job may use.
    expect(await findChoice(b.id, 'hook', shared.id)).toMatchObject({ id: shared.id, builtIn: false, isCompany: false });
    await pool.query('update stores set hidden = true where id = $1', [s1]);
    expect(ids((await lists(b)).hooks)).not.toContain(shared.id);
    expect(ids((await lists(a)).hooks)).not.toContain(shared.id);
    expect(await findChoice(b.id, 'hook', shared.id)).toBeUndefined();
  });

  test('only an editor or an Admin shares with the company; a member may share to a store, never to a hidden or unknown one, nor to a store and the company at once', async () => {
    const [member, ed, admin] = [await newUser(), await editor(), await newUser('admin')];
    const [open, hidden] = [await store(), await store(true)];
    const refused = await add(member, { ...hook, isCompany: true });
    expect([refused.status, await error(refused)]).toEqual([403, 'only an Admin or a template editor shares with the company']);
    expect((await created(await add(ed, { ...hook, isCompany: true }))).group).toBe('company');
    expect((await created(await add(admin, { ...hook, isCompany: true }))).group).toBe('company');
    expect((await created(await add(member, { ...hook, storeId: open }))).group).toBe('store');
    for (const [body, message] of [
      [{ ...hook, storeId: hidden }, 'the store does not exist or is hidden'],
      [{ ...hook, storeId: 'nope' }, 'the store does not exist or is hidden'],
      [{ ...hook, storeId: 5 }, 'storeId is a store id or null'],
      [{ ...hook, storeId: open, isCompany: true }, 'storeId is a store id, given without isCompany'],
    ] as const) {
      const res = await add(ed, body);
      expect([res.status, await error(res)], JSON.stringify(body)).toEqual([400, message]);
    }
    expect((await lists(member)).canShare).toBe(false);
    expect((await lists(ed)).canShare).toBe(true);
  });

  test("the owner changes and deletes their own; an editor or an Admin any store or company entry; nobody else, and nobody another member's private one", async () => {
    const [a, b, ed] = [await newUser(), await newUser(), await editor()];
    const s = await store();
    const mine = await created(await add(a, hook));
    const shared = await created(await add(a, { ...hook, storeId: s }));
    const company = await created(await add(ed, { ...hook, isCompany: true }));
    expect((await change(b, shared.id, { name: 'Đổi' })).status).toBe(404);
    expect((await change(b, company.id, { name: 'Đổi' })).status).toBe(404);
    expect((await change(ed, mine.id, { name: 'Đổi' })).status).toBe(404);
    expect((await remove(b, shared.id)).status).toBe(404);
    expect((await remove(ed, mine.id)).status).toBe(404);
    const renamed = await change(a, mine.id, { name: 'Tên mới', niche: 'Giày', desc: 'Mô tả' });
    expect(renamed.status).toBe(200);
    expect(await renamed.json()).toMatchObject({ id: mine.id, name: 'Tên mới', niche: 'Giày', desc: 'Mô tả', phrase: hook.phrase, group: 'mine' });
    // Giving one share level turns the other off; the member may not make it a company one.
    expect(await (await change(a, mine.id, { storeId: s })).json()).toMatchObject({ group: 'store', storeId: s, isCompany: false });
    expect((await change(a, mine.id, { isCompany: true })).status).toBe(403);
    expect(await (await change(ed, mine.id, { isCompany: true })).json()).toMatchObject({ group: 'company', storeId: null, isCompany: true, mine: false });
    expect(await (await change(ed, shared.id, { phrase: 'New words.' })).json()).toMatchObject({ phrase: 'New words.', group: 'store' });
    expect((await change(a, shared.id, { name: '' })).status).toBe(400);
    expect((await change(a, shared.id, { niche: 'x'.repeat(31) })).status).toBe(400);
    expect(await (await change(a, shared.id, { niche: '' })).json()).toMatchObject({ niche: null });
    expect((await remove(ed, shared.id)).status).toBe(204);
    expect((await remove(ed, company.id)).status).toBe(204);
    expect((await remove(ed, mine.id)).status).toBe(204); // a company one now
  });

  test("a photo must be the caller's own live uploaded picture; a store or company entry's photo is readable by every member, a private one's is not", async () => {
    const [a, b] = [await newUser(), await newUser()];
    const s = await store();
    const [photo, other, video, gone, output] = [await asset(a.id), await asset(b.id), await asset(a.id, { mime: 'video/mp4' }), await asset(a.id, { deleted: true }), await asset(a.id, { kind: 'output' })];
    for (const imageAssetId of [other, video, gone, output, 'nope', 5]) {
      const res = await add(a, { ...hook, kind: 'location', imageAssetId });
      expect([res.status, await error(res)], String(imageAssetId)).toEqual([400, 'imageAssetId must be one of your own uploaded photos']);
    }
    const spot = await created(await add(a, { ...hook, kind: 'location', imageAssetId: photo }));
    expect(spot.imageAssetId).toBe(photo);
    const session = (u: User) => ({ user: { id: u.id, role: 'user' } }) as Parameters<typeof readableAsset>[0];
    expect((await readableAsset(session(b), photo)).error?.status).toBe(403); // private: the owner only
    await change(a, spot.id, { storeId: s });
    expect((await readableAsset(session(b), photo)).asset?.id).toBe(photo);
    expect((await change(b, spot.id, { imageAssetId: other })).status).toBe(404);
    expect(await (await change(a, spot.id, { imageAssetId: null })).json()).toMatchObject({ imageAssetId: null });
    expect((await readableAsset(session(b), photo)).error?.status).toBe(403);
    // A photo deleted since is left out of the list.
    await change(a, spot.id, { imageAssetId: photo });
    await pool.query('update assets set deleted_at = now() where id = $1', [photo]);
    expect((await lists(a, '?kind=location')).locations.find((c) => c.id === spot.id)!.imageAssetId).toBeNull();
  });

  test('?kind= fills one list, ?niche= keeps that niche and drops the built-in ones; endings are a kind with their own built-in list', async () => {
    const u = await newUser();
    const tagged = await created(await add(u, { ...hook, niche: 'Túi xách' }));
    await created(await add(u, hook));
    const ending = await created(await add(u, { kind: 'ending', name: 'Cười', phrase: 'The clip ends with a smile.', niche: 'Túi xách' }));
    const full = await all(u);
    expect(full.endings.filter((c) => c.group === 'builtin').map((c) => c.id)).toEqual(ENDINGS.map((c) => c.id));
    expect(full.hooks.filter((c) => c.group === 'builtin').map((c) => c.id)).toEqual(HOOKS.map((c) => c.id));
    const hooksOnly = await all(u, '?kind=hook');
    expect([hooksOnly.hooks.filter((c) => c.mine || c.group === 'builtin').length, hooksOnly.locations.length, hooksOnly.endings.length]).toEqual([2 + HOOKS.length, 0, 0]);
    const niche = await all(u, `?niche=${encodeURIComponent('Túi xách')}`);
    expect([ids(niche.hooks), ids(niche.endings), ids(niche.locations)]).toEqual([[tagged.id], [ending.id], []]);
    expect((await GET(req(u, '/api/choices?kind=music'))).status).toBe(400);
    expect(await findChoice(u.id, 'ending', ending.id)).toMatchObject({ id: ending.id, phrase: 'The clip ends with a smile.' });
    expect(await findChoice(u.id, 'ending', ENDINGS[0]!.id)).toMatchObject({ builtIn: true });
    expect(await findChoice(u.id, 'hook', ending.id)).toBeUndefined();
  });

  test('the 50 a member keeps count store ones too, company ones do not; taking a company one back needs room', async () => {
    const u = await newUser();
    const s = await store();
    await pool.query(`insert into user_choices (id, user_id, kind, name, phrase) select $1 || g, $1, 'hook', 'h' || g, 'p' from generate_series(1, 50) g`, [u.id]);
    expect((await add(u, hook)).status).toBe(409);
    expect((await add(u, { ...hook, storeId: s })).status).toBe(409);
    await pool.query("update users set can_edit_templates = true where id = $1", [u.id]);
    const company = await created(await add(u, { ...hook, isCompany: true }));
    const res = await change(u, company.id, { isCompany: false, storeId: s });
    expect([res.status, await error(res)]).toEqual([409, 'the owner keeps at most 50 hooks; delete one first']);
  });
});
