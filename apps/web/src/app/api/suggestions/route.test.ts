// Integration test against a disposable database and bucket on the compose Postgres and MinIO (`pnpm services:up`). The queue is a stub: nothing
// reaches the worker or fal.
import { randomBytes } from 'node:crypto';
import { DeleteBucketCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { createTestDatabase } from '@cvs/db/testing';
import { afterAll, describe, expect, test, vi } from 'vitest';

const sent: { name: string; data: unknown }[] = [];
let sendFails = false;
vi.mock('@/lib/queue', () => ({
  boss: async () => ({
    send: async (name: string, data: unknown) => {
      if (sendFails) throw new Error('queue down');
      sent.push({ name, data });
      return 'job';
    },
  }),
}));

const testDb = await createTestDatabase();
process.env.DATABASE_URL = testDb.url;
process.env.BETTER_AUTH_SECRET = randomBytes(32).toString('hex');
process.env.APP_URL = 'http://localhost';
process.env.S3_BUCKET = `cvs-test-${randomBytes(6).toString('hex')}`;

const { auth, pool } = await import('@/lib/auth');
const { bucketName, ensureBucket, putObject, s3 } = await import('@/lib/storage');
const { POST } = await import('./route');
const { GET } = await import('./[id]/route');
const { ADVANCED_MAX_SCRIPT, HOOKS, SUGGEST_DAILY_LIMIT } = await import('@/lib/marketing');

const PASSWORD = 'correct-horse-battery';
let seq = 0;
async function newUser() {
  const email = `s${++seq}@example.test`;
  const { user } = await auth.api.createUser({ body: { email, name: email, password: PASSWORD, role: 'member' } });
  const res = await auth.api.signInEmail({ body: { email, password: PASSWORD }, asResponse: true });
  return { id: user.id, cookie: res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ') };
}
type User = Awaited<ReturnType<typeof newUser>>;
const ask = (u: User, body: Record<string, unknown>) => POST(new Request('http://localhost/api/suggestions', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json', cookie: u.cookie } }));
const poll = (u: User, id: string) => GET(new Request(`http://localhost/api/suggestions/${id}`, { headers: { cookie: u.cookie } }), { params: Promise.resolve({ id }) });
const error = async (res: Response) => ((await res.json()) as { error: string }).error;
const runs = async (userId: string) => (await pool.query('select count(*)::int as n from suggestion_runs where user_id = $1', [userId])).rows[0].n as number;

afterAll(async () => {
  await s3().send(new DeleteObjectCommand({ Bucket: bucketName(), Key: 'samples/preset-walk-left.mp4' }));
  await s3().send(new DeleteBucketCommand({ Bucket: bucketName() }));
  await pool.end();
  await testDb.drop();
});

describe('/api/suggestions', () => {
  test('queues a run with the hook phrase and the member’s text, and gives its options to the member who asked only', async () => {
    const [u, other] = [await newUser(), await newUser()];
    const hook = HOOKS[0]!;
    const res = await ask(u, { field: 'brief', text: ' linen dress ', hook: hook.id, room: 1234 });
    expect(res.status).toBe(202);
    const { id } = (await res.json()) as { id: string };
    expect(sent.at(-1)).toEqual({ name: 'suggest', data: { runId: id } });
    expect((await pool.query('select input from suggestion_runs where id = $1', [id])).rows[0].input).toEqual({ field: 'brief', text: 'linen dress', context: hook.phrase, max: 1234 }); // the room the chosen model leaves
    expect(await (await poll(u, id)).json()).toEqual({ id, status: 'queued', options: [], meanings: [] });
    // Runs from before the readings hold plain strings; newer ones may hold { text, vi }.
    await pool.query(`update suggestion_runs set status = 'succeeded', output = '["a",{"text":"b","vi":"nghĩa b"},"c"]' where id = $1`, [id]);
    expect(await (await poll(u, id)).json()).toEqual({ id, status: 'succeeded', options: ['a', 'b', 'c'], meanings: [null, 'nghĩa b', null] });
    expect((await poll(other, id)).status).toBe(404);
  });

  test('a run still queued after 90 s turns failed when polled, and not before', async () => {
    const u = await newUser();
    const { id } = (await (await ask(u, { field: 'brief' })).json()) as { id: string };
    await pool.query(`update suggestion_runs set created_at = now() - interval '61 seconds' where id = $1`, [id]);
    expect(((await (await poll(u, id)).json()) as { status: string }).status).toBe('queued'); // a short option's second call may still be running
    await pool.query(`update suggestion_runs set created_at = now() - interval '91 seconds' where id = $1`, [id]);
    expect(((await (await poll(u, id)).json()) as { status: string }).status).toBe('failed');
  });

  test(`allows ${SUGGEST_DAILY_LIMIT} runs a day per member and refuses the next with 429`, async () => {
    const [u, other] = [await newUser(), await newUser()];
    await pool.query(`insert into suggestion_runs (id, user_id, input) select 'seed-' || g, $1, '{}' from generate_series(1, $2) g`, [u.id, SUGGEST_DAILY_LIMIT - 1]);
    await pool.query(`insert into suggestion_runs (id, user_id, input, created_at) values ('yesterday', $1, '{}', now() - interval '2 days')`, [u.id]); // not today
    expect((await ask(u, { field: 'brief' })).status).toBe(202);
    const res = await ask(u, { field: 'brief' });
    expect([res.status, await error(res)]).toEqual([429, `Bạn đã dùng hết ${SUGGEST_DAILY_LIMIT} lượt gợi ý hôm nay. Mai hãy thử lại.`]);
    expect((await ask(other, { field: 'brief' })).status).toBe(202);
  });

  test('answers 503 and keeps no run when the queue cannot take it', async () => {
    const u = await newUser();
    sendFails = true;
    try {
      const res = await ask(u, { field: 'brief' });
      expect([res.status, await error(res)]).toEqual([503, 'suggestions are unavailable right now']);
    } finally {
      sendFails = false;
    }
    expect(await runs(u.id)).toBe(0);
  });

  test('refuses a bad field, a script outside Advanced, over-long text and unknown choices, and queues nothing', async () => {
    const u = await newUser();
    const before = sent.length;
    expect(await error(await ask(u, { field: 'title' }))).toBe('field must be brief, script, hook, location, ending, prompt, translate or video');
    expect(await error(await ask(u, { field: 'script' }))).toBe('a script is for Advanced and Review only');
    expect((await ask(u, { field: 'script', format: 'advanced', text: 'x'.repeat(ADVANCED_MAX_SCRIPT + 1) })).status).toBe(202); // the brief as notes for lines
    expect(await error(await ask(u, { field: 'script', format: 'advanced', text: 'x'.repeat(5001) }))).toBe('text may be at most 5000 characters');
    expect(await error(await ask(u, { field: 'brief', room: 0 }))).toBe('room must be a whole number of characters');
    expect(await error(await ask(u, { field: 'brief', room: 1.5 }))).toBe('room must be a whole number of characters');
    expect(await error(await ask(u, { field: 'brief', hook: 'nope' }))).toBe('hook is not a hook');
    expect(await error(await ask(u, { field: 'brief', location: 'moon' }))).toBe('location is not a location');
    expect(sent.length).toBe(before + 1);
    expect(await runs(u.id)).toBe(1);
  });

  test('a translation queues the English text as it is, counted like any run, and refuses empty or over-long text', async () => {
    const u = await newUser();
    const res = await ask(u, { field: 'translate', text: ' The model turns slowly ', feature: 'ignored' });
    expect(res.status).toBe(202);
    const { id } = (await res.json()) as { id: string };
    expect((await pool.query('select input from suggestion_runs where id = $1', [id])).rows[0].input).toEqual({ field: 'translate', text: 'The model turns slowly', context: '', max: 10_000 });
    expect(await error(await ask(u, { field: 'translate', text: '  ' }))).toBe('text must be 1 to 5000 characters');
    expect(await error(await ask(u, { field: 'translate', text: 'x'.repeat(5001) }))).toBe('text must be 1 to 5000 characters');
    expect(await runs(u.id)).toBe(1);
  });

  test("a prompt asks for the tool's own task by feature, with the member's notes and room, and refuses an unknown feature", async () => {
    const u = await newUser();
    const res = await ask(u, { field: 'prompt', feature: 'video', text: ' xoay chậm ', room: 800, hook: 'ignored' });
    expect(res.status).toBe(202);
    const { id } = (await res.json()) as { id: string };
    const { PROMPT_TASKS } = await import('@cvs/core/suggest');
    expect((await pool.query('select input from suggestion_runs where id = $1', [id])).rows[0].input).toEqual({ field: 'prompt', task: PROMPT_TASKS.video, text: 'xoay chậm', context: '', max: 800 });
    expect((await ask(u, { field: 'prompt', feature: 'background_changer' })).status).toBe(202);
    expect(await error(await ask(u, { field: 'prompt', feature: 'toString' }))).toMatch(/^feature must be one of video, image, try_on/);
    expect(await error(await ask(u, { field: 'prompt' }))).toMatch(/^feature must be one of/);
    expect(await error(await ask(u, { field: 'prompt', feature: 'image', room: 0 }))).toBe('room must be a whole number of characters');
    expect(await error(await ask(u, { field: 'prompt', feature: 'image', text: 'x'.repeat(5001) }))).toBe('text may be at most 5000 characters');
    expect(await runs(u.id)).toBe(2);
  });

  test("names only an enabled model to the LLM, with its tip and sound, and the clip's seconds; refuses an unknown or disabled model and bad values", async () => {
    const u = await newUser();
    await pool.query(
      `insert into model_configs (id, provider, endpoint, label, kind, features, ratios, durations_sec, max_images, output_resolution, usd_per_second, sources, enabled)
       values ('kling-t', 'fal', 'fal-ai/kling-video/v2.6/pro/image-to-video', 'Kling T', 'video', '{video}', '{9:16}', '{5}', 4, '1080p', 0.07, '{}', true),
              ('kling-off', 'fal', 'x', 'Kling Off', 'video', '{video}', '{9:16}', '{5}', 4, '1080p', 0.07, '{}', false)`,
    );
    const { modelNote, PROMPT_TASKS } = await import('@cvs/core/suggest');
    const res = await ask(u, { field: 'prompt', feature: 'video', text: 'xoay', room: 2500, model: 'kling-t', audio: true, seconds: 10 });
    expect(res.status).toBe(202);
    const { id } = (await res.json()) as { id: string };
    const input = (await pool.query('select input from suggestion_runs where id = $1', [id])).rows[0].input;
    expect(input).toEqual({ field: 'prompt', task: PROMPT_TASKS.video, text: 'xoay', context: '', max: 2500, seconds: 10, model: modelNote({ id: 'kling-t', label: 'Kling T', endpoint: 'fal-ai/kling-video/v2.6/pro/image-to-video' }, true) });
    expect(input.model).toMatch(/^The model: Kling T\. Kling follows .* The clip has sound/);
    // A brief takes them too; audio off leaves the sound out on a model that can be silent.
    const brief = (await (await ask(u, { field: 'brief', model: 'kling-t', audio: false })).json()) as { id: string };
    expect((await pool.query('select input from suggestion_runs where id = $1', [brief.id])).rows[0].input.model).not.toMatch(/sound/);
    expect(await error(await ask(u, { field: 'prompt', feature: 'video', model: 'kling-off' }))).toBe('model is not an enabled model');
    expect(await error(await ask(u, { field: 'prompt', feature: 'video', model: 'nope' }))).toBe('model is not an enabled model');
    expect(await error(await ask(u, { field: 'brief', seconds: 0 }))).toBe('seconds must be a whole number from 1 to 60');
    expect(await error(await ask(u, { field: 'brief', seconds: 61 }))).toBe('seconds must be a whole number from 1 to 60');
    expect(await error(await ask(u, { field: 'brief', audio: 'on' }))).toBe('audio must be true or false');
    expect(await runs(u.id)).toBe(2);
  });

  test('a hook or a location asks for the English scene from the name and description, counts against the day, and needs some text', async () => {
    const u = await newUser();
    const res = await ask(u, { field: 'location', text: 'Quán cà phê - Góc quán ấm cúng', format: 'ignored', hook: 'ignored' });
    expect(res.status).toBe(202);
    const { id } = (await res.json()) as { id: string };
    const input = (await pool.query('select input from suggestion_runs where id = $1', [id])).rows[0].input;
    expect(input).toEqual({ field: 'location', text: 'Quán cà phê - Góc quán ấm cúng', context: '', max: 300 });
    expect((await ask(u, { field: 'hook', text: 'Mở hộp quà' })).status).toBe(202);
    expect(await error(await ask(u, { field: 'hook', text: '  ' }))).toBe('text must be the name and description, 1 to 143 characters');
    expect(await error(await ask(u, { field: 'hook', text: 'x'.repeat(144) }))).toBe('text must be the name and description, 1 to 143 characters');
    expect(await runs(u.id)).toBe(2);
  });

  test("a sectioned prompt's hook or ending takes the member's words (maybe none) and the other sections, for the page's model and pace, counted like any run", async () => {
    const u = await newUser();
    await pool.query(
      `insert into model_configs (id, provider, endpoint, label, kind, features, ratios, durations_sec, max_images, output_resolution, usd_per_second, sources, enabled)
       values ('kling-s', 'fal', 'fal-ai/kling-video/v2.6/pro/image-to-video', 'Kling S', 'video', '{video}', '{9:16}', '{5}', 4, '1080p', 0.07, '{}', true)`,
    );
    const { modelNote } = await import('@cvs/core/suggest');
    const input = async (body: Record<string, unknown>) => {
      const res = await ask(u, body);
      expect(res.status).toBe(202);
      const { id } = (await res.json()) as { id: string };
      return (await pool.query('select input from suggestion_runs where id = $1', [id])).rows[0].input;
    };
    const rest = ' The clip opens on a spin. The model walks to the window. ';
    expect(await input({ field: 'ending', text: ' mỉm cười ', rest, model: 'kling-s', audio: false, seconds: 5 })).toEqual({
      field: 'ending', text: 'mỉm cười', context: rest.trim(), max: 200, seconds: 5, model: modelNote({ id: 'kling-s', label: 'Kling S', endpoint: 'fal-ai/kling-video/v2.6/pro/image-to-video' }, false),
    });
    expect(await input({ field: 'hook', rest: '' })).toEqual({ field: 'hook', text: '', context: '', max: 200 });
    // The add form's ending: from the name and description, as short as the section.
    expect(await input({ field: 'ending', text: 'Vẫy tay - Vẫy tay chào' })).toEqual({ field: 'ending', text: 'Vẫy tay - Vẫy tay chào', context: '', max: 200 });
    const before = await runs(u.id);
    expect(await error(await ask(u, { field: 'ending', text: 'x'.repeat(201), rest: '' }))).toBe('text may be at most 200 characters');
    expect(await error(await ask(u, { field: 'hook', text: 5, rest: '' }))).toBe('text may be at most 200 characters');
    expect(await error(await ask(u, { field: 'hook', rest: 'x'.repeat(5001) }))).toBe('rest must be text of at most 5000 characters');
    expect(await error(await ask(u, { field: 'ending', rest: 7 }))).toBe('rest must be text of at most 5000 characters');
    expect(await error(await ask(u, { field: 'ending', rest: '', model: 'nope' }))).toBe('model is not an enabled model');
    expect(await runs(u.id)).toBe(before);
  });

  test('tells the model what an Unboxing or Review clip is, takes a script on Review only, and refuses an unknown format', async () => {
    const u = await newUser();
    const input = async (body: Record<string, unknown>) => {
      const res = await ask(u, body);
      expect(res.status).toBe(202);
      const { id } = (await res.json()) as { id: string };
      return (await pool.query('select input from suggestion_runs where id = $1', [id])).rows[0].input;
    };
    expect(await input({ field: 'brief', format: 'unboxing', text: 'n' })).toMatchObject({ field: 'brief', format: 'unboxing' });
    expect(await input({ field: 'script', format: 'review', text: 'n' })).toMatchObject({ field: 'script', format: 'review' });
    expect(await input({ field: 'hook', format: 'review', rest: 'The creator waves.' })).toMatchObject({ field: 'hook', format: 'review', context: 'The creator waves.' });
    expect(await input({ field: 'ending', format: 'unboxing', rest: '' })).toMatchObject({ field: 'ending', format: 'unboxing' });
    expect(await input({ field: 'brief', format: 'advanced' })).not.toHaveProperty('format'); // Advanced adds nothing to the model's context
    expect(await error(await ask(u, { field: 'script', format: 'unboxing' }))).toBe('a script is for Advanced and Review only');
    expect(await error(await ask(u, { field: 'brief', format: 'bogus' }))).toBe('format must be advanced, unboxing, review or left out');
  });

  test("puts the member's own hook and location phrases in the context, and refuses another member's private one", async () => {
    const [u, other] = [await newUser(), await newUser()];
    const choice = (id: string, userId: string, kind: string, phrase: string) => pool.query(`insert into user_choices (id, user_id, kind, name, phrase) values ($1, $2, $3, 'n', $4)`, [id, userId, kind, phrase]);
    await choice(`${u.id}-hook`, u.id, 'hook', 'The creator waves.');
    await choice(`${u.id}-spot`, u.id, 'location', 'a small cafe');
    await choice(`${other.id}-hook`, other.id, 'hook', 'Secret.');
    const { id } = (await (await ask(u, { field: 'brief', hook: `${u.id}-hook`, location: `${u.id}-spot` })).json()) as { id: string };
    expect((await pool.query('select input from suggestion_runs where id = $1', [id])).rows[0].input.context).toBe('The creator waves. Set in a small cafe.');
    const res = await ask(u, { field: 'brief', hook: `${other.id}-hook` });
    expect([res.status, await error(res)]).toEqual([400, 'hook is not a hook']);
    expect(await error(await ask(u, { field: 'brief', location: `${u.id}-hook` }))).toBe('location is not a location'); // a hook is not a location
    expect(await runs(u.id)).toBe(1);
  });
});

describe('/api/suggestions for a preset prompt from its clip', () => {
  /** A member an Admin made a template editor. */
  async function newEditor() {
    const u = await newUser();
    await pool.query('update users set can_edit_templates = true where id = $1', [u.id]);
    const res = await auth.api.signInEmail({ body: { email: `s${seq}@example.test`, password: PASSWORD }, asResponse: true });
    return { id: u.id, cookie: res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ') };
  }

  test("queues a run on the preset's saved clip for a template editor, counted against the day like any suggestion", async () => {
    await ensureBucket();
    await putObject('samples/preset-walk-left.mp4', new Uint8Array([0, 0, 0, 0x18, ...[...'ftypisom'].map((c) => c.charCodeAt(0))]), 'video/mp4');
    const u = await newEditor();
    const res = await ask(u, { field: 'video', preset: 'walk-left', text: 'ignored' });
    expect(res.status).toBe(202);
    const { id } = (await res.json()) as { id: string };
    expect(sent.at(-1)).toEqual({ name: 'suggest', data: { runId: id } });
    expect((await pool.query('select input from suggestion_runs where id = $1', [id])).rows[0].input).toEqual({ field: 'video', text: '', context: '', max: 5000, clip: 'preset-walk-left.mp4' });
    await pool.query(`insert into suggestion_runs (id, user_id, input) select 'v-seed-' || g, $1, '{}' from generate_series(1, $2) g`, [u.id, SUGGEST_DAILY_LIMIT - 1]);
    expect((await ask(u, { field: 'video', preset: 'walk-left' })).status).toBe(429);
  });

  test('refuses a member with 403, and an unknown preset or one with no saved clip with 400, queuing nothing', async () => {
    const before = sent.length;
    const member = await newUser();
    expect([(await ask(member, { field: 'video', preset: 'walk-left' })).status, await runs(member.id)]).toEqual([403, 0]);
    const u = await newEditor();
    expect(await error(await ask(u, { field: 'video', preset: 'no-such-preset' }))).toBe('preset is not a preset');
    expect(await error(await ask(u, { field: 'video' }))).toBe('preset is not a preset');
    expect(await error(await ask(u, { field: 'video', preset: 'walk-right' }))).toBe('the preset has no clip');
    expect([await runs(u.id), sent.length]).toEqual([0, before]);
  });
});
