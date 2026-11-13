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
const { GET: GET_USERS } = await import('../admin/users/route');

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
// Rows by a person: migration 0065 audits its own prompt changes as the system (no actor).
const audits = async (target: string) => (await pool.query('select actor_id, action, old_value, new_value from audit_entries where target = $1 and actor_id is not null order by id', [target])).rows;
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
    const users = (await (await GET_USERS(call(admin.cookie))).json()).users as { id: string; canEditTemplates: boolean }[];
    expect(users.map((u) => [u.id, u.canEditTemplates])).toEqual(expect.arrayContaining([[editor.id, true], [member.id, false], [admin.id, false]]));
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
    const max = (await pool.query(`select max(sort_order) as n from presets where feature = 'video'`)).rows[0].n;
    expect(await add('Đẩy máy chậm')).toEqual({ id: 'day-may-cham', label: 'Đẩy máy chậm', prompt: 'Slow pan across the product.', sortOrder: max + 1, enabled: true });
    expect((await add('Đẩy  máy, chậm!', { sortOrder: 3, enabled: false })).id).toBe('day-may-cham-2');
    expect((await add('General')).id).toBe('general-2'); // preset-general is the free prompt's sample
    expect(await preset('day-may-cham-2')).toMatchObject({ sortOrder: 3, enabled: false });
    expect(await audits('preset:day-may-cham')).toEqual([
      { actor_id: editor.id, action: 'preset.create', old_value: null, new_value: { label: 'Đẩy máy chậm', prompt: 'Slow pan across the product.', sortOrder: max + 1, enabled: true, feature: 'video' } },
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

  test("an editor uploads and removes the clip and poster of a known prompt template only, and a member never does", async () => {
    const put = (cookie: string, name: string, body: Uint8Array<ArrayBuffer>) => samplesRoute.PUT(new Request(`http://localhost/api/admin/samples/${name}`, { method: 'PUT', headers: { cookie }, body }), ctx('name', name));
    const del = (cookie: string, name: string) => samplesRoute.DELETE(new Request(`http://localhost/api/admin/samples/${name}`, { method: 'DELETE', headers: { cookie } }), ctx('name', name));
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);
    expect((await put(member.cookie, 'template-xoay-360.mp4', mp4())).status).toBe(403);
    expect((await put(editor.cookie, 'template-no-such.mp4', mp4())).status).toBe(403);
    expect((await put(editor.cookie, 'template-xoay-360.png', jpeg)).status).toBe(403);
    expect((await put(editor.cookie, 'template-xoay-360.mp4', jpeg)).status).toBe(400); // the byte check still applies
    expect((await put(editor.cookie, 'template-xoay-360.mp4', mp4())).status).toBe(201);
    expect((await put(editor.cookie, 'template-xoay-360.jpg', jpeg)).status).toBe(201);
    expect((await del(member.cookie, 'template-xoay-360.jpg')).status).toBe(403);
    expect((await del(editor.cookie, 'template-xoay-360.jpg')).status).toBe(204);
    expect((await del(editor.cookie, 'template-xoay-360.mp4')).status).toBe(204);
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
    expect(own[0]).toMatchObject({ id, mine: true, current: { label: 'Xoay chậm tại chỗ' } });
    expect(own[0].current).not.toHaveProperty('prompt'); // a member never reads a preset's prompt
    const other = await newUser('other@example.test', 'member');
    expect((await (await proposalsRoute.GET(call(other.cookie))).json()).proposals).toEqual([]);
    const seen = (await (await proposalsRoute.GET(call(editor.cookie))).json()).proposals;
    expect(seen.find((p: { id: string }) => p.id === id)).toMatchObject({ mine: false, current: { prompt: expect.any(String) } });

    // A switched-off preset stays hidden from members: no proposal names it, and the list no longer shows it as it is now.
    await pool.query(`update presets set enabled = false where id = 'slow-orbit'`);
    expect((await propose(member.cookie, { presetId: 'slow-orbit', label: 'X' })).status).toBe(404);
    expect((await (await proposalsRoute.GET(call(member.cookie))).json()).proposals[0]).toMatchObject({ id, presetId: 'slow-orbit', current: null });
    expect((await propose(editor.cookie, { presetId: 'slow-orbit', label: 'Bật lại' })).status).toBe(201);
    await pool.query(`update presets set enabled = true where id = 'slow-orbit'`);
  });

  test('a member has at most 20 pending at a time', async () => {
    const busy = await newUser('busy@example.test', 'member');
    for (let i = 0; i < 20; i++) expect((await propose(busy.cookie, { label: `Mẫu ${i}`, prompt: 'Slow pan.' })).status).toBe(201);
    expect((await propose(busy.cookie, { label: 'One more', prompt: 'Slow pan.' })).status).toBe(429);
    // An editor reads every pending one, oldest first, and their number; a member reads no count.
    const { proposals, pendingCount } = await (await proposalsRoute.GET(call(admin.cookie))).json();
    const total = (await pool.query(`select count(*)::int as n from preset_proposals where status = 'pending' and feature = 'video'`)).rows[0].n;
    expect([pendingCount, proposals.length]).toEqual([total, total]);
    const times = proposals.map((p: { createdAt: string }) => p.createdAt);
    expect(times).toEqual([...times].sort());
    expect(await (await proposalsRoute.GET(call(busy.cookie))).json()).not.toHaveProperty('pendingCount');
  });

  test("one editor's approval applies the proposal, audited with it, unless the preset was edited since; a decided one is never decided again", async () => {
    // A preset edited after the proposal: approving it would undo the newer edit, so it is refused and can only be rejected.
    const { id: stale } = await (await propose(member.cookie, { presetId: 'lifestyle-table', label: 'Bàn cũ' })).json();
    expect((await presetRoute.PATCH(call(editor.cookie, 'PATCH', { sortOrder: 77 }), ctx('id', 'lifestyle-table'))).status).toBe(200);
    const refused = await decide(editor.cookie, stale, true);
    expect([refused.status, (await refused.json()).error]).toEqual([409, 'Mẫu đã được sửa sau khi có đề xuất này; hãy xem lại.']);
    expect((await preset('lifestyle-table')).label).not.toBe('Bàn cũ');
    expect(await audits(`preset_proposal:${stale}`)).toEqual([]);
    expect((await (await decide(editor.cookie, stale, false)).json()).status).toBe('rejected');

    const { id } = await (await propose(member.cookie, { presetId: 'lifestyle-table', label: 'Bàn gỗ', prompt: 'A wooden table, slow drift.', note: 'rõ hơn' })).json();
    const old = await preset('lifestyle-table');
    expect(old.sortOrder).toBe(77);
    expect((await decide(member.cookie, id, true)).status).toBe(403);
    expect((await decide(editor.cookie, id, 'yes')).status).toBe(400);
    expect((await decide(editor.cookie, 'no-such', true)).status).toBe(404);
    const res = await decide(editor.cookie, id, true);
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe('approved');
    expect(await preset('lifestyle-table')).toEqual({ ...old, label: 'Bàn gỗ', prompt: 'A wooden table, slow drift.' });
    expect((await audits('preset:lifestyle-table')).at(-1)).toEqual(
      { actor_id: editor.id, action: 'preset.update', old_value: { label: old.label, prompt: old.prompt }, new_value: { label: 'Bàn gỗ', prompt: 'A wooden table, slow drift.' } },
    );
    expect(await audits(`preset_proposal:${id}`)).toEqual([
      { actor_id: editor.id, action: 'preset_proposal.approve', old_value: { status: 'pending' }, new_value: { status: 'approved', proposedBy: member.id, presetId: 'lifestyle-table' } },
    ]);
    expect((await pool.query('select status, decided_by from preset_proposals where id = $1', [id])).rows[0]).toEqual({ status: 'approved', decided_by: editor.id });
    expect((await decide(admin.cookie, id, false)).status).toBe(409);
    expect((await decide(editor.cookie, id, true)).status).toBe(409);
    expect(await audits('preset:lifestyle-table')).toHaveLength(2); // the order edit and the approval, nothing more
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

describe('Image Generation styles', () => {
  const styles = async (cookie: string) => (await (await presetsRoute.GET(new Request('http://localhost/api/presets?feature=image', { headers: { cookie } }))).json()) as { presets: Record<string, unknown>[] };

  test('the picker of ?feature=image lists only the styles, and an unknown feature is refused', async () => {
    const ids = (await styles(member.cookie)).presets.map((p) => p.id);
    expect(ids).toHaveLength(8);
    expect(ids.every((id) => String(id).startsWith('style-'))).toBe(true);
    expect((await list(member.cookie)).presets.map((p) => p.id)).not.toContain('style-street'); // Create's picker keeps to its presets
    expect((await presetsRoute.GET(new Request('http://localhost/api/presets?feature=audio', { headers: { cookie: member.cookie } }))).status).toBe(400);
  });

  test('an editor adds a style last in its own picker, and a style proposed by a member lands there on approval, listed with the styles only', async () => {
    const res = await presetsRoute.POST(call(editor.cookie, 'POST', { label: 'Bể bơi', prompt: 'By a sunny pool.', feature: 'image' }));
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ id: 'be-boi', sortOrder: 9 });
    expect((await pool.query(`select feature from presets where id = 'be-boi'`)).rows[0].feature).toBe('image');
    expect((await audits('preset:be-boi'))[0].new_value).toMatchObject({ feature: 'image' });
    expect((await presetsRoute.POST(call(editor.cookie, 'POST', { label: 'X', prompt: 'Y', feature: 'audio' }))).status).toBe(400);

    const asked = await (await propose(member.cookie, { label: 'Tuyết', prompt: 'In soft falling snow.', feature: 'image' })).json();
    const change = await (await propose(member.cookie, { presetId: 'style-street', label: 'Phố đêm' })).json();
    const pending = async (feature: string) => (await (await proposalsRoute.GET(new Request(`http://localhost/api/preset-proposals?feature=${feature}`, { headers: { cookie: editor.cookie } }))).json()) as { proposals: { id: string }[]; pendingCount: number };
    const image = await pending('image');
    expect(image.proposals.map((p) => p.id).sort()).toEqual([asked.id, change.id].sort());
    expect(image.pendingCount).toBe(2);
    expect((await pending('video')).proposals.map((p) => p.id)).not.toContain(asked.id);
    const approved = await (await decide(editor.cookie, asked.id, true)).json();
    expect(approved.preset).toMatchObject({ id: 'tuyet', sortOrder: 10 });
    expect((await pool.query(`select feature from presets where id = 'tuyet'`)).rows[0].feature).toBe('image');
    expect((await decide(editor.cookie, change.id, false)).status).toBe(200);
  });
});
