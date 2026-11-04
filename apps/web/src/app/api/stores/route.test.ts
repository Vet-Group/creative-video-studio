// Integration test of the store brand kit (lib/brand.ts): who edits it (PATCH /api/stores/:id), what the picker lists, and the block POST /api/jobs adds
// to the stored prompt, against a disposable database on the compose Postgres (`pnpm services:up`).
import { randomBytes } from 'node:crypto';
import { createTestDatabase } from '@cvs/db/testing';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

const testDb = await createTestDatabase();
process.env.DATABASE_URL = testDb.url;
process.env.BETTER_AUTH_SECRET = randomBytes(32).toString('hex');
process.env.APP_URL = 'http://localhost';

const { auth, pool } = await import('@/lib/auth');
const { stopBoss } = await import('@/lib/queue');
const { GET } = await import('./route');
const { PATCH } = await import('./[id]/route');
const { POST: RUN } = await import('../jobs/route');
const { GET: RECALL } = await import('../recall/route');
const { brandBlock } = await import('@/lib/brand');

const PASSWORD = 'correct-horse-battery';
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
let n = 0;
async function newUser(role: 'member' | 'admin' = 'member') {
  const email = `u${++n}@example.test`;
  const id = (await auth.api.createUser({ body: { email, name: email, password: PASSWORD, role } })).user.id;
  const res = await auth.api.signInEmail({ body: { email, password: PASSWORD }, asResponse: true });
  return { id, cookie: res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ') };
}
type User = Awaited<ReturnType<typeof newUser>>;
const req = (u: User, path: string, method = 'GET', body?: unknown) =>
  new Request(`http://localhost${path}`, { method, headers: { cookie: u.cookie, 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
const patch = (u: User, id: string, body: unknown) => PATCH(req(u, `/api/stores/${id}`, 'PATCH', body), ctx(id));
const kitOf = async (id: string) => (await pool.query('select brand_voice, brand_colors, brand_tagline from stores where id = $1', [id])).rows[0];
const audits = async (id: string) => (await pool.query(`select actor_id, action, old_value, new_value from audit_entries where target = $1 order by id`, [`store:${id}`])).rows;

const KIT = { brandVoice: 'Minimal and warm', brandColors: ['#C8102E', '#FFFFFF'], brandTagline: 'Wear it well' };
let member: User;
let editor: User;
let admin: User;

beforeAll(async () => {
  [member, editor, admin] = [await newUser(), await newUser(), await newUser('admin')];
  await pool.query('update users set can_edit_templates = true where id = $1', [editor.id]);
  await pool.query(`insert into stores (id, name, code, hidden) values ('st-kit', 'Kit shop', 'KIT', false), ('st-plain', 'Plain shop', 'PLAIN', false), ('st-hidden', 'Hidden shop', 'HID', true)`);
  await pool.query(`update stores set brand_voice = 'Bold', brand_colors = '{#000000}' where id = 'st-hidden'`);
  await pool.query(
    `insert into model_configs (id, provider, endpoint, label, kind, features, ratios, durations_sec, max_images, output_resolution, usd_per_second, image_prices, sources, enabled) values
       ('img-mock', 'mock', 'mock', 'Img mock', 'image', '{image,try_on}', '{1:1}', '{}', 2, null, null, '{"1K": "0.1"}', '{}', true),
       ('vid-mock', 'mock', 'mock', 'Vid mock', 'video', '{video,marketing}', '{9:16}', '{5}', 2, '720p', 0.1, null, '{}', true)`,
  );
  for (const a of ['a1', 'a2']) await pool.query(`insert into assets (id, owner_id, kind, s3_key, filename, mime, bytes) values ($1, $2, 'input', $1, 'a.png', 'image/png', 1)`, [a, member.id]);
});

afterAll(async () => {
  await stopBoss();
  await pool.end();
  await testDb.drop();
});

describe('PATCH /api/stores/:id', () => {
  test('refuses a member (403) and changes nothing', async () => {
    expect((await patch(member, 'st-kit', KIT)).status).toBe(403);
    expect(await kitOf('st-kit')).toEqual({ brand_voice: null, brand_colors: [], brand_tagline: null });
    expect(await audits('st-kit')).toEqual([]);
  });

  test('lets a template editor set the kit, audited once as store.brand with the kit before and after; the same kit again writes no audit', async () => {
    const res = await patch(editor, 'st-kit', { ...KIT, brandColors: ['#c8102e', '#ffffff'] });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: 'st-kit', ...KIT });
    expect(await kitOf('st-kit')).toEqual({ brand_voice: KIT.brandVoice, brand_colors: KIT.brandColors, brand_tagline: KIT.brandTagline });
    expect((await patch(editor, 'st-kit', KIT)).status).toBe(200);
    expect(await audits('st-kit')).toEqual([{ actor_id: editor.id, action: 'store.brand', old_value: { brandVoice: null, brandColors: [], brandTagline: null }, new_value: KIT }]);
  });

  test('lets an Admin clear one field and keeps the others; refuses a bad colour (400) and an unknown store (404)', async () => {
    expect((await patch(admin, 'st-kit', { brandTagline: '' })).status).toBe(200);
    expect(await kitOf('st-kit')).toMatchObject({ brand_voice: KIT.brandVoice, brand_tagline: null });
    expect((await audits('st-kit')).at(-1)).toMatchObject({ actor_id: admin.id, old_value: KIT, new_value: { ...KIT, brandTagline: null } });
    expect((await patch(admin, 'st-kit', { brandColors: ['red'] })).status).toBe(400);
    expect((await patch(admin, 'no-such-store', KIT)).status).toBe(404);
    expect((await patch(admin, 'st-kit', KIT)).status).toBe(200); // back to the full kit for the jobs below
  });

  test('the picker lists the visible stores with their kits, and says whether the caller may edit them', async () => {
    const body = (await (await GET(req(member, '/api/stores'))).json()) as { stores: { id: string; brandColors: string[] }[]; canEdit: boolean };
    expect(body.canEdit).toBe(false);
    expect(body.stores.map((s) => s.id)).toEqual(['st-kit', 'st-plain']);
    expect(body.stores[0]).toMatchObject({ id: 'st-kit', name: 'Kit shop', ...KIT });
    expect(((await (await GET(req(editor, '/api/stores'))).json()) as { canEdit: boolean }).canEdit).toBe(true);
  });
});

describe('POST /api/jobs with useBrand', () => {
  const image = { feature: 'image', modelId: 'img-mock', assetIds: ['a1'], prompt: 'a red dress on a hanger', ratio: '1:1', params: { resolution: '1K' } };
  const marketing = { feature: 'marketing', modelId: 'vid-mock', assetIds: ['a1', 'a2'], prompt: 'UGC try-on video.', ratio: '9:16', durationSec: 5, params: { brief: 'cozy' } };
  const run = async (body: unknown) => {
    const res = await RUN(req(member, '/api/jobs', 'POST', body));
    return { status: res.status, body: (await res.json()) as { id: string; error?: string } };
  };
  const stored = async (id: string) => (await pool.query('select prompt, params from jobs where id = $1', [id])).rows[0];
  const kit = { brandVoice: KIT.brandVoice, brandColors: KIT.brandColors, brandTagline: KIT.brandTagline };

  test('Image Generation stores the prompt with the brand block, keeps the member words as the brief and marks the job for the switch memory', async () => {
    const { status, body } = await run({ ...image, storeId: 'st-kit', useBrand: true });
    expect(status).toBe(201);
    expect(await stored(body.id)).toEqual({ prompt: `a red dress on a hanger ${brandBlock(kit, 'image')}`, params: { resolution: '1K', brand: 'on', brief: 'a red dress on a hanger' } });
    const recall = (await (await RECALL(req(member, '/api/recall?feature=image'))).json()) as { settings: { storeId: string; brand: boolean } };
    expect(recall.settings).toMatchObject({ storeId: 'st-kit', brand: true });
  });

  test('with an Image Generation style, the stored prompt is the member words, then the style, then the brand block, and the one brief is the member words', async () => {
    const style = (await pool.query(`select prompt from presets where id = 'style-flat-lay'`)).rows[0].prompt as string;
    const { status, body } = await run({ ...image, presetId: 'style-flat-lay', storeId: 'st-kit', useBrand: true });
    expect(status).toBe(201);
    expect(await stored(body.id)).toEqual({ prompt: `a red dress on a hanger\n\n${style} ${brandBlock(kit, 'image')}`, params: { resolution: '1K', brief: 'a red dress on a hanger', brand: 'on' } });
  });

  test('Marketing Studio stores the block with no tagline, and keeps the brief it was sent', async () => {
    const { status, body } = await run({ ...marketing, storeId: 'st-kit', useBrand: true });
    expect(status).toBe(201);
    const job = await stored(body.id);
    expect(job.prompt).toBe(`UGC try-on video. ${brandBlock(kit, 'marketing')}`);
    expect(job.prompt).not.toContain(KIT.brandTagline);
    expect(job.params).toEqual({ brief: 'cozy', brand: 'on' });
  });

  test('adds nothing with the switch off, with no store, or for a store with no kit', async () => {
    for (const extra of [{ storeId: 'st-kit', useBrand: false }, { useBrand: true }, { storeId: 'st-plain', useBrand: true }]) {
      const { status, body } = await run({ ...image, ...extra });
      expect(status).toBe(201);
      expect(await stored(body.id)).toEqual({ prompt: image.prompt, params: image.params });
    }
    const recall = (await (await RECALL(req(member, '/api/recall?feature=image'))).json()) as { settings: { brand: boolean } };
    expect(recall.settings.brand).toBe(false);
  });

  test('refuses a hidden store, the switch on another feature, and a switch that is not a boolean', async () => {
    expect(await run({ ...image, storeId: 'st-hidden', useBrand: true })).toMatchObject({ status: 400, body: { error: 'the store does not exist or is hidden' } });
    expect(await run({ feature: 'try_on', modelId: 'img-mock', assetIds: ['a1', 'a2'], prompt: 'p', ratio: '1:1', params: { resolution: '1K' }, storeId: 'st-kit', useBrand: true })).toMatchObject({
      status: 400,
      body: { error: 'the brand kit is for Marketing Studio and Image Generation only' },
    });
    expect(await run({ ...image, useBrand: 'yes' })).toMatchObject({ status: 400, body: { error: 'useBrand must be true or false' } });
  });
});
