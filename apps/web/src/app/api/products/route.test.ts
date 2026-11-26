// /api/products against a disposable database on the compose Postgres (`pnpm services:up`): a member's saved products, who sees and changes them (the owner, in the
// active workspace, nobody else), what a product may name (their own live images and a store they may use), and the name and count limits.
import { randomBytes } from 'node:crypto';
import { createTestDatabase } from '@cvs/db/testing';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';

vi.setConfig({ testTimeout: 60_000 });

const testDb = await createTestDatabase();
process.env.DATABASE_URL = testDb.url;
process.env.BETTER_AUTH_SECRET = randomBytes(32).toString('hex');
process.env.APP_URL = 'http://localhost';

const { auth, pool } = await import('@/lib/auth');
const { stopBoss } = await import('@/lib/queue');
const { GET, POST } = await import('./route');
const { DELETE, PATCH } = await import('./[id]/route');

const PASSWORD = 'correct-horse-battery';
type Who = { id: string; cookie: string };
const users: Record<string, Who> = {};
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

async function newUser(name: string, teamId?: string): Promise<Who> {
  const email = `${name}@example.test`;
  const { user } = await auth.api.createUser({ body: { email, name, password: PASSWORD, role: 'member', ...(teamId && { data: { teamId } }) } });
  const res = await auth.api.signInEmail({ body: { email, password: PASSWORD }, asResponse: true });
  return { id: user.id, cookie: res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ') };
}
const req = (who: Who | null, path: string, method = 'GET', body?: unknown, extra = '') =>
  new Request(`http://localhost${path}`, { method, headers: { 'content-type': 'application/json', ...(who && { cookie: who.cookie + extra }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
type Listed = { id: string; name: string; storeId: string | null; storeName: string | null; productType: string | null; photos: { id: string; filename: string }[]; createdAt: string };
const list = async (who: Who, query = '', extra = '') => ((await (await GET(req(who, `/api/products${query}`, 'GET', undefined, extra))).json()) as { products: Listed[] }).products;
const add = (who: Who, body: unknown, extra = '') => POST(req(who, '/api/products', 'POST', body, extra));
const change = (who: Who, id: string, body: unknown, extra = '') => PATCH(req(who, `/api/products/${id}`, 'PATCH', body, extra), ctx(id));
const remove = (who: Who, id: string, extra = '') => DELETE(req(who, `/api/products/${id}`, 'DELETE', undefined, extra), ctx(id));
const createdId = async (res: Response) => ((await res.json()) as { id: string }).id;

let seq = 0;
/** An asset of `owner`: a live input image unless `o` says otherwise; returns its id. */
async function asset(owner: string, o: { mime?: string; kind?: string; workspace?: string; deleted?: boolean; name?: string } = {}): Promise<string> {
  const id = `pa-${++seq}`;
  await pool.query(`insert into assets (id, owner_id, kind, s3_key, filename, mime, bytes, workspace_id, deleted_at) values ($1, $2, $3, $1, $4, $5, 1, $6, ${o.deleted ? 'now()' : 'null'})`, [id, owner, o.kind ?? 'input', o.name ?? `${id}.png`, o.mime ?? 'image/png', o.workspace ?? 'ws_vet']);
  return id;
}
const photos = (owner: string, n: number, o: Parameters<typeof asset>[1] = {}) => Promise.all(Array.from({ length: n }, () => asset(owner, o)));

beforeAll(async () => {
  await pool.query(`insert into teams (id, name, billable) values ('sales-a', 'Sales A', true), ('sales-b', 'Sales B', true)`);
  await pool.query(`insert into workspaces (id, name) values ('ws_p', 'Partner P')`);
  await pool.query(
    `insert into stores (id, name, code, workspace_id, team_id, hidden) values
       ('st-open', 'Open Shop', 'O', 'ws_vet', null, false), ('st-hidden', 'Hidden Shop', 'H', 'ws_vet', null, true),
       ('st-a', 'A Shop', 'A', 'ws_vet', 'sales-a', false), ('st-b', 'B Shop', 'B', 'ws_vet', 'sales-b', false), ('st-partner', 'Partner Shop', 'P', 'ws_p', null, false)`,
  );
  users.ann = await newUser('ann');
  users.bob = await newUser('bob');
  users.carl = await newUser('carl'); // the limit tests
  users.dina = await newUser('dina'); // the limit race
  users.erin = await newUser('erin'); // the limit across workspaces
  users.seller = await newUser('seller', 'sales-a');
  for (const who of ['ann', 'bob', 'erin']) await pool.query(`insert into workspace_members (workspace_id, user_id, role) values ('ws_p', $1, 'member')`, [users[who]!.id]);
});

afterAll(async () => {
  try {
    await stopBoss();
    await pool.end();
  } finally {
    await testDb.drop();
  }
});

describe('POST and GET /api/products', () => {
  test('saves a product of two of the caller’s own photos and lists it first, with its photos in order, its store’s name and its type; ?storeId= filters', async () => {
    const [a, b] = await photos(users.ann!.id, 2);
    const first = await add(users.ann!, { name: 'Áo thun mèo', storeId: 'st-open', productType: 'tshirt', assetIds: [b, a] });
    expect(first.status).toBe(201);
    const made = (await first.json()) as Listed;
    expect(made).toMatchObject({ name: 'Áo thun mèo', storeId: 'st-open', storeName: 'Open Shop', productType: 'tshirt', photos: [{ id: b }, { id: a }] });
    const [c, d] = await photos(users.ann!.id, 2);
    const second = await createdId(await add(users.ann!, { name: 'Cốc chó', assetIds: [c, d] }));
    expect((await list(users.ann!)).map((p) => p.id)).toEqual([second, made.id]); // newest first
    expect((await list(users.ann!, '?storeId=st-open')).map((p) => p.id)).toEqual([made.id]);
    expect((await list(users.ann!)).find((p) => p.id === second)).toMatchObject({ storeId: null, storeName: null, productType: null });
    expect(await list(users.bob!)).toEqual([]);
    expect((await GET(req(null, '/api/products'))).status).toBe(401);
    expect((await add(users.ann!, { name: 'x', assetIds: [a, b] }).then((r) => r.status))).toBe(201);
  });

  test('answers 400 for a photo count other than 2 to 4, repeated ids, a video or audio, another member’s, another workspace’s or a deleted asset', async () => {
    const own = await photos(users.ann!.id, 5);
    const video = await asset(users.ann!.id, { mime: 'video/mp4' });
    const audio = await asset(users.ann!.id, { mime: 'audio/mpeg' });
    const theirs = await asset(users.bob!.id);
    const elsewhere = await asset(users.ann!.id, { workspace: 'ws_p' });
    const gone = await asset(users.ann!.id, { deleted: true });
    const output = await asset(users.ann!.id, { kind: 'output' });
    const attempt = (name: string, assetIds: unknown) => add(users.ann!, { name, assetIds });
    for (const [label, ids] of [
      ['one photo', own.slice(0, 1)],
      ['five photos', own],
      ['a repeated id', [own[0], own[0]]],
      ['no list', undefined],
      ['not text', [own[0], 7]],
      ['a video', [own[0], video]],
      ['audio', [own[0], audio]],
      ['another member’s photo', [own[0], theirs]],
      ['another workspace’s photo', [own[0], elsewhere]],
      ['a deleted photo', [own[0], gone]],
      ['an output', [own[0], output]],
      ['an unknown id', [own[0], 'nope']],
    ] as const) expect((await attempt(`Bad ${label}`, ids)).status, label).toBe(400);
    expect(await list(users.ann!, '?storeId=none')).toEqual([]);
    expect((await pool.query(`select count(*)::int as n from products where name like 'Bad %'`)).rows[0].n).toBe(0);
  });

  test('answers 400 for an empty or too long name, a name with a newline, an unknown type, a hidden store and another workspace’s store', async () => {
    const [a, b] = await photos(users.ann!.id, 2);
    const attempt = (body: Record<string, unknown>) => add(users.ann!, { name: 'Valid', assetIds: [a, b], ...body });
    for (const [label, body] of [
      ['empty name', { name: '' }],
      ['spaces', { name: '   ' }],
      ['no name', { name: undefined }],
      ['61 characters', { name: 'x'.repeat(61) }],
      ['a newline', { name: 'two\nlines' }],
      ['an unknown type', { productType: 'spaceship' }],
      ['a hidden store', { storeId: 'st-hidden' }],
      ['another workspace’s store', { storeId: 'st-partner' }],
      ['an unknown store', { storeId: 'nope' }],
    ] as const) expect((await attempt(body)).status, label).toBe(400);
    expect((await attempt({ name: 'x'.repeat(60) })).status).toBe(201); // 60 is the limit
    expect((await attempt({ name: '😀'.repeat(60) })).status).toBe(201); // counted in characters, not UTF-16 units
  });

  test('answers 403 store_not_in_team for the store of another team when the caller is in a billing team, and takes their own team’s and a store of none', async () => {
    const [a, b] = await photos(users.seller!.id, 2);
    const res = await add(users.seller!, { name: 'Seller B', storeId: 'st-b', assetIds: [a, b] });
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: 'store_not_in_team' });
    expect((await add(users.seller!, { name: 'Seller A', storeId: 'st-a', assetIds: [a, b] })).status).toBe(201);
    expect((await add(users.seller!, { name: 'Seller none', assetIds: [a, b] })).status).toBe(201);
  });

  test('a name taken without regard to case, or typed in another Unicode form, is 409 product_name_taken; the stored name is NFC; another member and workspace may reuse it', async () => {
    const [a, b] = await photos(users.bob!.id, 2);
    expect((await add(users.bob!, { name: 'Áo thun mèo', assetIds: [a, b] })).status).toBe(201);
    for (const name of ['áo thun mèo', 'ÁO THUN MÈO', 'Áo thun mèo'.normalize('NFD'), '  Áo thun mèo  ']) {
      const res = await add(users.bob!, { name, assetIds: [a, b] });
      expect([name, res.status]).toEqual([name, 409]);
      expect(await res.json()).toMatchObject({ code: 'product_name_taken' });
    }
    expect((await pool.query(`select name from products where user_id = $1`, [users.bob!.id])).rows.map((r) => r.name)).toEqual(['Áo thun mèo'.normalize('NFC')]);
    expect((await pool.query(`select name from products where user_id = $1 and name = $2`, [users.bob!.id, 'Áo thun mèo'.normalize('NFD')])).rowCount).toBe(0);
    // Another member keeps the same name, and so does the same member in another workspace.
    const [c, d] = await photos(users.seller!.id, 2);
    expect((await add(users.seller!, { name: 'Áo thun mèo', assetIds: [c, d] })).status).toBe(201);
    const [e, f] = await photos(users.bob!.id, 2, { workspace: 'ws_p' });
    expect((await add(users.bob!, { name: 'Áo thun mèo', assetIds: [e, f] }, '; cvs_ws=ws_p')).status).toBe(201);
    expect((await list(users.bob!, '', '; cvs_ws=ws_p')).map((p) => p.name)).toEqual(['Áo thun mèo']); // the workspace sees its own only
    expect((await list(users.bob!)).map((p) => p.name)).toEqual(['Áo thun mèo']);
  });

  test('the 101st product is 409 product_limit (counted across workspaces), and two parallel adds at 99 give exactly one 201', async () => {
    const carl = users.carl!;
    const [a, b] = await photos(carl.id, 2);
    await pool.query(`insert into products (id, user_id, workspace_id, name, asset_ids) select 'bulk-' || n, $1, 'ws_vet', 'Bulk ' || n, $2::text[] from generate_series(1, 99) n`, [carl.id, [a, b]]);
    expect((await add(carl, { name: 'Hundredth', assetIds: [a, b] })).status).toBe(201);
    const res = await add(carl, { name: 'Over', assetIds: [a, b] });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: 'product_limit' });

    const dina = users.dina!;
    const [c, d] = await photos(dina.id, 2);
    await pool.query(`insert into products (id, user_id, workspace_id, name, asset_ids) select 'dina-' || n, $1, 'ws_vet', 'Dina ' || n, $2::text[] from generate_series(1, 99) n`, [dina.id, [c, d]]);
    const race = await Promise.all([add(dina, { name: 'Race one', assetIds: [c, d] }), add(dina, { name: 'Race two', assetIds: [c, d] })]);
    expect(race.map((r) => r.status).sort()).toEqual([201, 409]);
    expect((await pool.query(`select count(*)::int as n from products where user_id = $1`, [dina.id])).rows[0].n).toBe(100);
  });

  test('the limit is per member, not per workspace: products in one workspace count against an add in another', async () => {
    const erin = users.erin!;
    const [a, b] = await photos(erin.id, 2);
    await pool.query(`insert into products (id, user_id, workspace_id, name, asset_ids) select 'erin-' || n, $1, 'ws_vet', 'Erin ' || n, $2::text[] from generate_series(1, 99) n`, [erin.id, [a, b]]);
    const [c, d] = await photos(erin.id, 2, { workspace: 'ws_p' });
    expect((await add(erin, { name: 'Partner one', assetIds: [c, d] }, '; cvs_ws=ws_p')).status).toBe(201);
    const res = await add(erin, { name: 'Partner two', assetIds: [c, d] }, '; cvs_ws=ws_p');
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: 'product_limit' });
  });

  test('a photo deleted after the product was saved drops out of the list, and the others keep their order', async () => {
    const [a, b, c] = await photos(users.ann!.id, 3);
    const id = await createdId(await add(users.ann!, { name: 'Three photos', assetIds: [a, b, c] }));
    await pool.query(`update assets set deleted_at = now() where id = $1`, [b]);
    expect((await list(users.ann!)).find((p) => p.id === id)!.photos.map((p) => p.id)).toEqual([a, c]);
  });
});

describe('PATCH /api/products/[id]', () => {
  test('changes the name, store, type and photos, and reorders the photos; GET shows the new order', async () => {
    const [a, b, c] = await photos(users.ann!.id, 3);
    const id = await createdId(await add(users.ann!, { name: 'Patch me', assetIds: [a, b] }));
    const res = await change(users.ann!, id, { name: 'Patched', storeId: 'st-open', productType: 'mug', assetIds: [b, a, c] });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ name: 'Patched', storeId: 'st-open', storeName: 'Open Shop', productType: 'mug', photos: [{ id: b }, { id: a }, { id: c }] });
    expect((await list(users.ann!)).find((p) => p.id === id)!.photos.map((p) => p.id)).toEqual([b, a, c]);
    expect(((await (await change(users.ann!, id, { storeId: null, productType: null })).json()) as Listed)).toMatchObject({ storeId: null, productType: null, name: 'Patched' });
  });

  test('refuses a new photo that is another member’s, another workspace’s, a video or deleted, a hidden or foreign store (400) and another team’s store (403)', async () => {
    const [a, b] = await photos(users.seller!.id, 2);
    const id = await createdId(await add(users.seller!, { name: 'Strict', assetIds: [a, b] }));
    const theirs = await asset(users.bob!.id);
    const elsewhere = await asset(users.seller!.id, { workspace: 'ws_p' });
    const video = await asset(users.seller!.id, { mime: 'video/mp4' });
    const gone = await asset(users.seller!.id, { deleted: true });
    for (const bad of [theirs, elsewhere, video, gone]) expect((await change(users.seller!, id, { assetIds: [a, bad] })).status, bad).toBe(400);
    expect((await change(users.seller!, id, { assetIds: [a] })).status).toBe(400);
    expect((await change(users.seller!, id, { storeId: 'st-hidden' })).status).toBe(400);
    expect((await change(users.seller!, id, { storeId: 'st-partner' })).status).toBe(400);
    expect((await change(users.seller!, id, { productType: 'spaceship' })).status).toBe(400);
    const other = await change(users.seller!, id, { storeId: 'st-b' });
    expect(other.status).toBe(403);
    expect(await other.json()).toMatchObject({ code: 'store_not_in_team' });
    expect(((await (await change(users.seller!, id, { storeId: 'st-a' })).json()) as Listed).storeId).toBe('st-a');
  });

  test('a rename to a name the member already uses is 409; a name-only change after the store was hidden is 200, and keeps the hidden store', async () => {
    const [a, b] = await photos(users.ann!.id, 2);
    await add(users.ann!, { name: 'Taken name', assetIds: [a, b] });
    await pool.query(`insert into stores (id, name, code, workspace_id, hidden) values ('st-later', 'Closes later', 'L', 'ws_vet', false)`);
    const id = await createdId(await add(users.ann!, { name: 'Rename me', storeId: 'st-later', assetIds: [a, b] }));
    const clash = await change(users.ann!, id, { name: 'TAKEN NAME' });
    expect(clash.status).toBe(409);
    expect(await clash.json()).toMatchObject({ code: 'product_name_taken' });
    expect((await change(users.ann!, id, { name: 'Rename me' })).status).toBe(200); // its own name again is not a clash
    await pool.query(`update stores set hidden = true where id = 'st-later'`);
    const res = await change(users.ann!, id, { name: 'Renamed after close' });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ name: 'Renamed after close', storeId: 'st-later' });
    expect((await change(users.ann!, id, { storeId: 'st-later' })).status).toBe(200); // the store as it was is not checked again
  });

  test('is 404 for another member’s product and for the owner in another workspace; the product is unchanged', async () => {
    const [a, b] = await photos(users.ann!.id, 2);
    const id = await createdId(await add(users.ann!, { name: 'Private one', assetIds: [a, b] }));
    expect((await change(users.bob!, id, { name: 'Stolen' })).status).toBe(404);
    expect((await change(users.ann!, id, { name: 'Stolen' }, '; cvs_ws=ws_p')).status).toBe(404);
    expect((await change(users.ann!, 'nope', { name: 'x' })).status).toBe(404);
    expect((await pool.query(`select name from products where id = $1`, [id])).rows[0].name).toBe('Private one');
  });
});

describe('DELETE /api/products/[id]', () => {
  test('answers 204 and keeps the photos as uploads; another member or workspace gets 404 and the product stays', async () => {
    const [a, b] = await photos(users.ann!.id, 2);
    const id = await createdId(await add(users.ann!, { name: 'Delete me', assetIds: [a, b] }));
    expect((await remove(users.bob!, id)).status).toBe(404);
    expect((await remove(users.ann!, id, '; cvs_ws=ws_p')).status).toBe(404);
    expect((await pool.query(`select 1 from products where id = $1`, [id])).rowCount).toBe(1);
    expect((await remove(users.ann!, id)).status).toBe(204);
    expect((await pool.query(`select 1 from products where id = $1`, [id])).rowCount).toBe(0);
    expect((await pool.query(`select id from assets where id = any($1) and deleted_at is null`, [[a, b]])).rowCount).toBe(2);
    expect((await remove(users.ann!, id)).status).toBe(404);
  });
});
