// Integration test against a disposable database and bucket on the compose Postgres and MinIO (`pnpm services:up`).
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
const { bucketName, ensureBucket, getObject, putObject, s3 } = await import('@/lib/storage');
const { GET: list, POST } = await import('./route');
const { GET: one, DELETE } = await import('./[id]/route');
const { GET: content } = await import('../assets/[id]/content/route');

const PASSWORD = 'correct-horse-battery';
let seq = 0;

async function newUser(role: 'member' | 'admin' = 'member') {
  const email = `t${++seq}@example.test`;
  const { user } = await auth.api.createUser({ body: { email, name: email, password: PASSWORD, role } });
  const res = await auth.api.signInEmail({ body: { email, password: PASSWORD }, asResponse: true });
  const cookie = res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
  await pool.query(`insert into assets (id, owner_id, kind, s3_key, filename, mime, bytes) values ($1, $2, 'input', $1, 'own.png', 'image/png', 1)`, [`${user.id}-a`, user.id]);
  await putObject(`${user.id}-a`, new Uint8Array([user.id.length]), 'image/png');
  return { id: user.id, cookie, asset: `${user.id}-a` };
}
type User = Awaited<ReturnType<typeof newUser>>;

const req = (u: User, path: string, init: RequestInit = {}) => new Request(`http://localhost${path}`, { ...init, headers: { 'content-type': 'application/json', cookie: u.cookie } });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const save = (u: User, body: Record<string, unknown>) => POST(req(u, '/api/templates', { method: 'POST', body: JSON.stringify(body) }));
const error = async (res: Response) => ((await res.json()) as { error: string }).error;
const tryOn = (u: User) => ({ feature: 'try_on', name: 'Red dress', data: { images: [u.asset], brief: 'red dress', garments: 1, ratio: '3:4', resolution: '2K', modelId: 'm1' } });

beforeAll(() => ensureBucket());

afterAll(async () => {
  const Bucket = bucketName();
  const { Contents = [] } = await s3().send(new ListObjectsV2Command({ Bucket }));
  if (Contents.length) await s3().send(new DeleteObjectsCommand({ Bucket, Delete: { Objects: Contents.map(({ Key }) => ({ Key: Key! })) } }));
  await s3().send(new DeleteBucketCommand({ Bucket }));
  await pool.end();
  await testDb.drop();
});

describe('/api/templates', () => {
  test('saves a form and gives it back to its owner in the shape the pages refill from', async () => {
    const u = await newUser();
    const res = await save(u, tryOn(u));
    expect(res.status).toBe(201);
    const { id } = (await res.json()) as { id: string };
    expect(await (await list(req(u, '/api/templates?feature=try_on'))).json()).toEqual({ templates: [{ id, name: 'Red dress', isCompany: false, storeId: null, storeName: null, mine: true }], canShare: false });
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
    expect([shared.status, await error(shared)]).toEqual([403, 'only an Admin or a template editor shares a template with the company']);
    expect((await pool.query('select count(*)::int as n from user_templates where user_id = $1', [a.id])).rows[0].n).toBe(0);
  });

  test("keeps Create video's end frame and audio clips as the images are: the owner's own live uploads only", async () => {
    const [a, b] = [await newUser(), await newUser()];
    const clip = (u: User, id: string) => pool.query(`insert into assets (id, owner_id, kind, s3_key, filename, mime, bytes, duration_ms) values ($1, $2, 'input', $1, 'a.mp3', 'audio/mpeg', 1, 3000)`, [id, u.id]);
    await clip(a, `${a.id}-c1`);
    await clip(a, `${a.id}-c2`);
    await clip(b, `${b.id}-c1`);
    const video = (data: Record<string, unknown>) => ({ feature: 'video', name: 'V', data: { images: [a.asset], ...data } });
    const res = await save(a, video({ endFrame: a.asset, clips: [`${a.id}-c2`, `${a.id}-c1`] }));
    expect(res.status).toBe(201);
    const { id } = (await res.json()) as { id: string };
    expect(await (await one(req(a, `/api/templates/${id}`), ctx(id))).json()).toMatchObject({
      endFrame: { id: a.asset, filename: 'own.png' },
      clips: [{ id: `${a.id}-c2`, filename: 'a.mp3', mime: 'audio/mpeg', durationMs: 3000 }, { id: `${a.id}-c1`, filename: 'a.mp3', mime: 'audio/mpeg', durationMs: 3000 }],
    });
    await pool.query('update assets set deleted_at = now() where id = $1', [`${a.id}-c1`]);
    expect(await (await one(req(a, `/api/templates/${id}`), ctx(id))).json()).toMatchObject({ clips: [{ id: `${a.id}-c2` }] });
    expect(await error(await save(a, video({ endFrame: b.asset })))).toBe('data.endFrame may hold only your own uploads');
    expect(await error(await save(a, video({ clips: [`${b.id}-c1`] })))).toBe('data.clips may hold only your own uploads');
    expect(await error(await save(a, video({ clips: [`${a.id}-c2`, `${a.id}-c2`] })))).toBe('data.clips must list up to 10 different asset ids');
    expect(await error(await save(a, video({ endFrame: 5 })))).toBe('data.endFrame must be short text');
  });

  test('keeps at most 50 per member and refuses the 51st', async () => {
    const u = await newUser();
    for (let i = 0; i < 50; i++) expect((await save(u, { feature: 'image', name: `t${i}`, data: { images: [] } })).status).toBe(201);
    const res = await save(u, { feature: 'image', name: 't50', data: { images: [] } });
    expect([res.status, await error(res)]).toEqual([409, 'you can keep at most 50 templates; delete one first']);
  });

  test("shares an Admin's company template with everyone, its photos as the member's own copies, and only an Admin deletes it", async () => {
    const [admin, m] = [await newUser('admin'), await newUser()];
    const { id } = (await (await save(admin, { ...tryOn(admin), isCompany: true })).json()) as { id: string };
    expect(await (await list(req(m, '/api/templates?feature=try_on'))).json()).toEqual({ templates: [{ id, name: 'Red dress', isCompany: true, storeId: null, storeName: null, mine: false }], canShare: false });
    expect(((await (await list(req(admin, '/api/templates?feature=try_on'))).json()) as { canShare: boolean }).canShare).toBe(true);
    const got = (await (await one(req(m, `/api/templates/${id}`), ctx(id))).json()) as { images: { id: string }[] };
    expect(got).toMatchObject({ images: [{ filename: 'own.png' }], brief: 'red dress', garments: 1 });
    expect((await pool.query('select owner_id from assets where id = $1', [got.images[0]!.id])).rows[0].owner_id).toBe(m.id);
    expect((await DELETE(req(m, `/api/templates/${id}`, { method: 'DELETE' }), ctx(id))).status).toBe(403);
    const other = await newUser('admin');
    expect((await DELETE(req(other, `/api/templates/${id}`, { method: 'DELETE' }), ctx(id))).status).toBe(204);
  });

  test("shares a member's store template with whoever lists that store, its photos as their own copies; its author, an Admin or an editor deletes it", async () => {
    const [a, b, admin, editor] = [await newUser(), await newUser(), await newUser('admin'), await newUser()];
    await pool.query(`update users set can_edit_templates = true where id = $1`, [editor.id]);
    await pool.query(`insert into stores (id, name, code, hidden) values ('st-a', 'Shop A', 'STA', false), ('st-gone', 'Gone', 'STG', true)`);
    const res = await save(a, { ...tryOn(a), storeId: 'st-a' });
    expect(res.status).toBe(201);
    const { id } = (await res.json()) as { id: string };
    const entry = { id, name: 'Red dress', isCompany: false, storeId: 'st-a', storeName: 'Shop A', mine: false };
    expect(await (await list(req(b, '/api/templates?feature=try_on&storeId=st-a'))).json()).toEqual({ templates: [entry], canShare: false });
    expect(await (await list(req(b, '/api/templates?feature=try_on'))).json()).toEqual({ templates: [], canShare: false });
    expect(await (await list(req(b, '/api/templates?feature=try_on&storeId=other'))).json()).toEqual({ templates: [], canShare: false });
    expect(await (await list(req(a, '/api/templates?feature=try_on'))).json()).toEqual({ templates: [{ ...entry, mine: true }], canShare: false }); // the author's own, with or without the store
    expect(await (await one(req(b, `/api/templates/${id}`), ctx(id))).json()).toMatchObject({ images: [{ filename: 'own.png' }], brief: 'red dress', garments: 1 });
    expect(((await (await list(req(editor, '/api/templates?feature=try_on'))).json()) as { canShare: boolean }).canShare).toBe(true);

    for (const [body, message] of [
      [{ storeId: 'nope' }, 'storeId is not a store'],
      [{ storeId: 'st-gone' }, 'storeId is not a store'],
      [{ storeId: 1 }, 'storeId is a store id, given without isCompany'],
    ] as const) {
      const bad = await save(a, { ...tryOn(a), ...body });
      expect([bad.status, await error(bad)]).toEqual([400, message]);
    }
    const both = await save(admin, { ...tryOn(admin), storeId: 'st-a', isCompany: true });
    expect([both.status, await error(both)]).toEqual([400, 'storeId is a store id, given without isCompany']);

    const del = (u: User, tid: string) => DELETE(req(u, `/api/templates/${tid}`, { method: 'DELETE' }), ctx(tid));
    expect((await del(b, id)).status).toBe(403);
    expect((await del(a, id)).status).toBe(204);
    const second = ((await (await save(a, { ...tryOn(a), storeId: 'st-a' })).json()) as { id: string }).id;
    expect((await del(admin, second)).status).toBe(204);
    const third = ((await (await save(a, { ...tryOn(a), storeId: 'st-a' })).json()) as { id: string }).id;
    expect((await del(editor, third)).status).toBe(204);
    // A template editor shares with the company too.
    expect((await save(editor, { ...tryOn(editor), isCompany: true })).status).toBe(201);
  });

  test("hands a store template's live photos, end frame and clips to the member who applies it as that member's copies, once, and nothing else of the author's", async () => {
    const [a, b] = [await newUser(), await newUser()];
    await pool.query(`insert into stores (id, name, code, hidden) values ('st-copy', 'Shop C', 'STC', false)`);
    const upload = async (id: string, mime = 'image/png') => {
      const audio = mime === 'audio/mpeg';
      await pool.query(`insert into assets (id, owner_id, kind, s3_key, filename, mime, bytes, duration_ms) values ($1, $2, 'input', $1, $3, $4, 3, $5)`, [id, a.id, audio ? 'a.mp3' : 'x.png', mime, audio ? 3000 : null]);
      await putObject(id, new Uint8Array([1, 2, 3]), mime);
    };
    const [clip, deleted, purged, unused] = [`${a.id}-clip`, `${a.id}-deleted`, `${a.id}-purged`, `${a.id}-unused`];
    for (const id of [deleted, purged, unused]) await upload(id);
    await upload(clip, 'audio/mpeg');
    const video = { feature: 'video', name: 'Spin', data: { images: [a.asset, deleted, purged], endFrame: a.asset, clips: [clip], prompt: 'spin' } };
    const shared = ((await (await save(a, { ...video, storeId: 'st-copy' })).json()) as { id: string }).id;
    const personal = ((await (await save(a, video)).json()) as { id: string }).id;
    // An upload deleted since, or gone with the retention purge, is left out, as before.
    await pool.query('update assets set deleted_at = now() where id = $1', [deleted]);
    await pool.query('delete from assets where id = $1', [purged]);

    type Got = { images: { id: string }[]; endFrame: { id: string } | null; clips: { id: string }[] };
    const apply = async (u: User, id: string) => (await (await one(req(u, `/api/templates/${id}`), ctx(id))).json()) as Got;
    const got = await apply(b, shared);
    expect(got).toMatchObject({ images: [{ filename: 'own.png', mime: 'image/png' }], endFrame: { filename: 'own.png' }, clips: [{ filename: 'a.mp3', mime: 'audio/mpeg', durationMs: 3000 }], prompt: 'spin' });
    const [photo, sound] = [got.images[0]!.id, got.clips[0]!.id];
    expect(got.endFrame!.id).toBe(photo); // the same photo twice is one copy
    expect([photo, sound]).not.toContain(a.asset);
    // B's own live inputs now, each in its own object, so the jobs and templates routes take them as B's uploads.
    const mine = await pool.query(`select id from assets where owner_id = $1 and kind = 'input' and deleted_at is null`, [b.id]);
    expect(mine.rows.map((r) => r.id).sort()).toEqual([b.asset, photo, sound].sort());
    expect(new Uint8Array(await new Response(await getObject(`assets/${photo}`)).arrayBuffer())).toEqual(new Uint8Array([a.id.length]));
    expect((await save(b, { feature: 'video', name: 'Mine', data: { images: [photo], endFrame: photo, clips: [sound] } })).status).toBe(201);
    // Applied again: the same copies, nothing new.
    expect(await apply(b, shared)).toMatchObject({ images: [{ id: photo }], clips: [{ id: sound }] });
    expect((await pool.query('select count(*)::int as n from assets where owner_id = $1', [b.id])).rows[0].n).toBe(3);
    // B reads the copies, never the author's uploads, referenced or not.
    const read = async (id: string) => (await content(req(b, `/api/assets/${id}/content`), ctx(id))).status;
    expect([await read(photo), await read(sound), await read(a.asset), await read(clip), await read(unused)]).toEqual([200, 200, 403, 403, 403]);
    // The author keeps getting their own uploads; a personal template stays the author's alone and copies nothing.
    expect(await apply(a, shared)).toMatchObject({ images: [{ id: a.asset }], clips: [{ id: clip }] });
    expect((await one(req(b, `/api/templates/${personal}`), ctx(personal))).status).toBe(404);
    expect((await pool.query('select count(*)::int as n from assets where owner_id = $1', [b.id])).rows[0].n).toBe(3);
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
    expect([leak.status, await error(leak)]).toEqual([400, 'a company or store template may use only built-in or company hooks and locations']);
    expect((await marketing(admin, { hook: `${admin.id}-hook` })).status).toBe(201); // private, it may
  });

  describe("fromJob (History's Lưu thiết lập)", () => {
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

    test("keeps a video job's own live end frame and audio clips, and leaves out another member's and deleted ones", async () => {
      const [u, other] = [await newUser(), await newUser()];
      for (const [id, owner, gone] of [[`${u.id}-c1`, u, false], [`${u.id}-c2`, u, false], [`${u.id}-cx`, u, true], [`${other.id}-c`, other, false]] as const) {
        await pool.query(`insert into assets (id, owner_id, kind, s3_key, filename, mime, bytes, duration_ms, deleted_at) values ($1, $2, 'input', $1, 'a.mp3', 'audio/mpeg', 1, 3000, $3)`, [id, owner.id, gone ? new Date() : null]);
      }
      const base = { feature: 'video', model: 'kling-o3-pro', prompt: 'p', duration: 5, inputs: [u.asset] };
      const audio = `${u.id}-c2,${other.id}-c,${u.id}-cx,${u.id}-c1`;
      expect((await saved(await fromJob(u, await job(u, { ...base, params: { endAssetId: u.asset, audioAssetIds: audio } })))).data).toEqual({
        images: [u.asset], endFrame: u.asset, clips: [`${u.id}-c2`, `${u.id}-c1`], prompt: 'p', enhance: false, ratio: '9:16', modelId: 'kling-o3-pro', durationSec: 5,
      });
      expect((await saved(await fromJob(u, await job(u, { ...base, params: { endAssetId: other.asset, audioAssetIds: `${other.id}-c` } })))).data).toEqual({
        images: [u.asset], prompt: 'p', enhance: false, ratio: '9:16', modelId: 'kling-o3-pro', durationSec: 5,
      });
    });

    test("keeps a Create job's prompt sections, and a saved form's sections and prompt mode, which the template gives back", async () => {
      const u = await newUser();
      const sections = { hookText: 'The clip opens on a spin.', ending: 'The clip ends with a wave.' };
      const id = await job(u, { feature: 'video', model: 'kling-o3-pro', duration: 5, prompt: 'The clip opens on a spin. p The clip ends with a wave.', params: { audio: 'off', ...sections }, inputs: [u.asset] });
      const { data } = await saved(await fromJob(u, id));
      expect(data).toMatchObject({ prompt: 'The clip opens on a spin. p The clip ends with a wave.', ...sections });
      const res = await save(u, { feature: 'video', name: 'Free', data: { images: [], prompt: 'p', promptMode: 'free' } });
      const tid = ((await res.json()) as { id: string }).id;
      expect(await (await one(req(u, `/api/templates/${tid}`), ctx(tid))).json()).toMatchObject({ prompt: 'p', promptMode: 'free', hookText: null, ending: null });
    });

    test("keeps a Marketing job's end frame, last shot and end text, which the template gives back; refuses them over their limits", async () => {
      const u = await newUser();
      const end = { ending: 'She waves goodbye.', endText: 'Mua ngay hôm nay!', endTextPos: 'top' };
      const id = await job(u, { feature: 'marketing', model: 'kling-o3-pro', duration: 5, params: { audio: 'on', brief: 'b', endAssetId: u.asset, ...end }, inputs: [u.asset] });
      const res = await fromJob(u, id);
      const { data } = await saved(res.clone());
      expect(data).toEqual({ images: [u.asset], endFrame: u.asset, brief: 'b', ...end, audio: 'on', ratio: '9:16', modelId: 'kling-o3-pro', durationSec: 5 });
      const tid = ((await res.json()) as { id: string }).id;
      expect(await (await one(req(u, `/api/templates/${tid}`), ctx(tid))).json()).toMatchObject({ ...end, endFrame: { id: u.asset } });
      for (const [data, message] of [
        [{ ending: 'x'.repeat(201) }, 'data.ending must be text of at most 200 characters'],
        [{ endText: 'x'.repeat(61) }, 'data.endText must be text of at most 60 characters'],
        [{ endText: 'ok', endTextPos: 'left' }, 'data.endTextPos must be one of bottom, middle, top'],
        [{ hookText: 'x'.repeat(201) }, 'data.hookText must be text of at most 200 characters'],
        [{ promptMode: 'tabs' }, 'data.promptMode must be sections or free'],
        [{ format: 'bogus' }, 'data.format must be one of advanced, unboxing, review'],
        [{ roles: 'box,product' }, 'data.roles must be one of product | model,product | product,packaging | model,product,packaging'],
        [{ format: 'unboxing', roles: 'product' }, 'data.roles goes with the unboxing format and names each of its images'], // no image
        [{ roles: 'product' }, 'data.roles goes with the unboxing format and names each of its images'], // no format
        [{ format: 'review', roles: 'product' }, 'data.roles goes with the unboxing format and names each of its images'],
        [{ format: 'review', highlights: ['a', 'b', 'c', 'd'] }, 'data.highlights must list 1 to 3 non-blank lines of at most 60 characters, one line each'],
        [{ format: 'review', highlights: ['x'.repeat(61)] }, 'data.highlights must list 1 to 3 non-blank lines of at most 60 characters, one line each'],
        [{ format: 'review', highlights: 'one' }, 'data.highlights must list 1 to 3 non-blank lines of at most 60 characters, one line each'],
        [{ format: 'review', highlights: [] }, 'data.highlights must list 1 to 3 non-blank lines of at most 60 characters, one line each'],
        [{ format: 'review', highlights: ['a', '  '] }, 'data.highlights must list 1 to 3 non-blank lines of at most 60 characters, one line each'],
        [{ format: 'review', highlights: ['a\tb'] }, 'data.highlights must list 1 to 3 non-blank lines of at most 60 characters, one line each'],
        [{ highlights: ['a'] }, 'data.highlights goes with the review format'],
        [{ format: 'unboxing', highlights: ['a'] }, 'data.highlights goes with the review format'],
      ] as const) {
        expect(await error(await save(u, { name: 'Too long', feature: 'marketing', data: { images: [], ...data } }))).toBe(message);
      }
    });

    test("saves an Unboxing job's photo roles and a Review job's highlights as a template that refills the same way", async () => {
      const u = await newUser();
      const unboxing = await job(u, { feature: 'marketing', model: 'kling-o3-pro', duration: 5, params: { format: 'unboxing', audio: 'on', roles: 'product' }, inputs: [u.asset] });
      expect((await saved(await fromJob(u, unboxing))).data).toMatchObject({ format: 'unboxing', roles: 'product' });
      const review = await job(u, { feature: 'marketing', model: 'kling-o3-pro', duration: 5, params: { format: 'review', audio: 'on', highlights: 'Vải mềm\nVừa vặn', script: 's' }, inputs: [u.asset] });
      const res = await fromJob(u, review);
      expect((await saved(res.clone())).data).toMatchObject({ format: 'review', highlights: ['Vải mềm', 'Vừa vặn'], script: 's' });
      const tid = ((await res.json()) as { id: string }).id;
      expect(await (await one(req(u, `/api/templates/${tid}`), ctx(tid))).json()).toMatchObject({ format: 'review', roles: null, highlights: ['Vải mềm', 'Vừa vặn'] });
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
      expect([shared.status, await error(shared)]).toEqual([403, 'only an Admin or a template editor shares a template with the company']);
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
      expect(await error(await fromJob(admin, mkt, { isCompany: true }))).toBe('a company or store template may use only built-in or company hooks and locations');
    });
  });
});
