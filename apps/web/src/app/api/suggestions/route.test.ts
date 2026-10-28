// Integration test against a disposable database on the compose Postgres (`pnpm services:up`). The queue is a stub: nothing reaches the worker or fal.
import { randomBytes } from 'node:crypto';
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

const { auth, pool } = await import('@/lib/auth');
const { POST } = await import('./route');
const { GET } = await import('./[id]/route');
const { ADVANCED_MAX_BRIEF, ADVANCED_MAX_SCRIPT, HOOKS, SUGGEST_DAILY_LIMIT } = await import('@/lib/marketing');

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
  await pool.end();
  await testDb.drop();
});

describe('/api/suggestions', () => {
  test('queues a run with the hook phrase and the member’s text, and gives its options to the member who asked only', async () => {
    const [u, other] = [await newUser(), await newUser()];
    const hook = HOOKS[0]!;
    const res = await ask(u, { field: 'brief', text: ' linen dress ', hook: hook.id });
    expect(res.status).toBe(202);
    const { id } = (await res.json()) as { id: string };
    expect(sent.at(-1)).toEqual({ name: 'suggest', data: { runId: id } });
    expect((await pool.query('select input from suggestion_runs where id = $1', [id])).rows[0].input).toEqual({ field: 'brief', text: 'linen dress', context: hook.phrase, max: 1200 });
    expect(await (await poll(u, id)).json()).toEqual({ id, status: 'queued', options: [] });
    await pool.query(`update suggestion_runs set status = 'succeeded', output = '["a","b","c"]' where id = $1`, [id]);
    expect(await (await poll(u, id)).json()).toEqual({ id, status: 'succeeded', options: ['a', 'b', 'c'] });
    expect((await poll(other, id)).status).toBe(404);
  });

  test('a run still queued after 60 s turns failed when polled', async () => {
    const u = await newUser();
    const { id } = (await (await ask(u, { field: 'brief' })).json()) as { id: string };
    await pool.query(`update suggestion_runs set created_at = now() - interval '61 seconds' where id = $1`, [id]);
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
    expect(await error(await ask(u, { field: 'title' }))).toBe('field must be brief or script');
    expect(await error(await ask(u, { field: 'script' }))).toBe('a script is for Advanced only');
    expect((await ask(u, { field: 'script', format: 'advanced', text: 'x'.repeat(ADVANCED_MAX_SCRIPT + 1) })).status).toBe(202); // the brief as notes for lines
    expect(await error(await ask(u, { field: 'script', format: 'advanced', text: 'x'.repeat(ADVANCED_MAX_BRIEF + 1) }))).toBe(`text may be at most ${ADVANCED_MAX_BRIEF} characters`);
    expect(await error(await ask(u, { field: 'brief', hook: 'nope' }))).toBe('hook is not a hook');
    expect(await error(await ask(u, { field: 'brief', location: 'moon' }))).toBe('location is not a location');
    expect(sent.length).toBe(before + 1);
    expect(await runs(u.id)).toBe(1);
  });
});
