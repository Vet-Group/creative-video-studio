// Integration test of preset management outside /admin (template editors, members' proposals and their decision) against a disposable
// database and bucket on the compose Postgres and MinIO (`pnpm services:up`).
import { randomBytes } from 'node:crypto';
import { DeleteBucketCommand, DeleteObjectsCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { createTestDatabase } from '@cvs/db/testing';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

const testDb = await createTestDatabase();
process.env.DATABASE_URL = testDb.url;
process.env.BETTER_AUTH_SECRET = randomBytes(32).toString('hex');
process.env.APP_URL = 'http://localhost';
process.env.S3_BUCKET = `cvs-test-${randomBytes(6).toString('hex')}`;

const { auth, pool } = await import('@/lib/auth');
const { bucketName, ensureBucket, s3 } = await import('@/lib/storage');
const { presetSlug } = await import('@/lib/presets');
const presetsRoute = await import('./route');
const presetRoute = await import('./[id]/route');
const proposalsRoute = await import('../preset-proposals/route');
const decisionRoute = await import('../preset-proposals/[id]/decision/route');
const samplesRoute = await import('../admin/samples/[name]/route');
const { PATCH: PATCH_USER } = await import('../admin/users/[id]/route');

const PASSWORD = 'correct-horse-battery';
const ctx = <K extends string>(key: K, value: string) => ({ params: Promise.resolve({ [key]: value } as Record<K, string>) });
const call = (cookie: string | undefined, method = 'GET', body?: unknown) =>
  new Request('http://localhost/api/x', { method, headers: { ...(cookie ? { cookie } : {}), 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
const mp4 = () => new Uint8Array([0, 0, 0, 0x18, ...[...'ftypisom'].map((c) => c.charCodeAt(0)), 1, 2, 3, 4]);

async function newUser(email: string, role: 'member' | 'admin') {
  const id = (await auth.api.createUser({ body: { email, name: email, password: PASSWORD, role } })).user.id;
  const res = await auth.api.signInEmail({ body: { email, password: PASSWORD }, asResponse: true });
  return { id, cookie: res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ') };
}
const audits = async (target: string) => (await pool.query('select actor_id, action, old_value, new_value from audit_entries where target = $1 order by id', [target])).rows;
const preset = async (id: string) => (await pool.query('select id, label, prompt, enabled, sort_order as "sortOrder" from presets where id = $1', [id])).rows[0];
const list = async (cookie: string) => (await (await presetsRoute.GET(call(cookie))).json()) as { presets: Record<string, unknown>[]; canEdit: boolean };
const propose = (cookie: string, body: unknown) => proposalsRoute.POST(call(cookie, 'POST', body));
const decide = (cookie: string, id: string, approve: unknown) => decisionRoute.POST(call(cookie, 'POST', { approve }), ctx('id', id));

let admin: Awaited<ReturnType<typeof newUser>>;
let editor: Awaited<ReturnType<typeof newUser>>;
let member: Awaited<ReturnType<typeof newUser>>;

beforeAll(async () => {
  await ensureBucket();
  admin = await newUser('admin@example.test', 'admin');
  editor = await newUser('editor@example.test', 'member');
  member = await newUser('member@example.test', 'member');
});

afterAll(async () => {
  const Bucket = bucketName();
  const { Contents = [] } = await s3().send(new ListObjectsV2Command({ Bucket }));
  if (Contents.length) await s3().send(new DeleteObjectsCommand({ Bucket, Delete: { Objects: Contents.map(({ Key }) => ({ Key: Key! })) } }));
  await s3().send(new DeleteBucketCommand({ Bucket }));
  await pool.end();
  await testDb.drop();
});

describe('the template editor permission', () => {
  test('an Admin turns it on and off per user, audited; the session follows at once and only an Admin may set it', async () => {
    expect((await list(editor.cookie)).canEdit).toBe(false);
    const toggle = (cookie: string, canEditTemplates: unknown) => PATCH_USER(new Request(`http://localhost/api/admin/users/${editor.id}`, { method: 'PATCH', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ canEditTemplates }) }), ctx('id', editor.id));
    expect((await toggle(member.cookie, true)).status).toBe(403);
    expect((await toggle(admin.cookie, 'yes')).status).toBe(400);
    const res = await toggle(admin.cookie, true);
    expect([res.status, (await res.json()).canEditTemplates]).toEqual([200, true]);
    expect((await toggle(admin.cookie, true)).status).toBe(200); // no change: no second audit row
    expect((await list(editor.cookie)).canEdit).toBe(true);
    await toggle(admin.cookie, false);
    expect((await list(editor.cookie)).canEdit).toBe(false);
    await toggle(admin.cookie, true);
    expect((await audits(`user:${editor.id}`)).map((a) => [a.action, a.new_value])).toEqual([
      ['user.template_editor', { canEditTemplates: true }],
      ['user.template_editor', { canEditTemplates: false }],
      ['user.template_editor', { canEditTemplates: true }],
    ]);
    // The user cannot grant it to itself through better-auth's own profile update.
    await auth.api.updateUser({ headers: new Headers({ cookie: member.cookie }), body: { canEditTemplates: true } as never }).catch(() => undefined);
    expect((await pool.query('select can_edit_templates from users where id = $1', [member.id])).rows[0].can_edit_templates).toBe(false);
  });
});

describe('GET /api/presets', () => {
  test('a member reads the enabled presets by id and label only; an editor and an Admin read them all with prompt, order and state', async () => {
    await pool.query(`update presets set enabled = false where id = 'slow-orbit'`);
    const m = await list(member.cookie);
    expect(m.canEdit).toBe(false);
    expect(Object.keys(m.presets[0]!)).toEqual(['id', 'label']);
    expect(m.presets.some((p) => p.id === 'slow-orbit')).toBe(false);
    for (const who of [editor, admin]) {
      const e = await list(who.cookie);
      expect(e.canEdit).toBe(true);
      expect(Object.keys(e.presets[0]!).sort()).toEqual(['enabled', 'id', 'label', 'prompt', 'sortOrder']);
      expect(e.presets.find((p) => p.id === 'slow-orbit')).toMatchObject({ enabled: false });
    }
    await pool.query(`update presets set enabled = true where id = 'slow-orbit'`);
  });
});

describe('editing presets on Create', () => {
  test('a member is refused every edit; an editor edits and adds presets with the Admin checks, audited', async () => {
    expect((await presetRoute.PATCH(call(member.cookie, 'PATCH', { label: 'X' }), ctx('id', 'gentle-push-in'))).status).toBe(403);
    expect((await presetsRoute.POST(call(member.cookie, 'POST', { label: 'X', prompt: 'Y' }))).status).toBe(403);
    expect((await presetsRoute.POST(call(undefined, 'POST', { label: 'X', prompt: 'Y' }))).status).toBe(401);

    expect((await presetRoute.PATCH(call(editor.cookie, 'PATCH', { label: ' ' }), ctx('id', 'gentle-push-in'))).status).toBe(400);
    expect((await presetRoute.PATCH(call(editor.cookie, 'PATCH', { sortOrder: 1.5 }), ctx('id', 'gentle-push-in'))).status).toBe(400);
    expect((await presetRoute.PATCH(call(editor.cookie, 'PATCH', {}), ctx('id', 'gentle-push-in'))).status).toBe(400);
    expect((await presetRoute.PATCH(call(editor.cookie, 'PATCH', { label: 'X' }), ctx('id', 'no-such-preset'))).status).toBe(404);
    const before = await preset('gentle-push-in');
    const res = await presetRoute.PATCH(call(editor.cookie, 'PATCH', { label: 'Tiến gần (sửa)' }), ctx('id', 'gentle-push-in'));
    expect(await res.json()).toEqual({ ...before, label: 'Tiến gần (sửa)' });
    expect(await audits('preset:gentle-push-in')).toEqual([{ actor_id: editor.id, action: 'preset.update', old_value: { label: before.label }, new_value: { label: 'Tiến gần (sửa)' } }]);

    expect((await presetsRoute.POST(call(editor.cookie, 'POST', { label: 'Only a label' }))).status).toBe(400);
    const add = async (label: string, extra = {}) => (await presetsRoute.POST(call(editor.cookie, 'POST', { label, prompt: 'Slow pan across the product.', ...extra }))).json();
    const max = (await pool.query('select max(sort_order) as n from presets')).rows[0].n;
    expect(await add('Đẩy máy chậm')).toEqual({ id: 'day-may-cham', label: 'Đẩy máy chậm', prompt: 'Slow pan across the product.', sortOrder: max + 1, enabled: true });
    expect((await add('Đẩy  máy, chậm!', { sortOrder: 3, enabled: false })).id).toBe('day-may-cham-2');
    expect((await add('General')).id).toBe('general-2'); // preset-general is the free prompt's sample
    expect(await preset('day-may-cham-2')).toMatchObject({ sortOrder: 3, enabled: false });
    expect(await audits('preset:day-may-cham')).toEqual([
      { actor_id: editor.id, action: 'preset.create', old_value: null, new_value: { label: 'Đẩy máy chậm', prompt: 'Slow pan across the product.', sortOrder: max + 1, enabled: true } },
    ]);
  });

  test('a slug is ASCII lower-case words joined by dashes, never empty', () => {
    expect(['Xoay quanh chậm', 'Đặt trên bàn', '  Hello, World!! ', '???', 'Ánh sáng quét nhẹ'].map(presetSlug)).toEqual(['xoay-quanh-cham', 'dat-tren-ban', 'hello-world', 'preset', 'anh-sang-quet-nhe']);
  });

  test("an editor uploads and removes only a preset's clip and poster; every other sample stays the Admin's", async () => {
    const put = (cookie: string, name: string, body: Uint8Array<ArrayBuffer>) => samplesRoute.PUT(new Request(`http://localhost/api/admin/samples/${name}`, { method: 'PUT', headers: { cookie }, body }), ctx('name', name));
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);
    expect((await put(member.cookie, 'preset-slow-orbit.mp4', mp4())).status).toBe(403);
    expect((await put(editor.cookie, 'example-1.mp4', mp4())).status).toBe(403);
    expect((await put(editor.cookie, 'preset-general.mp4', mp4())).status).toBe(403); // the free prompt's, not a preset's
    expect((await put(editor.cookie, 'preset-no-such.mp4', mp4())).status).toBe(403);
    expect((await put(editor.cookie, 'preset-slow-orbit.png', jpeg)).status).toBe(403);
    expect((await put(editor.cookie, 'preset-slow-orbit.mp4', jpeg)).status).toBe(400); // the byte check still applies
    expect((await put(editor.cookie, 'preset-slow-orbit.mp4', mp4())).status).toBe(201);
    expect((await put(editor.cookie, 'preset-slow-orbit.jpg', jpeg)).status).toBe(201);
    expect((await put(admin.cookie, 'example-1.mp4', mp4())).status).toBe(201);
    const del = (cookie: string, name: string) => samplesRoute.DELETE(new Request(`http://localhost/api/admin/samples/${name}`, { method: 'DELETE', headers: { cookie } }), ctx('name', name));
    expect((await del(editor.cookie, 'example-1.mp4')).status).toBe(403);
    expect((await del(member.cookie, 'preset-slow-orbit.jpg')).status).toBe(403);
    expect((await del(editor.cookie, 'preset-slow-orbit.jpg')).status).toBe(204);
    expect((await pool.query(`select actor_id, action from audit_entries where target = 'sample:preset-slow-orbit.mp4'`)).rows).toEqual([{ actor_id: editor.id, action: 'sample.put' }]);
  });
});

describe('proposals', () => {
  test('any member proposes a change or a new preset, checked as an edit is; the list shows its own and, to an editor, every pending one', async () => {
    expect((await propose(member.cookie, { presetId: 'slow-orbit' })).status).toBe(400); // nothing to change
    expect((await propose(member.cookie, { label: 'New only' })).status).toBe(400); // a new preset needs a prompt
    expect((await propose(member.cookie, { presetId: 'slow-orbit', label: ' ' })).status).toBe(400);
    expect((await propose(member.cookie, { presetId: 'slow-orbit', label: 'X', note: 'n'.repeat(501) })).status).toBe(400);
    expect((await propose(member.cookie, { presetId: 'no-such', label: 'X' })).status).toBe(404);
    const res = await propose(member.cookie, { presetId: 'slow-orbit', label: 'Xoay chậm (đề xuất)', note: ' Tên ngắn hơn ' });
    expect(res.status).toBe(201);
    const { id } = await res.json();
    expect((await pool.query('select label, prompt, enabled, sort_order, note, status from preset_proposals where id = $1', [id])).rows[0]).toEqual({
      label: 'Xoay chậm (đề xuất)', prompt: null, enabled: null, sort_order: null, note: 'Tên ngắn hơn', status: 'pending',
    });

    const own = (await (await proposalsRoute.GET(call(member.cookie))).json()).proposals;
    expect(own).toHaveLength(1);
    expect(own[0]).toMatchObject({ id, mine: true, current: { label: 'Xoay quanh chậm' } });
    expect(own[0].current).not.toHaveProperty('prompt'); // a member never reads a preset's prompt
    const other = await newUser('other@example.test', 'member');
    expect((await (await proposalsRoute.GET(call(other.cookie))).json()).proposals).toEqual([]);
    const seen = (await (await proposalsRoute.GET(call(editor.cookie))).json()).proposals;
    expect(seen.find((p: { id: string }) => p.id === id)).toMatchObject({ mine: false, current: { prompt: expect.any(String) } });
  });

  test('a member has at most 20 pending at a time', async () => {
    const busy = await newUser('busy@example.test', 'member');
    for (let i = 0; i < 20; i++) expect((await propose(busy.cookie, { label: `Mẫu ${i}`, prompt: 'Slow pan.' })).status).toBe(201);
    expect((await propose(busy.cookie, { label: 'One more', prompt: 'Slow pan.' })).status).toBe(429);
  });

  test("one editor's approval applies the proposal over the preset's current values, audited with it; a decided one is never decided again", async () => {
    const { id } = await (await propose(member.cookie, { presetId: 'lifestyle-table', label: 'Bàn gỗ', prompt: 'A wooden table, slow drift.', note: 'rõ hơn' })).json();
    await pool.query(`update presets set sort_order = 77 where id = 'lifestyle-table'`); // changed since the proposal: the order stays
    const old = await preset('lifestyle-table');
    expect((await decide(member.cookie, id, true)).status).toBe(403);
    expect((await decide(editor.cookie, id, 'yes')).status).toBe(400);
    expect((await decide(editor.cookie, 'no-such', true)).status).toBe(404);
    const res = await decide(editor.cookie, id, true);
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe('approved');
    expect(await preset('lifestyle-table')).toEqual({ ...old, label: 'Bàn gỗ', prompt: 'A wooden table, slow drift.' });
    expect(await audits('preset:lifestyle-table')).toEqual([
      { actor_id: editor.id, action: 'preset.update', old_value: { label: old.label, prompt: old.prompt }, new_value: { label: 'Bàn gỗ', prompt: 'A wooden table, slow drift.' } },
    ]);
    expect(await audits(`preset_proposal:${id}`)).toEqual([
      { actor_id: editor.id, action: 'preset_proposal.approve', old_value: { status: 'pending' }, new_value: { status: 'approved', proposedBy: member.id, presetId: 'lifestyle-table' } },
    ]);
    expect((await pool.query('select status, decided_by from preset_proposals where id = $1', [id])).rows[0]).toEqual({ status: 'approved', decided_by: editor.id });
    expect((await decide(admin.cookie, id, false)).status).toBe(409);
    expect((await decide(editor.cookie, id, true)).status).toBe(409);
    expect(await audits('preset:lifestyle-table')).toHaveLength(1);
  });

  test('an approved new preset is created with its slug; a rejection changes no preset; the approval rolls back with a failed write', async () => {
    const { id: fresh } = await (await propose(member.cookie, { label: 'Lia máy ngang', prompt: 'Slow horizontal pan.' })).json();
    const approved = await (await decide(admin.cookie, fresh, true)).json();
    expect(approved.preset).toMatchObject({ id: 'lia-may-ngang', label: 'Lia máy ngang', prompt: 'Slow horizontal pan.', enabled: true });
    expect((await audits('preset:lia-may-ngang')).map((a) => [a.actor_id, a.action])).toEqual([[admin.id, 'preset.create']]);

    const { id: no } = await (await propose(member.cookie, { presetId: 'gentle-push-in', label: 'Không dùng' })).json();
    const before = await preset('gentle-push-in');
    expect((await (await decide(editor.cookie, no, false)).json()).status).toBe('rejected');
    expect(await preset('gentle-push-in')).toEqual(before);
    expect((await audits(`preset_proposal:${no}`)).map((a) => a.action)).toEqual(['preset_proposal.reject']);
    expect((await decide(editor.cookie, no, true)).status).toBe(409);

    // A preset write that fails takes the proposal's status and audit rows back with it.
    const { id: bad } = await (await propose(member.cookie, { presetId: 'gentle-push-in', label: 'Sẽ lỗi' })).json();
    await pool.query(`alter table presets add constraint presets_test_check check (label <> 'Sẽ lỗi')`);
    await expect(decide(editor.cookie, bad, true)).rejects.toThrow();
    await pool.query('alter table presets drop constraint presets_test_check');
    expect((await pool.query('select status from preset_proposals where id = $1', [bad])).rows[0].status).toBe('pending');
    expect(await audits(`preset_proposal:${bad}`)).toEqual([]);
    expect(await preset('gentle-push-in')).toEqual(before);
  });
});
