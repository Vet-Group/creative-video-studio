// The paid creates of an agent (lib/agent-access.ts agentPrecheck + agentCharge): a dry run answers 428 with the price and a confirm token, the confirmed
// call creates once and replays its answer, and the connection's monthly cap and limits hold, against the real routes on a disposable database (compose Postgres).
import { createHash, randomBytes } from 'node:crypto';
import { createTestDatabase } from '@cvs/db/testing';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';

vi.setConfig({ testTimeout: 60_000 });

const testDb = await createTestDatabase();
process.env.DATABASE_URL = testDb.url;
process.env.BETTER_AUTH_SECRET = randomBytes(32).toString('hex');
process.env.APP_URL = 'http://localhost';
process.env.REA_REMAKE_ENABLED = '1';
process.env.REA_ANALYZE_ENABLED = '1';

const { pool } = await import('@/lib/auth');
const { agentContext, agentSession, canonicalJSON, newPat, signConfirm } = await import('@/lib/agent-access');
const { forgetFalBalance } = await import('@/lib/provider-credit');
const { stopBoss } = await import('@/lib/queue');
const { CAP_MESSAGES } = await import('@/lib/caps');
const { tokenMonthSpend } = await import('@cvs/core/limits');
const jobs = await import('./jobs/route');
const remakes = await import('./remakes/route');
const analyses = await import('./analyses/route');
const suggestions = await import('./suggestions/route');
const customRun = await import('./custom-apps/[id]/run/route');

type Init = { body: unknown; confirm?: string; token: string };
const post = (path: string, { body, confirm, token }: Init) =>
  new Request(`http://localhost${path}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...(confirm && { 'x-cvs-confirm': confirm }) },
    body: JSON.stringify(body),
  });
type Dry = { error: string; estimateUsd: string | null; confirmToken: string; expiresAt: string; tokenMonth: { usedUsd: string; capUsd: string } };
const json = async <T = Record<string, unknown>>(res: Response) => (await res.clone().json()) as T;
const count = async (table: string) => (await pool.query(`select count(*)::int as n from ${table}`)).rows[0].n as number;

let seq = 0;
async function agent(cap = '20'): Promise<{ userId: string; id: string; token: string }> {
  const userId = `u-charge-${++seq}`;
  await pool.query(`insert into users (id, email, name, role) values ($1, $2, $1, 'admin')`, [userId, `${userId}@example.test`]);
  await pool.query(`insert into workspace_members (workspace_id, user_id, role) values ('ws_vet', $1, 'member') on conflict do nothing`, [userId]);
  for (const [id, mime] of [['img', 'image/png'], ['vid', 'video/mp4']])
    await pool.query(`insert into assets (id, owner_id, kind, s3_key, filename, mime, bytes, workspace_id) values ($1, $2, 'input', $1, 'f', $3, 1, 'ws_vet')`, [`${id}-${userId}`, userId, mime]);
  const { id, token, hash } = newPat();
  await pool.query(
    `insert into api_tokens (id, user_id, workspace_id, kind, name, secret_hash, monthly_cap_usd, expires_at) values ($1, $2, 'ws_vet', 'pat', 'test', $3, $4, now() + interval '30 days')`,
    [id, userId, hash, cap],
  );
  return { userId, id, token };
}
const run = (a: { userId: string; token: string }, confirm?: string, extra: Record<string, unknown> = {}) =>
  jobs.POST(post('/api/jobs', { token: a.token, confirm, body: { modelId: 'fal-agent', presetId: 'gentle-push-in', ratio: '9:16', durationSec: 5, assetIds: [`img-${a.userId}`], ...extra } }));
/** A confirmed Run: its dry run, then the call with the token it gave. */
async function confirmedRun(a: { userId: string; token: string }, extra: Record<string, unknown> = {}): Promise<Response> {
  const dry = await run(a, undefined, extra);
  expect(dry.status).toBe(428);
  return run(a, (await json<Dry>(dry)).confirmToken, extra);
}
/** Spend already booked for the connection this ICT month, as one llm row. */
async function spent(a: { userId: string; id: string }, usd: string) {
  await pool.query(
    `insert into cost_entries (kind, usd, month, day, user_id, team_id, is_final, ref, workspace_id, api_token_id)
       values ('llm', $1, to_char(now() at time zone 'Asia/Ho_Chi_Minh', 'YYYY-MM'), (now() at time zone 'Asia/Ho_Chi_Minh')::date, $2, 'team-unassigned', true, $3, 'ws_vet', $4)`,
    [usd, a.userId, `test-spend-${++seq}`, a.id],
  );
}

beforeAll(async () => {
  await pool.query(
    `insert into model_configs (id, provider, endpoint, label, ratios, durations_sec, max_images, output_resolution, usd_per_second, sources, enabled) values ('fal-agent', 'fal', 'x', 'Fal agent', '{9:16}', '{5}', 4, '720p', 0.04, '{}', true)`,
  );
  await pool.query(`update model_configs set enabled = false where id in ('veo-3.1', 'veo-3.1-vertex')`);
  await pool.query('update settings set member_daily_clip_cap = 1000, monthly_cap_usd = 100000, member_daily_analysis_cap = 1000 where id = 1');
});

afterAll(async () => {
  try {
    await stopBoss();
    await pool.end();
  } finally {
    await testDb.drop();
  }
});

describe('POST /api/jobs by an agent', () => {
  test('a dry run is 428 with the price a confirmed run reserves, and writes nothing', async () => {
    const a = await agent();
    const before = await Promise.all(['jobs', 'cost_entries', 'agent_confirms'].map(count));
    const dry = await run(a);
    expect(dry.status).toBe(428);
    const body = await json<Dry>(dry);
    expect(body).toMatchObject({ error: 'confirm_required', estimateUsd: '0.2000', tokenMonth: { usedUsd: '0.0000', capUsd: '20.0000' } });
    expect(await Promise.all(['jobs', 'cost_entries', 'agent_confirms'].map(count))).toEqual(before);

    const ok = await run(a, body.confirmToken);
    expect(ok.status).toBe(201);
    const { id } = await json<{ id: string }>(ok);
    expect((await pool.query('select api_token_id from jobs where id = $1', [id])).rows[0].api_token_id).toBe(a.id);
    expect((await pool.query('select kind, usd::text, api_token_id from cost_entries where job_id = $1', [id])).rows).toEqual([{ kind: 'estimate', usd: '0.2000', api_token_id: a.id }]);
    expect(await tokenMonthSpend(pool, a.id)).toBe('0.2000');
  });

  test('a resent confirm replays the first answer, even past the cap; an edited, expired or repriced confirm is 409', async () => {
    const a = await agent();
    const dry = await json<Dry>(await run(a));
    const first = await run(a, dry.confirmToken);
    expect(first.status).toBe(201);
    const rows = await Promise.all(['jobs', 'cost_entries'].map(count));
    await pool.query(`update api_tokens set monthly_cap_usd = 0 where id = $1`, [a.id]);
    const again = await run(a, dry.confirmToken);
    expect([again.status, await json(again)]).toEqual([201, await json(first)]);
    expect(await Promise.all(['jobs', 'cost_entries'].map(count))).toEqual(rows);
    await pool.query(`update api_tokens set monthly_cap_usd = 20 where id = $1`, [a.id]);

    const fresh = await json<Dry>(await run(a));
    const edited = await run(a, fresh.confirmToken, { durationSec: 10 });
    expect([edited.status, (await json(edited)).error]).toEqual([409, 'confirm_invalid']);
    const body = { modelId: 'fal-agent', presetId: 'gentle-push-in', ratio: '9:16', durationSec: 5, assetIds: [`img-${a.userId}`] };
    const old = signConfirm({ tokenId: a.id, method: 'POST', path: '/api/jobs', hash: createHash('sha256').update(canonicalJSON(body)).digest('hex') }, '0.2000', Date.now() - 11 * 60_000);
    const expired = await run(a, old.confirmToken);
    expect([expired.status, (await json(expired)).error]).toEqual([409, 'confirm_expired']);

    await pool.query(`update model_configs set usd_per_second = 0.06 where id = 'fal-agent'`);
    try {
      const stale = await run(a, fresh.confirmToken);
      expect(stale.status).toBe(409);
      const staleBody = await json<Dry>(stale);
      expect(staleBody).toMatchObject({ error: 'confirm_stale', estimateUsd: '0.3000' });
      expect((await run(a, staleBody.confirmToken)).status).toBe(201);
    } finally {
      await pool.query(`update model_configs set usd_per_second = 0.04 where id = 'fal-agent'`);
    }
  });

  test("past the connection's cap the run is 429 token_monthly_usd; a member cap refuses first", async () => {
    const a = await agent();
    await spent(a, '19.9000');
    const refused = await run(a);
    expect([refused.status, await json(refused)]).toEqual([429, { error: 'token_monthly_usd', tokenMonth: { usedUsd: '19.9000', capUsd: '20.0000' } }]);
    await pool.query('update settings set member_daily_clip_cap = 0 where id = 1');
    try {
      const member = await run(a);
      expect([member.status, (await json(member)).error]).toEqual([429, CAP_MESSAGES.daily_clips]);
    } finally {
      await pool.query('update settings set member_daily_clip_cap = 1000 where id = 1');
    }
  });

  test('five confirmed runs at the cap edge: only those that fit are created', async () => {
    const a = await agent('0.6');
    const tokens = [];
    for (let i = 0; i < 5; i++) tokens.push((await json<Dry>(await run(a))).confirmToken);
    const answers = await Promise.all(tokens.map((t) => run(a, t)));
    expect(answers.map((r) => r.status).sort()).toEqual([201, 201, 201, 429, 429]);
    expect((await pool.query('select count(*)::int as n from jobs where api_token_id = $1', [a.id])).rows[0].n).toBe(3);
    expect(await tokenMonthSpend(pool, a.id)).toBe('0.6000');
  });

  test('a fal balance too low refuses the dry run as it would the real run, from the same cached balance', async () => {
    const a = await agent();
    // fal's balance leaves 0.10 USD beside the fal jobs other tests left queued (provider-credit.ts subtracts them).
    const inFlight = Number(
      (await pool.query(`select coalesce(sum(c.usd), 0)::text as usd from cost_entries c join jobs j on j.id = c.job_id where c.kind = 'estimate' and j.provider = 'fal' and not j.is_mock and j.status in ('queued', 'submitting', 'running')`)).rows[0].usd,
    );
    let calls = 0;
    vi.stubGlobal('fetch', async (url: string) => {
      if (!url.startsWith('https://api.fal.ai/v1/account/billing')) return new Response('unexpected', { status: 500 });
      calls++;
      return Response.json({ credits: { current_balance: inFlight + 0.1, currency: 'USD' } });
    });
    process.env.FAL_KEY = 'fal-fixture-value'; // a made-up value, never a real key
    forgetFalBalance();
    try {
      const dry = await run(a);
      expect(dry.status).toBe(429);
      expect((await json(dry)).error).toContain('fal.ai');
      await pool.query(`update model_configs set usd_per_second = 0.01 where id = 'fal-agent'`);
      const cheap = await run(a);
      expect([cheap.status, (await json<Dry>(cheap)).estimateUsd]).toEqual([428, '0.0500']);
      expect((await run(a, (await json<Dry>(cheap)).confirmToken)).status).toBe(201);
      expect(calls).toBe(1); // the dry runs and the confirmed run read one cached balance
    } finally {
      await pool.query(`update model_configs set usd_per_second = 0.04 where id = 'fal-agent'`);
      vi.unstubAllGlobals();
      process.env.FAL_KEY = '';
      forgetFalBalance();
    }
  });

  test('past 30 dry runs or 10 confirmed creates a minute the connection is 429, over REST and in an MCP context alike', async () => {
    const a = await agent();
    const tokens: string[] = [];
    for (let i = 0; i < 30; i++) {
      const dry = await run(a);
      expect(dry.status).toBe(428);
      tokens.push((await json<Dry>(dry)).confirmToken);
    }
    expect((await run(a)).status).toBe(429);
    const session = (await agentSession(post('/api/jobs', { token: a.token, body: {} })))!.session!;
    const inContext = await agentContext.run(session, () =>
      jobs.POST(new Request('http://localhost/api/jobs', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ modelId: 'fal-agent', presetId: 'gentle-push-in', ratio: '9:16', durationSec: 5, assetIds: [`img-${a.userId}`] }) })),
    );
    expect(inContext.status).toBe(429);

    const answers = [];
    for (const t of tokens.slice(0, 11)) answers.push((await run(a, t)).status);
    expect(answers).toEqual([...Array(10).fill(201), 429]);
  });
});

describe('the other paid creates', () => {
  test('one job and one analysis of one connection sent together both finish, with no deadlock', async () => {
    const a = await agent();
    const jobDry = await json<Dry>(await run(a));
    const analysisBody = { sourceAssetId: `vid-${a.userId}` };
    const analysisDry = await analyses.POST(post('/api/analyses', { token: a.token, body: analysisBody }));
    expect([analysisDry.status, (await json<Dry>(analysisDry)).estimateUsd]).toEqual([428, null]);
    const both = Promise.all([run(a, jobDry.confirmToken), analyses.POST(post('/api/analyses', { token: a.token, body: analysisBody, confirm: (await json<Dry>(analysisDry)).confirmToken }))]);
    const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error('deadlock')), 5_000));
    const [job, analysis] = await Promise.race([both, timeout]);
    expect([job.status, analysis.status]).toEqual([201, 201]);
    const { id } = await json<{ id: string }>(analysis);
    expect((await pool.query('select api_token_id from analyses where id = $1', [id])).rows[0].api_token_id).toBe(a.id);
    expect(await tokenMonthSpend(pool, a.id)).toBe('0.2000');
  });

  test('a remake and a suggestion run need a confirm too, and carry the connection', async () => {
    const a = await agent();
    const shots = JSON.stringify({ shots: [1, 2].map((index) => ({ index, start: index - 1, end: index, role: 'r', prompt: `p${index}` })) });
    await pool.query(
      `insert into analyses (id, user_id, team_id, source_key, status, result, workspace_id) values ($1, $2, 'team-unassigned', 's3/v', 'succeeded', $3::jsonb, 'ws_vet')`,
      [`an-${a.userId}`, a.userId, shots],
    );
    const remakeBody = { analysisId: `an-${a.userId}`, productAssetId: `img-${a.userId}`, shots: [1] };
    const dry = await remakes.POST(post('/api/remakes', { token: a.token, body: remakeBody }));
    expect(dry.status).toBe(428);
    const remakeDry = await json<Dry>(dry);
    expect(Number(remakeDry.estimateUsd)).toBeGreaterThan(0);
    expect(await count('remakes')).toBe(0);
    const made = await remakes.POST(post('/api/remakes', { token: a.token, body: remakeBody, confirm: remakeDry.confirmToken }));
    expect(made.status).toBe(201);
    const remake = (await pool.query('select estimate_usd::text, api_token_id from remakes where id = $1', [(await json<{ id: string }>(made)).id])).rows[0];
    expect(remake).toEqual({ estimate_usd: remakeDry.estimateUsd, api_token_id: a.id });
    expect(await tokenMonthSpend(pool, a.id)).toBe(remakeDry.estimateUsd); // the open remake's estimate counts until it books

    const suggestBody = { field: 'translate', text: 'A slow push-in on the shirt.' };
    const suggestDry = await suggestions.POST(post('/api/suggestions', { token: a.token, body: suggestBody }));
    expect([suggestDry.status, (await json<Dry>(suggestDry)).estimateUsd]).toEqual([428, null]);
    const queued = await suggestions.POST(post('/api/suggestions', { token: a.token, body: suggestBody, confirm: (await json<Dry>(suggestDry)).confirmToken }));
    expect(queued.status).toBe(202);
    const runId = (await json<{ id: string }>(queued)).id;
    expect((await pool.query('select api_token_id from suggestion_runs where id = $1', [runId])).rows[0].api_token_id).toBe(a.id);

    // An LLM route has no upfront price: at the cap it is refused outright.
    await pool.query(`update api_tokens set monthly_cap_usd = $2 where id = $1`, [a.id, remakeDry.estimateUsd]);
    const full = await suggestions.POST(post('/api/suggestions', { token: a.token, body: suggestBody }));
    expect([full.status, (await json(full)).error]).toEqual([429, 'token_monthly_usd']);
  });

  test("a custom app's Run is confirmed by the inner /api/jobs and replays the same job", async () => {
    const a = await agent();
    const source = `src-${a.userId}`;
    await pool.query(
      `insert into jobs (id, user_id, team_id, model, provider, prompt, aspect, duration_s, input_asset_ids, status, output_asset_id, workspace_id)
         values ($1, $2, 'team-unassigned', 'fal-agent', 'fal', 'p', '9:16', 5, $3, 'succeeded', $4, 'ws_vet')`,
      [source, a.userId, [`img-${a.userId}`], `img-${a.userId}`],
    );
    const app = crypto.randomUUID();
    await pool.query(
      `insert into custom_apps (id, workspace_id, source_job_id, feature, name, category, model, prompt, aspect, duration_s, inputs) values ($1, 'ws_vet', $2, 'video', 'Agent app', 'video', 'fal-agent', 'p', '9:16', 5, $3::jsonb)`,
      [app, source, JSON.stringify([{ slot: { label: 'Ảnh', hint: '' } }])],
    );
    const send = (confirm?: string) => customRun.POST(post(`/api/custom-apps/${app}/run`, { token: a.token, body: { assetIds: [`img-${a.userId}`] }, confirm }), { params: Promise.resolve({ id: app }) });
    const dry = await send();
    expect(dry.status).toBe(428);
    const { confirmToken } = await json<Dry>(dry);
    const made = await send(confirmToken);
    expect(made.status).toBe(201);
    const { id } = await json<{ id: string }>(made);
    expect((await pool.query('select api_token_id from jobs where id = $1', [id])).rows[0].api_token_id).toBe(a.id);
    const ledger = await count('cost_entries');
    const again = await send(confirmToken);
    expect([again.status, (await json<{ id: string }>(again)).id]).toEqual([201, id]);
    expect(await count('cost_entries')).toBe(ledger);
  });
});

test('tokenMonthSpend counts the ICT month: 23:59 on the last day and 00:00 on the first are different months', async () => {
  const a = await agent();
  for (const [month, usd] of [['2026-10', '1.5000'], ['2026-11', '2.2500']])
    await pool.query(
      `insert into cost_entries (kind, usd, month, day, user_id, team_id, is_final, ref, workspace_id, api_token_id) values ('llm', $1, $2, $3, $4, 'team-unassigned', true, $5, 'ws_vet', $6)`,
      [usd, month, `${month}-15`, a.userId, `month-${month}-${a.id}`, a.id],
    );
  expect(await tokenMonthSpend(pool, a.id, new Date('2026-10-31T16:59:59Z'))).toBe('1.5000');
  expect(await tokenMonthSpend(pool, a.id, new Date('2026-10-31T17:00:00Z'))).toBe('2.2500');
});
