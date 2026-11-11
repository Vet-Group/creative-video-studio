// The feedback board against the real route handlers and a disposable database on the compose Postgres (`pnpm services:up`).
import { randomBytes, randomUUID } from 'node:crypto';
import { createTestDatabase } from '@cvs/db/testing';
import { afterAll, describe, expect, test } from 'vitest';
import { MAX_IMAGES } from '@/lib/feedback';

const testDb = await createTestDatabase();
process.env.DATABASE_URL = testDb.url;
process.env.BETTER_AUTH_SECRET = randomBytes(32).toString('hex');
process.env.APP_URL = 'http://localhost';

const { auth, pool } = await import('@/lib/auth');
const list = await import('./route');
const detail = await import('./[id]/route');
const vote = await import('./[id]/vote/route');
const comments = await import('./[id]/comments/route');
const adminRoute = await import('../admin/feedback/[id]/route');

const PASSWORD = 'correct-horse-battery';
let seq = 0;

afterAll(async () => {
  await pool.end();
  await testDb.drop();
});

async function user(role: 'member' | 'admin' = 'member') {
  const email = `u${++seq}@example.test`;
  const id = (await auth.api.createUser({ body: { email, name: `Name ${seq}`, role, password: PASSWORD, data: { emailVerified: true } } })).user.id;
  const res = await auth.api.signInEmail({ body: { email, password: PASSWORD }, asResponse: true });
  const cookie = res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
  return { id, cookie };
}
const headers = (cookie: string) => ({ cookie, origin: 'http://localhost', 'content-type': 'application/json' });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

async function post(cookie: string, body: unknown) {
  return list.POST(new Request('http://localhost/api/feedback', { method: 'POST', headers: headers(cookie), body: JSON.stringify(body) }));
}
async function getList(cookie: string, query = '') {
  return list.GET(new Request(`http://localhost/api/feedback${query}`, { headers: headers(cookie) }));
}
const valid = { kind: 'feature', title: 'Dark mode', body: 'Please add a dark theme.' };

async function ownedAsset(ownerId: string) {
  const id = randomUUID();
  await pool.query(
    `insert into assets (id, owner_id, kind, s3_key, filename, mime, bytes) values ($1, $2, 'input', $3, 'a.png', 'image/png', 10)`,
    [id, ownerId, `assets/${id}`],
  );
  return id;
}

describe('POST /api/feedback', () => {
  test('refuses without a session', async () => {
    expect((await post('', valid)).status).toBe(401);
  });

  test('creates an item with the ordinary defaults', async () => {
    const m = await user();
    const res = await post(m.cookie, valid);
    expect(res.status).toBe(201);
    const item = (await res.json()) as Record<string, unknown>;
    expect(item).toMatchObject({ kind: 'feature', title: 'Dark mode', body: 'Please add a dark theme.', status: 'new', votes: 0, voted: false, comments: 0, mine: true, authorName: 'Name 1' });
    const row = (await pool.query('select status, team_id from feedback where id = $1', [item.id])).rows[0];
    expect(row.status).toBe('new');
    expect(row.team_id).toBe('team-unassigned');
  });

  test('validates kind, title, body and the image count', async () => {
    const m = await user();
    expect((await post(m.cookie, { ...valid, kind: 'nope' })).status).toBe(400);
    expect((await post(m.cookie, { ...valid, title: '' })).status).toBe(400);
    expect((await post(m.cookie, { ...valid, body: ' ' })).status).toBe(400);
    expect((await post(m.cookie, { ...valid, assetIds: Array.from({ length: MAX_IMAGES + 1 }, (_, i) => String(i)) })).status).toBe(400);
  });

  test('accepts the author’s own images and refuses an image they do not own', async () => {
    const m = await user();
    const other = await user();
    const mine = await ownedAsset(m.id);
    expect((await post(m.cookie, { ...valid, assetIds: [mine] })).status).toBe(201);
    const theirs = await ownedAsset(other.id);
    expect((await post(m.cookie, { ...valid, assetIds: [theirs] })).status).toBe(400);
  });
});

describe('GET /api/feedback', () => {
  test('lists all items, filters by kind and sorts by votes', async () => {
    const a = await user();
    const b = await user();
    const bug = (await (await post(a.cookie, { kind: 'bug', title: 'Crash', body: 'It crashes.' })).json()) as { id: string };
    const feat = (await (await post(a.cookie, { kind: 'feature', title: 'Export', body: 'Add export.' })).json()) as { id: string };
    // b upvotes the feature so it rises to the top
    await vote.PUT(new Request('http://localhost/x', { method: 'PUT', headers: headers(b.cookie) }), ctx(feat.id));

    const all = (await (await getList(a.cookie)).json()) as { items: { id: string; kind: string }[] };
    expect(all.items.some((i) => i.id === bug.id)).toBe(true);
    expect(all.items.some((i) => i.id === feat.id)).toBe(true);

    const bugs = (await (await getList(a.cookie, '?kind=bug')).json()) as { items: { id: string }[] };
    expect(bugs.items.every((i) => i.id !== feat.id)).toBe(true);
    expect(bugs.items.some((i) => i.id === bug.id)).toBe(true);

    const top = (await (await getList(a.cookie, '?sort=top')).json()) as { items: { id: string; votes: number }[] };
    expect(top.items[0]!.id).toBe(feat.id);
    expect(top.items[0]!.votes).toBe(1);
  });
});

describe('PUT /api/feedback/:id/vote', () => {
  test('toggles the caller’s upvote', async () => {
    const m = await user();
    const f = (await (await post(m.cookie, valid)).json()) as { id: string };
    const on = (await (await vote.PUT(new Request('http://localhost/x', { method: 'PUT', headers: headers(m.cookie) }), ctx(f.id))).json()) as { voted: boolean; votes: number };
    expect(on).toEqual({ voted: true, votes: 1 });
    const off = (await (await vote.PUT(new Request('http://localhost/x', { method: 'PUT', headers: headers(m.cookie) }), ctx(f.id))).json()) as { voted: boolean; votes: number };
    expect(off).toEqual({ voted: false, votes: 0 });
  });

  test('404 for an unknown item', async () => {
    const m = await user();
    expect((await vote.PUT(new Request('http://localhost/x', { method: 'PUT', headers: headers(m.cookie) }), ctx(randomUUID()))).status).toBe(404);
  });
});

describe('comments and detail', () => {
  test('a comment shows up in the detail with its author and count', async () => {
    const m = await user();
    const f = (await (await post(m.cookie, valid)).json()) as { id: string };
    const res = await comments.POST(new Request('http://localhost/x', { method: 'POST', headers: headers(m.cookie), body: JSON.stringify({ body: 'Me too!' }) }), ctx(f.id));
    expect(res.status).toBe(201);
    const got = (await (await detail.GET(new Request('http://localhost/x', { headers: headers(m.cookie) }), ctx(f.id))).json()) as { item: { comments: number }; comments: { body: string; authorName: string; mine: boolean }[] };
    expect(got.item.comments).toBe(1);
    expect(got.comments).toHaveLength(1);
    expect(got.comments[0]).toMatchObject({ body: 'Me too!', mine: true });
    expect(typeof got.comments[0]!.authorName).toBe('string');
  });

  test('detail 404 for an unknown id', async () => {
    const m = await user();
    expect((await detail.GET(new Request('http://localhost/x', { headers: headers(m.cookie) }), ctx(randomUUID()))).status).toBe(404);
  });

  test('rejects an empty comment', async () => {
    const m = await user();
    const f = (await (await post(m.cookie, valid)).json()) as { id: string };
    expect((await comments.POST(new Request('http://localhost/x', { method: 'POST', headers: headers(m.cookie), body: JSON.stringify({ body: '  ' }) }), ctx(f.id))).status).toBe(400);
  });
});

describe('PATCH /api/admin/feedback/:id', () => {
  const patch = (cookie: string, id: string, body: unknown) =>
    adminRoute.PATCH(new Request('http://localhost/x', { method: 'PATCH', headers: headers(cookie), body: JSON.stringify(body) }), ctx(id));

  test('a member cannot triage', async () => {
    const m = await user();
    const f = (await (await post(m.cookie, valid)).json()) as { id: string };
    expect((await patch(m.cookie, f.id, { status: 'done' })).status).toBe(403);
  });

  test('an admin sets the status and reply, the author sees it, and it is audited', async () => {
    const m = await user();
    const admin = await user('admin');
    const f = (await (await post(m.cookie, valid)).json()) as { id: string };
    expect((await patch(admin.cookie, f.id, { status: 'done', adminNote: 'Shipped in v2.' })).status).toBe(200);
    const got = (await (await detail.GET(new Request('http://localhost/x', { headers: headers(m.cookie) }), ctx(f.id))).json()) as { item: { status: string; adminNote: string } };
    expect(got.item).toMatchObject({ status: 'done', adminNote: 'Shipped in v2.' });
    const audits = (await pool.query(`select action, new_value from audit_entries where target = $1`, [`feedback:${f.id}`])).rows;
    expect(audits).toHaveLength(1);
    expect(audits[0].action).toBe('feedback.update');
    expect(audits[0].new_value).toMatchObject({ status: 'done', adminNote: 'Shipped in v2.' });
  });

  test('a bad status is refused', async () => {
    const admin = await user('admin');
    const m = await user();
    const f = (await (await post(m.cookie, valid)).json()) as { id: string };
    expect((await patch(admin.cookie, f.id, { status: 'nope' })).status).toBe(400);
  });
});
