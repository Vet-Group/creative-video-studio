// /api/library/boards against a disposable database on the compose Postgres (`pnpm services:up`): a member's named sets of Library results, who sees and changes them
// (the owner, in the active workspace, nobody else), what a board may hold (live results of this workspace), the name and count limits, and the Library's `board` filter.
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
const { PUT } = await import('./[id]/items/route');
const { GET: GET_LIBRARY } = await import('../route');

const PASSWORD = 'correct-horse-battery';
type Who = { id: string; cookie: string };
const users: Record<string, Who> = {};
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

async function newUser(name: string, o: { system?: boolean } = {}): Promise<Who> {
  const email = `${name}@example.test`;
  const { user } = await auth.api.createUser({ body: { email, name, password: PASSWORD, role: 'member' } });
  if (o.system) await pool.query('update users set system = true where id = $1', [user.id]);
  const res = await auth.api.signInEmail({ body: { email, password: PASSWORD }, asResponse: true });
  return { id: user.id, cookie: res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ') };
}
const req = (who: Who | null, path: string, method = 'GET', body?: unknown, extra = '') =>
  new Request(`http://localhost${path}`, { method, headers: { 'content-type': 'application/json', ...(who && { cookie: who.cookie + extra }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
type Listed = { id: string; name: string; count: number };
const list = async (who: Who, extra = '') => ((await (await GET(req(who, '/api/library/boards', 'GET', undefined, extra))).json()) as { boards: Listed[] }).boards;
const add = (who: Who, body: unknown, extra = '') => POST(req(who, '/api/library/boards', 'POST', body, extra));
const rename = (who: Who, id: string, body: unknown, extra = '') => PATCH(req(who, `/api/library/boards/${id}`, 'PATCH', body, extra), ctx(id));
const remove = (who: Who, id: string, extra = '') => DELETE(req(who, `/api/library/boards/${id}`, 'DELETE', undefined, extra), ctx(id));
const put = (who: Who | null, id: string, body: unknown, extra = '') => PUT(req(who, `/api/library/boards/${id}/items`, 'PUT', body, extra), ctx(id));
const make = async (who: Who, name: string, extra = '') => ((await (await add(who, { name }, extra)).json()) as Listed).id;
const library = async (who: Who, query: string, extra = '') =>
  (await (await GET_LIBRARY(req(who, `/api/library${query}`, 'GET', undefined, extra))).json()) as { clips: { id: string; boardIds: string[] }[] };
const inBoard = async (who: Who, board: string, extra = '') => (await library(who, `?board=${board}`, extra)).clips.map((c) => c.id).sort();

let seq = 0;
/** A Library clip of `owner` (a live succeeded job with an output); `o` makes it something else. Returns the job id. */
async function job(owner: string, o: { status?: string; workspace?: string; deleted?: boolean; purged?: boolean } = {}): Promise<string> {
  const id = `bj-${++seq}`;
  const done = (o.status ?? 'succeeded') === 'succeeded';
  const workspace = o.workspace ?? 'ws_vet';
  if (done) await pool.query(`insert into assets (id, owner_id, kind, s3_key, filename, mime, bytes, workspace_id) values ($1, $2, 'output', $1, $1, 'video/mp4', 10, $3)`, [`${id}-out`, owner, workspace]);
  await pool.query(
    `insert into jobs (id, user_id, team_id, model, provider, prompt, aspect, duration_s, input_asset_ids, status, output_asset_id, workspace_id, deleted_at, purged_at)
     values ($1, $2, 'team-unassigned', 'kling-o3-pro', 'fal', 'p', '9:16', 5, '{}', $3, $4, $5, ${o.deleted ? 'now()' : 'null'}, ${o.purged ? 'now()' : 'null'})`,
    [id, owner, o.status ?? 'succeeded', done ? `${id}-out` : null, workspace],
  );
  return id;
}
const jobs = (owner: string, n: number) => Promise.all(Array.from({ length: n }, () => job(owner)));

beforeAll(async () => {
  await pool.query(`insert into workspaces (id, name) values ('ws_b', 'Partner B')`);
  for (const name of ['ann', 'bob', 'carl', 'dina', 'erin', 'fay', 'gus']) users[name] = await newUser(name);
  users.sys = await newUser('sys', { system: true });
  for (const who of ['ann', 'bob', 'erin']) await pool.query(`insert into workspace_members (workspace_id, user_id, role) values ('ws_b', $1, 'member')`, [users[who]!.id]);
});

afterAll(async () => {
  try {
    await stopBoss();
    await pool.end();
  } finally {
    await testDb.drop();
  }
});

describe('POST and GET /api/library/boards', () => {
  test('makes a board with no items and lists the boards by name, case-blind', async () => {
    const res = await add(users.ann!, { name: '  Tết 2027 – áo thun  ' });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id: expect.any(String), name: 'Tết 2027 – áo thun', count: 0 });
    await make(users.ann!, 'bảng a');
    await make(users.ann!, 'Zeta');
    expect((await list(users.ann!)).map((b) => b.name)).toEqual(['bảng a', 'Tết 2027 – áo thun', 'Zeta']);
    expect(await list(users.bob!)).toEqual([]);
  });

  test('refuses a name that differs only in Vietnamese case or in Unicode form with 409, and stores NFC', async () => {
    await make(users.bob!, 'Tết 2027 – áo thun');
    for (const name of ['TẾT 2027 – ÁO THUN', 'tết 2027 – áo thun', 'Tết 2027 – áo thun'.normalize('NFD')]) {
      const res = await add(users.bob!, { name });
      expect(res.status, name).toBe(409);
      expect(await res.json()).toMatchObject({ code: 'board_name_taken' });
    }
    expect((await list(users.bob!)).map((b) => b.name)).toEqual(['Tết 2027 – áo thun']);
    expect((await pool.query(`select name = normalize(name, nfc) as nfc from library_boards where user_id = $1`, [users.bob!.id])).rows).toEqual([{ nfc: true }]);
    expect((await add(users.ann!, { name: 'TẾT 2027 – ÁO THUN' })).status).toBe(409); // ann made hers above, in the same case-blind way
    expect((await add(users.carl!, { name: 'TẾT 2027 – ÁO THUN' })).status).toBe(201); // another member may use it
  });

  test('answers 400 for an empty name, spaces, no name, 61 characters, a newline and a name that is not text', async () => {
    for (const body of [{ name: '' }, { name: '   ' }, {}, { name: 'x'.repeat(61) }, { name: 'two\nlines' }, { name: 7 }, null, []]) expect((await add(users.carl!, body)).status, JSON.stringify(body)).toBe(400);
    expect((await add(users.carl!, { name: '😀'.repeat(60) })).status).toBe(201); // 60 characters, counted as characters
  });

  test('answers 401 without a session on every handler', async () => {
    expect((await GET(req(null, '/api/library/boards'))).status).toBe(401);
    expect((await POST(req(null, '/api/library/boards', 'POST', { name: 'x' }))).status).toBe(401);
    expect((await PATCH(req(null, '/api/library/boards/x', 'PATCH', { name: 'x' }), ctx('x'))).status).toBe(401);
    expect((await DELETE(req(null, '/api/library/boards/x', 'DELETE'), ctx('x'))).status).toBe(401);
    expect((await put(null, 'x', { jobIds: ['a'], inBoard: true })).status).toBe(401);
  });

  test('keeps 50 boards per member and workspace: the 51st answers 409, the same count in another workspace is free, and two parallel adds at 49 make one', async () => {
    for (let i = 0; i < 50; i++) await pool.query(`insert into library_boards (id, user_id, workspace_id, name) values ($1, $2, 'ws_vet', $3)`, [`lim-${i}`, users.dina!.id, `Board ${i}`]);
    const full = await add(users.dina!, { name: 'One too many' });
    expect(full.status).toBe(409);
    expect(await full.json()).toMatchObject({ code: 'board_limit' });
    await pool.query(`insert into workspace_members (workspace_id, user_id, role) values ('ws_b', $1, 'member')`, [users.dina!.id]);
    expect((await add(users.dina!, { name: 'One too many' }, '; cvs_ws=ws_b')).status).toBe(201);
    await pool.query(`delete from library_boards where id = 'lim-0'`);
    const race = await Promise.all([add(users.dina!, { name: 'Race A' }), add(users.dina!, { name: 'Race B' })]);
    expect(race.map((r) => r.status).sort()).toEqual([201, 409]);
  });
});

describe('PATCH and DELETE /api/library/boards/[id]', () => {
  test('renames a board keeping its id, answers 409 for a taken name and 400 for a bad one', async () => {
    const id = await make(users.erin!, 'Old name');
    await make(users.erin!, 'Taken');
    const res = await rename(users.erin!, id, { name: 'New name' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id, name: 'New name', count: 0 });
    expect((await rename(users.erin!, id, { name: 'TAKEN' })).status).toBe(409);
    expect((await rename(users.erin!, id, { name: 'Taken' })).status).toBe(409);
    expect((await rename(users.erin!, id, { name: '' })).status).toBe(400);
    expect((await rename(users.erin!, id, { name: 'NEW NAME' })).status).toBe(200); // its own name in another case
    expect((await list(users.erin!)).map((b) => b.name)).toEqual(['NEW NAME', 'Taken']);
  });

  test('answers 404 for another member’s board, another workspace’s board and an unknown id, and changes nothing', async () => {
    const id = await make(users.erin!, 'Hers');
    await pool.query(`update library_boards set workspace_id = 'ws_b' where id = $1`, [id]);
    const [j] = await jobs(users.erin!.id, 1);
    for (const [who, extra] of [[users.bob!, ''], [users.erin!, ''], [users.bob!, '; cvs_ws=ws_b']] as const) {
      expect((await rename(who, id, { name: 'Mine now' }, extra)).status).toBe(404);
      expect((await remove(who, id, extra)).status).toBe(404);
      expect((await put(who, id, { jobIds: [j], inBoard: true }, extra)).status).toBe(404);
    }
    expect((await rename(users.erin!, 'nope', { name: 'x' })).status).toBe(404);
    expect((await remove(users.erin!, 'nope')).status).toBe(404);
    expect((await list(users.erin!, '; cvs_ws=ws_b')).map((b) => b.name)).toEqual(['Hers']);
    expect(await list(users.bob!, '; cvs_ws=ws_b')).toEqual([]);
  });

  test('deletes a board with 204 and keeps the results, their favourites and their marks', async () => {
    const id = await make(users.fay!, 'To delete');
    const [j] = await jobs(users.fay!.id, 1);
    await pool.query(`insert into favorites (user_id, job_id) values ($1, $2)`, [users.fay!.id, j]);
    await pool.query(`insert into verdicts (id, job_id, output_asset_id, verdict, marked_by) values ($1, $2, $3, 'pass', $4)`, [`v-${j}`, j, `${j}-out`, users.fay!.id]);
    expect((await put(users.fay!, id, { jobIds: [j], inBoard: true })).status).toBe(200);
    expect((await remove(users.fay!, id)).status).toBe(204);
    expect(await list(users.fay!)).toEqual([]);
    expect((await pool.query(`select (select count(*) from library_board_items where job_id = $1)::int as items, (select count(*) from jobs where id = $1)::int as jobs, (select count(*) from favorites where job_id = $1)::int as favs, (select count(*) from verdicts where job_id = $1)::int as marks`, [j])).rows[0]).toEqual({ items: 0, jobs: 1, favs: 1, marks: 1 });
    expect((await remove(users.fay!, id)).status).toBe(404);
  });
});

describe('PUT /api/library/boards/[id]/items', () => {
  test('adds and removes results; adding twice changes nothing; the count follows', async () => {
    const id = await make(users.gus!, 'Items');
    const [a, b, c] = await jobs(users.gus!.id, 3);
    expect((await put(users.gus!, id, { jobIds: [a, b], inBoard: true })).status).toBe(200);
    expect((await put(users.gus!, id, { jobIds: [a, b], inBoard: true })).status).toBe(200);
    expect(await (await put(users.gus!, id, { jobIds: [c], inBoard: true })).json()).toEqual({ jobIds: [c], inBoard: true });
    expect((await pool.query('select count(*)::int as n from library_board_items where board_id = $1', [id])).rows[0].n).toBe(3);
    expect((await list(users.gus!))[0]).toMatchObject({ id, count: 3 });
    expect((await put(users.gus!, id, { jobIds: [a, c], inBoard: false })).status).toBe(200);
    expect((await put(users.gus!, id, { jobIds: [a, c], inBoard: false })).status).toBe(200); // nothing there to take off
    expect(await inBoard(users.gus!, id)).toEqual([b]);
    expect((await list(users.gus!))[0]!.count).toBe(1);
  });

  test('takes exactly 50 results and refuses 51, none, a repeat, a bad id and a missing or wrong inBoard with 400', async () => {
    const id = await make(users.gus!, 'Batch');
    const ids = await jobs(users.gus!.id, 51);
    expect((await put(users.gus!, id, { jobIds: ids.slice(0, 50), inBoard: true })).status).toBe(200);
    expect((await pool.query('select count(*)::int as n from library_board_items where board_id = $1', [id])).rows[0].n).toBe(50);
    for (const [label, body] of [
      ['51 ids', { jobIds: ids, inBoard: true }],
      ['no ids', { jobIds: [], inBoard: true }],
      ['no list', { inBoard: true }],
      ['a repeat', { jobIds: [ids[0], ids[0]], inBoard: true }],
      ['not text', { jobIds: [ids[0], 7], inBoard: true }],
      ['a bad id', { jobIds: ['a b'], inBoard: true }],
      ['a long id', { jobIds: ['x'.repeat(65)], inBoard: true }],
      ['no inBoard', { jobIds: [ids[0]] }],
      ['inBoard as text', { jobIds: [ids[0]], inBoard: 'true' }],
    ] as const) expect((await put(users.gus!, id, body)).status, label).toBe(400);
    expect((await put(users.gus!, id, { jobIds: ids.slice(0, 50), inBoard: false })).status).toBe(200);
    expect((await pool.query('select count(*)::int as n from library_board_items where board_id = $1', [id])).rows[0].n).toBe(0);
  });

  test('one deleted, failed, purged, unknown or other-workspace id in an add answers 404 and writes nothing; a hidden result can still be taken off', async () => {
    const id = await make(users.gus!, 'All or nothing');
    const [ok, soft, purged] = [await job(users.gus!.id), await job(users.gus!.id, { deleted: true }), await job(users.gus!.id, { purged: true })];
    const bad = [soft, purged, await job(users.gus!.id, { status: 'failed' }), await job(users.gus!.id, { workspace: 'ws_b' }), 'unknown-id'];
    for (const other of bad) expect((await put(users.gus!, id, { jobIds: [ok, other], inBoard: true })).status, other).toBe(404);
    expect((await pool.query('select count(*)::int as n from library_board_items where board_id = $1', [id])).rows[0].n).toBe(0);
    expect((await put(users.gus!, id, { jobIds: [ok], inBoard: true })).status).toBe(200);
    await pool.query('update jobs set deleted_at = now() where id = $1', [ok]);
    expect((await put(users.gus!, id, { jobIds: [ok], inBoard: false })).status).toBe(200);
    expect((await pool.query('select count(*)::int as n from library_board_items where board_id = $1', [id])).rows[0].n).toBe(0);
  });

  test('a PUT that meets a board delete in flight answers 404, not 500, and writes nothing', async () => {
    const id = await make(users.gus!, 'Racing');
    const [j] = await jobs(users.gus!.id, 1);
    const holder = await pool.connect();
    try {
      await holder.query('begin');
      await holder.query('delete from library_boards where id = $1', [id]);
      const pending = put(users.gus!, id, { jobIds: [j], inBoard: true });
      // The PUT's `select … for share` is queued behind the delete's row lock; wait until the server says so.
      for (let i = 0; i < 100; i++) {
        const waiting = await pool.query(`select 1 from pg_stat_activity where wait_event_type = 'Lock' and query like '%from library_boards%for share%'`);
        if (waiting.rowCount) break;
        await new Promise((r) => setTimeout(r, 50));
        if (i === 99) throw new Error('the PUT never waited on the board row');
      }
      await holder.query('commit');
      expect((await pending).status).toBe(404);
    } finally {
      holder.release();
    }
    expect((await pool.query('select count(*)::int as n from library_board_items where job_id = $1', [j])).rows[0].n).toBe(0);
  });
});

describe('GET /api/library with a board', () => {
  test('lists only the board’s live results, each with its boardIds, and narrows with the other filters', async () => {
    const ann = users.ann!;
    const [a, b, c] = await jobs(ann.id, 3);
    const [one, two] = [await make(ann, 'Filter one'), await make(ann, 'Filter two')];
    await put(ann, one, { jobIds: [a, b], inBoard: true });
    await put(ann, two, { jobIds: [b, c], inBoard: true });
    expect(await inBoard(ann, one)).toEqual([a, b].sort());
    expect(await inBoard(ann, two)).toEqual([b, c].sort());
    const all = (await library(ann, '')).clips;
    expect(all.find((x) => x.id === a)!.boardIds).toEqual([one]);
    expect(all.find((x) => x.id === b)!.boardIds.sort()).toEqual([one, two].sort());
    expect(all.find((x) => x.id === c)!.boardIds).toEqual([two]);
    await pool.query(`insert into favorites (user_id, job_id) values ($1, $2)`, [ann.id, b]);
    expect((await library(ann, `?board=${one}&favorites=1`)).clips.map((x) => x.id)).toEqual([b]);
    expect((await library(ann, `?board=${one}&kind=images`)).clips).toEqual([]); // the jobs are videos
    expect((await library(ann, `?board=${one}&kind=videos`)).clips).toHaveLength(2);
    expect((await library(ann, `?board=${one}&q=zzzz-nothing`)).clips).toEqual([]);
  });

  test('lists nothing for another member’s board or another workspace’s, and answers 400 for a malformed id', async () => {
    const [x] = await jobs(users.bob!.id, 1);
    const id = await make(users.bob!, 'Bob private');
    await put(users.bob!, id, { jobIds: [x], inBoard: true });
    expect(await inBoard(users.bob!, id)).toEqual([x]);
    expect(await inBoard(users.ann!, id)).toEqual([]);
    expect(await inBoard(users.bob!, id, '; cvs_ws=ws_b')).toEqual([]);
    expect((await library(users.ann!, '')).clips.find((c) => c.id === x)!.boardIds).toEqual([]); // the board is not hers to see
    for (const bad of ['a%20b', 'x'.repeat(65), '']) expect((await GET_LIBRARY(req(users.ann!, `/api/library?board=${bad}`))).status, bad).toBe(400);
  });

  test('a deleted result leaves the list and the count and undo brings both back; a purged job is out of the count', async () => {
    const owner = users.carl!;
    const [a, b] = await jobs(owner.id, 2);
    const id = await make(owner, 'Lifecycle');
    await put(owner, id, { jobIds: [a, b], inBoard: true });
    const count = async () => (await list(owner)).find((x) => x.id === id)!.count;
    expect(await count()).toBe(2);
    await pool.query('update jobs set deleted_at = now() where id = $1', [a]);
    expect(await count()).toBe(1);
    expect(await inBoard(owner, id)).toEqual([b]);
    await pool.query('update jobs set deleted_at = null where id = $1', [a]);
    expect(await count()).toBe(2);
    expect(await inBoard(owner, id)).toEqual([a, b].sort());
    await pool.query('update jobs set purged_at = now() where id = $1', [b]);
    expect(await count()).toBe(1);
  });

  test('does not count the results of a system account, which the Library does not list', async () => {
    const id = await make(users.carl!, 'System items');
    const [s] = await jobs(users.sys!.id, 1);
    await pool.query(`insert into library_board_items (board_id, job_id) values ($1, $2)`, [id, s]);
    expect((await list(users.carl!)).find((x) => x.id === id)!.count).toBe(0);
    expect(await inBoard(users.carl!, id)).toEqual([]);
  });
});
