// /api/fashion-models against a disposable database and bucket on the compose Postgres and MinIO (`pnpm services:up`): saving a Fashion Model Generator result as a
// model, who sees it, who may share it (an Admin's decision is final until an Admin releases it), and what a job may use.
import { randomBytes } from 'node:crypto';
import { DeleteBucketCommand, DeleteObjectsCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { createTestDatabase } from '@cvs/db/testing';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';

vi.setConfig({ testTimeout: 30_000 });

const testDb = await createTestDatabase();
process.env.DATABASE_URL = testDb.url;
process.env.BETTER_AUTH_SECRET = randomBytes(32).toString('hex');
process.env.APP_URL = 'http://localhost';
process.env.S3_BUCKET = `cvs-test-${randomBytes(6).toString('hex')}`;

const { auth, pool } = await import('@/lib/auth');
const { bucketName, ensureBucket, putObject, s3 } = await import('@/lib/storage');
const { stopBoss } = await import('@/lib/queue');
const { DEFAULT_FASHION_TRAITS } = await import('@/lib/fashion-model');
const { GET, POST } = await import('./route');
const { DELETE, PATCH } = await import('./[id]/route');
const { POST: runJob } = await import('../jobs/route');
const { GET: thumb } = await import('../assets/[id]/thumb/route');
const { GET: recentAssets } = await import('../assets/route');

const PASSWORD = 'correct-horse-battery';
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const cookies: Record<string, string> = {};
const ids: Record<string, string> = {};

async function signIn(email: string): Promise<string> {
  const res = await auth.api.signInEmail({ body: { email, password: PASSWORD }, asResponse: true });
  return res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
}
const call = (cookie: string | undefined, method: string, url: string, body?: unknown) =>
  new Request(`http://localhost${url}`, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }), headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) } });
const list = async (who: string) => ((await (await GET(call(cookies[who], 'GET', '/api/fashion-models'))).json()) as { models: { id: string; name: string; shared: boolean; sharedLocked: boolean; mine: boolean }[] }).models;
const save = (who: string, body: unknown) => POST(call(cookies[who], 'POST', '/api/fashion-models', body));
const patch = (who: string, id: string, body: unknown) => PATCH(call(cookies[who], 'PATCH', `/api/fashion-models/${id}`, body), { params: Promise.resolve({ id }) });
const remove = (who: string, id: string) => DELETE(call(cookies[who], 'DELETE', `/api/fashion-models/${id}`), { params: Promise.resolve({ id }) });

/** A finished generator result: an output asset (a PNG in the store unless `bytes` says otherwise) and the job that points at it. */
async function result(id: string, owner: string, o: { feature?: string; bytes?: Uint8Array; status?: string } = {}): Promise<void> {
  await putObject(`assets/${id}`, o.bytes ?? PNG, 'image/png');
  await pool.query(`insert into assets (id, owner_id, kind, s3_key, filename, mime, bytes) values ($1, $2, 'output', $3, 'out.png', 'image/png', 12)`, [id, owner, `assets/${id}`]);
  await pool.query(
    `insert into jobs (id, user_id, team_id, feature, model, provider, prompt, aspect, duration_s, params, input_asset_ids, status, output_asset_id)
     values ($1, $2, 'team-unassigned', $3, 'mock-fashion', 'mock', 'p', '3:4', 0, $4::jsonb, '{}', $5, $6)`,
    [`job-${id}`, owner, o.feature ?? 'fashion_model', JSON.stringify({ resolution: '1K', traits: JSON.stringify({ ...DEFAULT_FASHION_TRAITS, gender: 'male' }) }), o.status ?? 'succeeded', id],
  );
}
/** Saves `assetId` as a model of `who` and returns its id. */
async function saved(who: string, assetId: string, name: string, shared = false): Promise<string> {
  await result(assetId, ids[who]!);
  const res = await save(who, { assetId, name, shared });
  expect(res.status).toBe(201);
  return ((await res.json()) as { id: string }).id;
}

beforeAll(async () => {
  await ensureBucket();
  await pool.query(
    `insert into model_configs (id, provider, endpoint, label, kind, features, ratios, durations_sec, max_images, image_prices, sources, enabled)
     values ('mock-fashion', 'mock', 'mock', 'Mock', 'image', '{image,fashion_model}', '{3:4,auto}', '{}', 4, '{"1K": "0.0500"}', '{}', true)`,
  );
  for (const [who, role] of [['ann', 'member'], ['bob', 'member'], ['root', 'admin']] as const) {
    ids[who] = (await auth.api.createUser({ body: { email: `${who}@example.test`, name: who, password: PASSWORD, role } })).user.id;
    cookies[who] = await signIn(`${who}@example.test`);
  }
});

afterAll(async () => {
  const Bucket = bucketName();
  const { Contents = [] } = await s3().send(new ListObjectsV2Command({ Bucket }));
  if (Contents.length) await s3().send(new DeleteObjectsCommand({ Bucket, Delete: { Objects: Contents.map(({ Key }) => ({ Key: Key! })) } }));
  await s3().send(new DeleteBucketCommand({ Bucket }));
  await stopBoss();
  await pool.end();
  await testDb.drop();
});

describe('migration 0091', () => {
  test('offers the feature on Nano Banana 2 and the Vertex row that serves in its place, with a soft cap', async () => {
    const rows = (await pool.query(`select id from model_configs where 'fashion_model' = any(features) and provider <> 'mock' order by id`)).rows.map((r) => r.id);
    expect(rows).toEqual(['nano-banana-2', 'nano-banana-2-vertex']);
    expect((await pool.query(`select twin_of from model_configs where id = 'nano-banana-2'`)).rows[0].twin_of).toBe('nano-banana-2-vertex');
    expect((await pool.query(`select monthly_usd::int as usd from feature_caps where feature = 'fashion_model'`)).rows[0].usd).toBe(10);
  });
});

describe('POST /api/fashion-models', () => {
  test('copies the caller’s own result into a new input asset and keeps the job’s traits; audited', async () => {
    await result('own', ids.ann!);
    expect((await save('ann', { assetId: 'own', name: 'x' })).status).toBe(201);
    expect((await POST(call(undefined, 'POST', '/api/fashion-models', { assetId: 'own', name: 'x' }))).status).toBe(401);
    const row = (await pool.query(`select f.id, f.name, f.shared, f.traits, a.kind, a.owner_id, a.mime, a.id as asset_id from fashion_models f join assets a on a.id = f.asset_id`)).rows[0];
    expect(row).toMatchObject({ name: 'x', shared: false, kind: 'input', owner_id: ids.ann, mime: 'image/png', traits: { ...DEFAULT_FASHION_TRAITS, gender: 'male' } });
    expect(row.asset_id).not.toBe('own');
    expect((await pool.query(`select count(*)::int as n from assets where id = 'own' and kind = 'output'`)).rows[0].n).toBe(1);
    expect((await pool.query(`select action, target from audit_entries where action = 'fashion_model.create'`)).rows).toEqual([{ action: 'fashion_model.create', target: `fashion_model:${row.id}` }]);
  });

  test('refuses another member’s result, a result of another feature, an unfinished one, a bad name and a file that is not an image', async () => {
    await result('theirs', ids.bob!);
    await result('video-job', ids.ann!, { feature: 'image' });
    await result('running', ids.ann!, { status: 'running' });
    await result('text', ids.ann!, { bytes: new TextEncoder().encode('not an image') });
    expect((await save('ann', { assetId: 'theirs', name: 'x' })).status).toBe(404);
    expect((await save('ann', { assetId: 'video-job', name: 'x' })).status).toBe(404);
    expect((await save('ann', { assetId: 'running', name: 'x' })).status).toBe(404);
    expect((await save('ann', { assetId: 'missing', name: 'x' })).status).toBe(404);
    expect((await save('ann', { assetId: 'text', name: 'x' })).status).toBe(415);
    for (const body of [{ assetId: 'own', name: '  ' }, { assetId: 'own', name: 'x'.repeat(61) }, { assetId: 'own' }, { name: 'x' }, { assetId: 'own', name: 'x', shared: 'yes' }]) {
      expect((await save('ann', body)).status).toBe(400);
    }
    expect((await pool.query(`select count(*)::int as n from fashion_models`)).rows[0].n).toBe(1);
  });
});

describe('who sees a model', () => {
  test('a private model is its owner’s and an Admin’s, a shared one every member’s; the picture follows', async () => {
    const priv = await saved('ann', 'a-priv', 'Ann private');
    const pub = await saved('ann', 'a-pub', 'Ann shared', true);
    expect((await list('ann')).filter((m) => m.name.startsWith('Ann ')).map((m) => [m.name, m.mine])).toEqual([['Ann shared', true], ['Ann private', true]]); // newest first
    expect((await list('bob')).map((m) => [m.name, m.mine])).toEqual([['Ann shared', false]]);
    expect((await list('root')).map((m) => m.name)).toEqual(['Ann shared', 'Ann private', 'x']);
    const asset = async (id: string) => (await pool.query('select asset_id from fashion_models where id = $1', [id])).rows[0].asset_id as string;
    const seen = async (who: string, id: string) => (await thumb(call(cookies[who], 'GET', '/'), { params: Promise.resolve({ id: await asset(id) }) })).status;
    expect([await seen('bob', pub), await seen('bob', priv), await seen('root', priv)]).toEqual([200, 403, 200]);
    await patch('ann', pub, { shared: false });
    expect(await seen('bob', pub)).toBe(403);
  });

  test('a job may use the picture of a shared model of someone else, not a private one', async () => {
    const priv = await saved('ann', 'j-priv', 'Job private');
    const pub = await saved('ann', 'j-pub', 'Job shared', true);
    const assetOf = async (id: string) => (await pool.query('select asset_id from fashion_models where id = $1', [id])).rows[0].asset_id as string;
    const image = (who: string, assetId: string) =>
      runJob(call(cookies[who], 'POST', '/api/jobs', { assetIds: [assetId], modelId: 'mock-fashion', feature: 'image', ratio: '3:4', prompt: 'a studio shot', params: { resolution: '1K' } }));
    expect((await image('bob', await assetOf(priv))).status).toBe(400);
    expect((await image('bob', await assetOf(pub))).status).toBe(201);
    expect((await image('ann', await assetOf(priv))).status).toBe(201);
    await remove('ann', pub);
    expect((await image('bob', await assetOf(pub))).status).toBe(400);
  });
});

describe('PATCH /api/fashion-models/[id]', () => {
  test('the owner renames, shares and unshares; nobody else renames', async () => {
    const id = await saved('ann', 'p-own', 'Before');
    expect(await (await patch('ann', id, { name: ' After ' })).json()).toMatchObject({ name: 'After', shared: false, sharedLocked: false });
    expect(await (await patch('ann', id, { shared: true })).json()).toMatchObject({ shared: true, sharedLocked: false });
    expect((await patch('bob', id, { name: 'Mine now' })).status).toBe(403); // shared, so bob sees it
    expect((await patch('bob', id, { shared: false })).status).toBe(403);
    expect((await patch('root', id, { name: 'Mine now' })).status).toBe(403);
    expect(await (await patch('ann', id, { shared: false })).json()).toMatchObject({ shared: false });
    expect((await patch('bob', id, { shared: true })).status).toBe(404); // private: bob cannot even see it
    for (const body of [{}, { name: '' }, { name: 'x'.repeat(61) }, { shared: 'yes' }, { sharedLocked: 1 }]) expect((await patch('ann', id, body)).status).toBe(400);
    expect((await patch('ann', 'missing', { shared: true })).status).toBe(404);
    const audit = (await pool.query(`select old_value, new_value from audit_entries where action = 'fashion_model.update' and target = $1 order by id limit 1`, [`fashion_model:${id}`])).rows[0];
    expect([audit.old_value.name, audit.new_value.name]).toEqual(['Before', 'After']);
  });

  test('an Admin’s decision locks the model until an Admin releases it', async () => {
    const id = await saved('ann', 'p-admin', 'Locked one', true);
    expect(await (await patch('root', id, { shared: false })).json()).toMatchObject({ shared: false, sharedLocked: true, mine: false });
    expect((await list('ann')).find((m) => m.id === id)).toMatchObject({ shared: false, sharedLocked: true });
    expect((await patch('ann', id, { shared: true })).status).toBe(403);
    expect((await patch('ann', id, { sharedLocked: false })).status).toBe(403);
    expect((await patch('root', id, { sharedLocked: false })).status).toBe(200);
    expect(await (await patch('ann', id, { shared: true })).json()).toMatchObject({ shared: true, sharedLocked: false });
    expect(await (await patch('root', id, { shared: true, sharedLocked: false })).json()).toMatchObject({ shared: true, sharedLocked: false }); // an Admin may also share without locking
    expect((await pool.query(`select count(*)::int as n from audit_entries where action = 'fashion_model.update' and target = $1`, [`fashion_model:${id}`])).rows[0].n).toBe(4);
  });
});

describe('the uploaded photos', () => {
  test('leave out the picture of a saved model, and list it again once the model is deleted', async () => {
    const id = await saved('bob', 'u-model', 'Bob upload');
    const asset = (await pool.query('select asset_id from fashion_models where id = $1', [id])).rows[0].asset_id as string;
    const uploads = async () => ((await (await recentAssets(call(cookies.bob, 'GET', '/api/assets?recent=uploads'))).json()) as { assets: { id: string }[] }).assets.map((a) => a.id);
    expect(await uploads()).not.toContain(asset);
    await remove('bob', id);
    expect(await uploads()).toContain(asset);
  });
});

describe('DELETE /api/fashion-models/[id]', () => {
  test('while an Admin’s decision shares a model only an Admin deletes it', async () => {
    const id = await saved('ann', 'd-locked', 'Decided');
    await patch('root', id, { shared: true }); // shared and locked
    const refused = await remove('ann', id);
    expect([refused.status, ((await refused.json()) as { error: string }).error]).toEqual([403, expect.stringMatching(/only an Admin deletes it/)]);
    expect((await list('bob')).some((m) => m.id === id)).toBe(true);
    await patch('root', id, { sharedLocked: false });
    expect((await remove('ann', id)).status).toBe(204); // released: the owner may again
    const again = await saved('ann', 'd-locked-2', 'Decided and unshared');
    await patch('root', again, { shared: false }); // locked but private: the owner may delete
    expect((await remove('ann', again)).status).toBe(204);
    const kept = await saved('ann', 'd-locked-3', 'Decided again');
    await patch('root', kept, { shared: true });
    expect((await remove('root', kept)).status).toBe(204);
  });

  test('the owner or an Admin deletes it, softly; others cannot', async () => {
    const mine = await saved('ann', 'd-mine', 'Delete me', true);
    expect((await remove('bob', mine)).status).toBe(403);
    expect((await remove('ann', mine)).status).toBe(204);
    expect((await remove('ann', mine)).status).toBe(404);
    expect((await list('bob')).some((m) => m.id === mine)).toBe(false);
    expect((await pool.query('select deleted_at is not null as gone from fashion_models where id = $1', [mine])).rows[0].gone).toBe(true);
    const other = await saved('bob', 'd-other', 'Bob private');
    expect((await remove('ann', other)).status).toBe(404);
    expect((await remove('root', other)).status).toBe(204);
    expect((await pool.query(`select action from audit_entries where action = 'fashion_model.delete'`)).rowCount).toBe(7);
  });
});
