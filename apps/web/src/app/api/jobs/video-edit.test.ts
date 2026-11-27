// The video edit app on the Kling O3 Standard Edit row migration 0125 seeds (enabled here), against a disposable database on the compose Postgres and a disposable bucket.
// POST only queues a job: no key is set, so nothing reaches fal.
import { randomBytes } from 'node:crypto';
import { DeleteBucketCommand, DeleteObjectsCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { createTestDatabase } from '@cvs/db/testing';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';

// Each Run reads its clip's header from the store and queues a job; several in one test pass 5 s on a busy machine.
vi.setConfig({ testTimeout: 30_000 });

const testDb = await createTestDatabase();
process.env.DATABASE_URL = testDb.url;
process.env.BETTER_AUTH_SECRET = randomBytes(32).toString('hex');
process.env.APP_URL = 'http://localhost';
process.env.S3_BUCKET = `cvs-test-${randomBytes(6).toString('hex')}`;

const { auth, pool } = await import('@/lib/auth');
const { stopBoss } = await import('@/lib/queue');
const { bucketName, ensureBucket, putObject, s3 } = await import('@/lib/storage');
const { mp4Fixture } = await import('@/lib/mp4-fixture');
const { videoEditPrompt } = await import('@/lib/apps');
const { GET: GET_LIST, POST } = await import('./route');
const { GET: GET_MODELS } = await import('../models/route');
const { GET: GET_JOB } = await import('./[id]/route');

const PASSWORD = 'correct-horse-battery';
const MODEL = 'kling-o3-edit-standard';
const RED = '#C8102E';
let cookie = '';

const call = (path: string, method = 'GET', body?: unknown) =>
  new Request(`http://localhost${path}`, { method, headers: { cookie, 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
/** The body the page sends for a quick colour; `over` replaces any field. */
const edit = (over: Record<string, unknown> = {}) => ({ feature: 'video_edit', modelId: MODEL, assetIds: ['clip'], ratio: 'auto', prompt: videoEditPrompt({ color: RED }), params: { color: RED }, ...over });
const run = (body: Record<string, unknown>) => POST(call('/api/jobs', 'POST', body));
const errorOf = async (res: Response) => ((await res.json()) as { error: string }).error;
const estimateOf = async (id: string) => (await pool.query(`select usd::text from cost_entries where job_id = $1 and kind = 'estimate'`, [id])).rows[0].usd as string;
const jobOf = async (id: string) => (await (await GET_JOB(call(`/api/jobs/${id}`), { params: Promise.resolve({ id }) })).json()) as Record<string, unknown>;
const queued = async (res: Response) => {
  expect(res.status).toBe(201);
  const { id } = (await res.json()) as { id: string };
  return { id, row: (await pool.query('select feature, model, prompt, aspect, duration_s, params, input_asset_ids, enhance from jobs where id = $1', [id])).rows[0] };
};

beforeAll(async () => {
  const { user } = await auth.api.createUser({ body: { email: 'member@example.test', name: 'Member', password: PASSWORD, role: 'member' } });
  const res = await auth.api.signInEmail({ body: { email: 'member@example.test', password: PASSWORD }, asResponse: true });
  cookie = res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
  await pool.query(
    `insert into assets (id, owner_id, kind, s3_key, filename, mime, bytes, duration_ms, workspace_id) values
       ('clip', $1, 'input', 'clip', 'shirt.mp4', 'video/mp4', 1000, 5400, 'ws_vet'),
       ('clip-mov', $1, 'input', 'clip-mov', 'shirt.mov', 'video/quicktime', 1000, 15000, 'ws_vet'),
       ('short', $1, 'input', 'short', 's.mp4', 'video/mp4', 1000, 2500, 'ws_vet'),
       ('long', $1, 'input', 'long', 'l.mp4', 'video/mp4', 1000, 15500, 'ws_vet'),
       ('big', $1, 'input', 'big', 'b.mp4', 'video/mp4', 210000000, 5000, 'ws_vet'),
       ('small', $1, 'input', 'small', 'small.mp4', 'video/mp4', 1000, 5000, 'ws_vet'),
       ('slow', $1, 'input', 'slow', 'slow.mp4', 'video/mp4', 1000, 5000, 'ws_vet'),
       ('ok720', $1, 'input', 'ok720', 'ok.mp4', 'video/mp4', 1000, 5000, 'ws_vet'),
       ('img', $1, 'input', 'img', 'a.png', 'image/png', 1, null, 'ws_vet')`,
    [user.id],
  );
  // Files whose headers give a picture size and a frame rate; the other clips have no object, so their headers cannot be read and pass.
  await ensureBucket();
  for (const [key, w, h, fps] of [['small', 540, 960, 30], ['slow', 1280, 720, 15], ['ok720', 720, 1280, 30]] as const) await putObject(key, mp4Fixture({ ms: 5000, width: w, height: h, fps }), 'video/mp4');
  await pool.query(`update model_configs set enabled = true where id = $1`, [MODEL]);
  await pool.query(`update model_configs set enabled = true where id = 'kling-o3-pro'`);
  await pool.query('update settings set member_daily_clip_cap = 1000, member_daily_usd_cap = 1000 where id = 1');
});

afterAll(async () => {
  try {
    const Bucket = bucketName();
    const { Contents = [] } = await s3().send(new ListObjectsV2Command({ Bucket }));
    if (Contents.length) await s3().send(new DeleteObjectsCommand({ Bucket, Delete: { Objects: Contents.map(({ Key }) => ({ Key: Key! })) } }));
    await s3().send(new DeleteBucketCommand({ Bucket }));
    await stopBoss();
    await pool.end();
  } finally {
    await testDb.drop();
  }
});

describe('the video edit picker', () => {
  test('lists only its own row for ratio auto, priced at $0.14 a second of the clip, as the default; Create never lists it', async () => {
    const r = (await (await GET_MODELS(call('/api/models?feature=video_edit&ratio=auto&durationSec=6&images=1'))).json()) as { models: { id: string; estimateUsd: string; durationsSec: number[] }[]; defaultModelId: string | null };
    expect(r.models.map((m) => [m.id, m.estimateUsd])).toEqual([[MODEL, '0.8400']]);
    expect(r.models[0]!.durationsSec).toEqual(Array.from({ length: 13 }, (_, i) => i + 3));
    expect(r.defaultModelId).toBe(MODEL);
    const create = (await (await GET_MODELS(call('/api/models?feature=video&ratio=9:16&durationSec=8'))).json()) as { models: { id: string }[] };
    expect(create.models.map((m) => m.id)).not.toContain(MODEL);
    expect((await GET_MODELS(call('/api/models?feature=video_edit&ratio=9:16&durationSec=6'))).status).toBe(400);
  });
});

describe('POST /api/jobs for a video edit', () => {
  test("queues a quick colour with its exact prompt, the clip as the one input, the clip's seconds rounded up and their price", async () => {
    const { id, row } = await queued(await run(edit()));
    expect(row).toEqual({ feature: 'video_edit', model: MODEL, prompt: videoEditPrompt({ color: RED }), aspect: 'auto', duration_s: 6, params: { color: RED }, input_asset_ids: ['clip'], enhance: false });
    expect(await estimateOf(id)).toBe('0.8400');
    expect(await jobOf(id)).toMatchObject({ feature: 'video_edit', color: RED, background: null, ratio: 'auto', durationSec: 6 });
  });

  test("queues a quick backdrop, and the member's own words as written with Enhance; a 15 s MOV is the longest clip", async () => {
    const backdrop = await queued(await run(edit({ prompt: videoEditPrompt({ background: 'white' }), params: { background: 'white' } })));
    expect(backdrop.row).toMatchObject({ prompt: videoEditPrompt({ background: 'white' }), params: { background: 'white' }, enhance: false });
    const own = await queued(await run(edit({ assetIds: ['clip-mov'], prompt: '  đổi chiếc cốc sang màu xanh lá  ', params: {}, enhance: true })));
    expect(own.row).toMatchObject({ prompt: 'đổi chiếc cốc sang màu xanh lá', params: {}, enhance: true, duration_s: 15 });
    expect(await estimateOf(own.id)).toBe('2.1000');
    expect((await queued(await run(edit({ assetIds: ['ok720'] })))).row.duration_s).toBe(5); // a 720x1280 30 fps clip passes its header check
  });

  test('refuses, with 400 and never 500, the wrong inputs, quick edits that do not match their prompt, Enhance on a quick edit, other params and clips the model cannot take', async () => {
    const bad: [string, Record<string, unknown>, string?][] = [
      ['no input', edit({ assetIds: [] })],
      ['two inputs', edit({ assetIds: ['clip', 'clip-mov'] })],
      ['an image', edit({ assetIds: ['img'] }), 'the video edit takes a video: the clip to edit'],
      ['a preset', edit({ presetId: 'gentle-push-in', prompt: null })],
      ['a colour and a backdrop', edit({ params: { color: RED, background: 'white' } }), 'the video edit takes params.color or params.background, not both'],
      ['a colour off the swatches', edit({ params: { color: '#123456' } })],
      ['the kept backdrop', edit({ params: { background: 'keep' } })],
      ['another prompt for a colour', edit({ prompt: 'make it blue' }), 'the prompt must be the one the quick edit makes'],
      ['the prompt of another edit', edit({ prompt: videoEditPrompt({ background: 'white' }) })],
      ['no prompt', edit({ prompt: null, params: {} })],
      ['an empty prompt', edit({ prompt: '  ', params: {} })],
      ['Enhance on a quick edit', edit({ enhance: true }), 'Enhance rewrites your own words, not a quick edit'],
      ['audio', edit({ params: { color: RED, audio: 'on' } })],
      ['an end frame', edit({ params: { color: RED, endAssetId: 'img' } })],
      ['the brand', edit({ useBrand: true })],
      ['a clip under 3 s', edit({ assetIds: ['short'] }), 'the clip must last 3 to 15 seconds on this model'],
      ['a clip over 15 s', edit({ assetIds: ['long'] })],
      ['a clip over 200 MB', edit({ assetIds: ['big'] }), 'the clip may be at most 200 MB on this model'],
      ['a 540x960 clip', edit({ assetIds: ['small'] }), 'the reference video is 540x960, a size this model does not take'],
      ['a 15 fps clip', edit({ assetIds: ['slow'] }), 'the reference video runs at 15 fps, outside the 23 to 60 this model takes'],
      ['a model that does not list the feature', edit({ modelId: 'kling-o3-pro' })],
    ];
    for (const [what, body, message] of bad) {
      const res = await run(body);
      expect(res.status, what).toBe(400);
      if (message) expect(await errorOf(res), what).toBe(message);
    }
    expect((await pool.query(`select count(*)::int as n from jobs where feature = 'video_edit' and prompt = 'make it blue'`)).rows[0].n).toBe(0);
  });
});

describe('History, retry and read-back', () => {
  test("the list titles a backdrop edit by its backdrop and shows the member's own words; a retry of a failed edit copies its clip, prompt and params", async () => {
    const backdrop = await queued(await run(edit({ prompt: videoEditPrompt({ background: 'lifestyle' }), params: { background: 'lifestyle' } })));
    const own = await queued(await run(edit({ prompt: 'xoá logo trên tường', params: {} })));
    const colour = await queued(await run(edit()));
    const list = (await (await GET_LIST(call('/api/jobs?mine=1'))).json()) as { jobs: { id: string; background: string | null; color: string | null; text: string | null }[] };
    const of = (id: string) => list.jobs.find((j) => j.id === id)!;
    expect(of(backdrop.id)).toMatchObject({ background: 'lifestyle', text: null });
    expect(of(own.id)).toMatchObject({ background: null, color: null, text: 'xoá logo trên tường' });
    expect(of(colour.id)).toMatchObject({ color: RED, text: null });
    await pool.query(`update jobs set status = 'failed' where id = $1`, [colour.id]);
    const retry = await queued(await run({ retryOf: colour.id }));
    expect(retry.row).toMatchObject({ feature: 'video_edit', model: MODEL, prompt: videoEditPrompt({ color: RED }), params: { color: RED }, input_asset_ids: ['clip'], duration_s: 6 });
    expect((await pool.query('select retry_of from jobs where id = $1', [retry.id])).rows[0].retry_of).toBe(colour.id);
  });
});
