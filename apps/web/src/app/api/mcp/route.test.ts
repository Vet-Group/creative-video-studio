// The MCP endpoint (app/api/mcp/route.ts, lib/mcp/*): the 15 tools over the 2025-era stateless fallback and the 2026-07-28 protocol, the Bearer resolved
// once at the endpoint and carried to the route handlers by AsyncLocalStorage only, and the paid confirm flow through tools, against the real routes on a
// disposable database (compose Postgres).
import { randomBytes } from 'node:crypto';
import { createTestDatabase } from '@cvs/db/testing';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';

vi.setConfig({ testTimeout: 60_000 });

const testDb = await createTestDatabase();
process.env.DATABASE_URL = testDb.url;
process.env.BETTER_AUTH_SECRET = randomBytes(32).toString('hex');
process.env.APP_URL = 'http://localhost';
process.env.FAL_KEY = '';

const { pool } = await import('@/lib/auth');
const { agentContext, agentSession, hits, newPat } = await import('@/lib/agent-access');
const { stopBoss } = await import('@/lib/queue');
const { createMcpHandler } = await import('@modelcontextprotocol/server');
const { createServer } = await import('@/lib/mcp/server');
const route = await import('./route');

type Rpc = { result?: { tools?: Tool[]; structuredContent?: Record<string, any>; isError?: boolean; protocolVersion?: string }; error?: { code: number; message: string } };
type Tool = { name: string; annotations: { readOnlyHint: boolean; destructiveHint: boolean; idempotentHint: boolean } };
const LEGACY = '2025-06-18';
const MODERN = '2026-07-28';
const META = { 'io.modelcontextprotocol/protocolVersion': MODERN, 'io.modelcontextprotocol/clientInfo': { name: 'test', version: '1' }, 'io.modelcontextprotocol/clientCapabilities': {} };

let seq = 0;
async function agent(): Promise<{ userId: string; id: string; token: string; email: string }> {
  const userId = `u-mcp-${++seq}`;
  const email = `${userId}@example.test`;
  await pool.query(`insert into users (id, email, name, role) values ($1, $2, $1, 'admin')`, [userId, email]);
  await pool.query(`insert into workspace_members (workspace_id, user_id, role) values ('ws_vet', $1, 'member') on conflict do nothing`, [userId]);
  await pool.query(`insert into assets (id, owner_id, kind, s3_key, filename, mime, bytes, workspace_id) values ($1, $2, 'input', $1, 'f', 'image/png', 1, 'ws_vet')`, [`img-${userId}`, userId]);
  const { id, token, hash } = newPat();
  await pool.query(
    `insert into api_tokens (id, user_id, workspace_id, kind, name, secret_hash, monthly_cap_usd, expires_at) values ($1, $2, 'ws_vet', 'pat', 'mcp test', $3, 20, now() + interval '30 days')`,
    [id, userId, hash],
  );
  return { userId, id, token, email };
}

/** One POST to /api/mcp; the answer is JSON or one SSE message. */
async function post(body: unknown, headers: Record<string, string> = {}): Promise<{ status: number; rpc: Rpc; res: Response }> {
  const res = await route.POST(
    new Request('http://localhost/api/mcp', { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...headers }, body: JSON.stringify(body) }),
  );
  const text = await res.text();
  const data = res.headers.get('content-type')?.startsWith('text/event-stream') ? text.split('\n').filter((l) => l.startsWith('data: ')).at(-1)!.slice(6) : text;
  return { status: res.status, rpc: (data ? JSON.parse(data) : {}) as Rpc, res };
}
const auth = (token: string) => ({ authorization: `Bearer ${token}` });
/** A tools/call as a 2025-era client sends it (no envelope; the stateless fallback serves it). */
const legacyCall = (token: string, name: string, args: Record<string, unknown> = {}, headers: Record<string, string> = {}) =>
  post({ jsonrpc: '2.0', id: ++seq, method: 'tools/call', params: { name, arguments: args } }, { ...auth(token), 'mcp-protocol-version': LEGACY, ...headers });
/** A tools/call as a 2026-07-28 client sends it: the per-request envelope and the standard headers. */
const modernCall = (token: string, name: string, args: Record<string, unknown> = {}) =>
  post({ jsonrpc: '2.0', id: ++seq, method: 'tools/call', params: { name, arguments: args, _meta: META } }, { ...auth(token), 'mcp-protocol-version': MODERN, 'mcp-method': 'tools/call', 'mcp-name': name });
const out = async (p: ReturnType<typeof legacyCall>) => (await p).rpc.result!;
const count = async (table: string) => (await pool.query(`select count(*)::int as n from ${table}`)).rows[0].n as number;
const toolRows = async (tokenId: string) => (await pool.query(`select count(*)::int as n from audit_entries where action = 'agent.tool' and target = $1`, [`api_token:${tokenId}`])).rows[0].n as number;
const runArgs = (userId: string, extra: Record<string, unknown> = {}) => ({ modelId: 'fal-mcp', presetId: 'gentle-push-in', ratio: '9:16', durationSec: 5, assetIds: [`img-${userId}`], ...extra });

beforeAll(async () => {
  await pool.query(
    `insert into model_configs (id, provider, endpoint, label, ratios, durations_sec, max_images, output_resolution, usd_per_second, sources, enabled) values ('fal-mcp', 'fal', 'x', 'Fal MCP', '{9:16}', '{5}', 4, '720p', 0.04, '{}', true)`,
  );
  await pool.query(`update model_configs set enabled = false where id in ('veo-3.1', 'veo-3.1-vertex')`);
  await pool.query('update settings set member_daily_clip_cap = 1000, monthly_cap_usd = 100000 where id = 1');
});

afterAll(async () => {
  try {
    await stopBoss();
    await pool.end();
  } finally {
    await testDb.drop();
  }
});

describe('/api/mcp', () => {
  test('tools/list names the 15 tools with their read, paid and destructive annotations', async () => {
    const a = await agent();
    const { rpc } = await post({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }, { ...auth(a.token), 'mcp-protocol-version': LEGACY });
    const tools = rpc.result!.tools!;
    expect(tools.map((t) => t.name).sort()).toEqual(
      ['whoami', 'limits_get', 'models_list', 'apps_list', 'stores_list', 'asset_upload', 'job_create', 'jobs_list', 'job_get', 'job_cancel', 'analysis_create', 'analysis_get', 'remake_create', 'remake_get', 'library_list'].sort(),
    );
    const by = Object.fromEntries(tools.map((t) => [t.name, t.annotations]));
    for (const name of ['whoami', 'limits_get', 'models_list', 'apps_list', 'stores_list', 'jobs_list', 'job_get', 'analysis_get', 'remake_get', 'library_list'])
      expect([name, by[name]]).toEqual([name, expect.objectContaining({ readOnlyHint: true, destructiveHint: false, idempotentHint: true })]);
    for (const name of ['job_create', 'analysis_create', 'remake_create']) expect([name, by[name]]).toEqual([name, expect.objectContaining({ readOnlyHint: false, destructiveHint: false, idempotentHint: false })]);
    expect(by.job_cancel).toMatchObject({ readOnlyHint: false, destructiveHint: true, idempotentHint: true });
    expect(by.asset_upload).toMatchObject({ readOnlyHint: false, destructiveHint: false });
  });

  test('whoami answers a 2025-era client (initialize, then a stateless call) and a 2026-07-28 request', async () => {
    const a = await agent();
    const init = await post({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: LEGACY, capabilities: {}, clientInfo: { name: 'test', version: '1' } } }, auth(a.token));
    expect(init.rpc.result!.protocolVersion).toBe(LEGACY);
    const legacy = await out(legacyCall(a.token, 'whoami'));
    expect(legacy.structuredContent).toMatchObject({ user: { email: a.email, role: 'admin' }, workspace: { workspaceId: 'ws_vet' }, connection: { id: a.id, name: 'mcp test', kind: 'pat' }, tokenMonth: { capUsd: '20.0000' } });
    const modern = await modernCall(a.token, 'whoami');
    expect(modern.status).toBe(200);
    expect(modern.rpc.result!.structuredContent).toMatchObject({ user: { email: a.email }, connection: { id: a.id } });
  });

  test('no Bearer or a cookie alone is 401 with a plain Bearer challenge, a bad Bearer adds invalid_token (no resource metadata until OAuth)', async () => {
    const list = { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} };
    const cases: [Record<string, string>, string][] = [
      [{}, 'Bearer realm="cvs"'],
      [{ authorization: `Bearer cvs_pat_${'x'.repeat(12)}_${'y'.repeat(43)}` }, 'Bearer realm="cvs", error="invalid_token"'],
      [{ cookie: 'better-auth.session_token=abc.def' }, 'Bearer realm="cvs"'],
    ];
    for (const [headers, want] of cases) {
      const { status, res } = await post(list, headers);
      expect([status, res.headers.get('www-authenticate')]).toEqual([401, want]);
    }
  });

  test('a JSON-RPC batch is 400 batch_not_supported and runs no tool', async () => {
    const a = await agent();
    const call = (id: number) => ({ jsonrpc: '2.0', id, method: 'tools/call', params: { name: 'whoami', arguments: {} } });
    for (const body of [JSON.stringify([call(1), call(2)]), `  \n [${JSON.stringify(call(3))}]`]) {
      const res = await route.POST(
        new Request('http://localhost/api/mcp', {
          method: 'POST',
          headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', 'mcp-protocol-version': LEGACY, ...auth(a.token) },
          body,
        }),
      );
      expect([res.status, ((await res.json()) as { error: string }).error]).toEqual([400, 'batch_not_supported']);
    }
    expect(await toolRows(a.id)).toBe(0);
  });

  test('past the first tool call of a request, each one counts against the per-minute limit, so a batch that reached the server cannot fan out', async () => {
    const a = await agent();
    const resolved = await agentSession(new Request('http://localhost/api/mcp', { headers: auth(a.token) }));
    const session = { ...resolved!.session!, agent: { ...resolved!.session!.agent!, via: 'mcp' as const } };
    hits.set(`req:${a.id}`, Array<number>(119).fill(Date.now()));
    const handler = createMcpHandler(createServer);
    const batch = [1, 2, 3].map((id) => ({ jsonrpc: '2.0', id, method: 'tools/call', params: { name: 'whoami', arguments: {} } }));
    const res = await agentContext.run(session, () =>
      handler.fetch(
        new Request('http://localhost/api/mcp', {
          method: 'POST',
          headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', 'mcp-protocol-version': LEGACY },
          body: JSON.stringify(batch),
        }),
      ),
    );
    const text = await res.text();
    const rpcs: Rpc[] = res.headers.get('content-type')?.startsWith('text/event-stream')
      ? text.split('\n').filter((l) => l.startsWith('data: ')).flatMap((l) => JSON.parse(l.slice(6)))
      : JSON.parse(text);
    const refused = rpcs.filter((r) => r.result?.isError);
    expect([rpcs.length, refused.length]).toEqual([3, 1]);
    expect(refused[0]!.result!.structuredContent).toMatchObject({ error: 'rate_limited', retryAfterSec: expect.any(Number) });
    expect(hits.get(`req:${a.id}`)!.length).toBe(120);
  });

  test('job_create: the dry run prices and writes nothing; the confirmed call makes the job under the connection; a reused confirmToken is a confirm_used error', async () => {
    const a = await agent();
    const before = await Promise.all(['jobs', 'cost_entries', 'agent_confirms'].map(count));
    const dry = await out(legacyCall(a.token, 'job_create', runArgs(a.userId)));
    expect(dry.isError).toBeFalsy();
    expect(dry.structuredContent).toMatchObject({ dryRun: true, estimateUsd: '0.2000', confirmToken: expect.any(String) });
    expect(await Promise.all(['jobs', 'cost_entries', 'agent_confirms'].map(count))).toEqual(before);

    const confirmToken = dry.structuredContent!.confirmToken as string;
    const made = await out(legacyCall(a.token, 'job_create', runArgs(a.userId, { confirmToken })));
    expect(made.isError).toBeFalsy();
    const { jobId } = made.structuredContent as { jobId: string };
    expect((await pool.query('select api_token_id, status from jobs where id = $1', [jobId])).rows[0]).toEqual({ api_token_id: a.id, status: 'queued' });

    const jobsNow = await count('jobs');
    const again = await out(legacyCall(a.token, 'job_create', runArgs(a.userId, { confirmToken })));
    expect(again.isError).toBe(true);
    expect(again.structuredContent).toMatchObject({ error: 'confirm_used', replay: true, firstAnswer: { jobId } });
    expect(await count('jobs')).toBe(jobsNow);

    const got = await out(legacyCall(a.token, 'job_get', { id: jobId }));
    expect(got.structuredContent).toMatchObject({ id: jobId, status: 'queued', url: 'http://localhost/create' });
  });

  test('job_create with dryRun true and a confirmToken is refused and charges nothing', async () => {
    const a = await agent();
    const dry = await out(legacyCall(a.token, 'job_create', runArgs(a.userId)));
    const before = await Promise.all(['jobs', 'cost_entries', 'agent_confirms'].map(count));
    const both = await out(legacyCall(a.token, 'job_create', runArgs(a.userId, { dryRun: true, confirmToken: dry.structuredContent!.confirmToken })));
    expect(both.isError).toBe(true);
    expect(both.structuredContent).toMatchObject({ error: 'bad_input' });
    expect(await Promise.all(['jobs', 'cost_entries', 'agent_confirms'].map(count))).toEqual(before);
  });

  test('job_create with a customAppId runs the app as the connection: its dry run prices the job the app makes', async () => {
    const a = await agent();
    const source = `job-app-${a.userId}`;
    await pool.query(
      `insert into jobs (id, user_id, team_id, model, provider, prompt, aspect, duration_s, input_asset_ids, status, workspace_id, output_asset_id)
         values ($1, $2, 'team-unassigned', 'fal-mcp', 'fal', 'p', '9:16', 5, '{}', 'succeeded', 'ws_vet', $3)`,
      [source, a.userId, `img-${a.userId}`],
    );
    const appId = `app-${a.userId}`;
    await pool.query(
      `insert into custom_apps (id, workspace_id, source_job_id, feature, name, category, model, prompt, aspect, duration_s, inputs, published_at)
         values ($1, 'ws_vet', $2, 'video', 'MCP app', 'video', 'fal-mcp', 'p', '9:16', 5, $3::jsonb, now())`,
      [appId, source, JSON.stringify([{ slot: { label: 'Photo', hint: '' } }])],
    );
    const dry = await out(legacyCall(a.token, 'job_create', { customAppId: appId, assetIds: [`img-${a.userId}`] }));
    expect(dry.isError).toBeFalsy();
    expect(dry.structuredContent).toMatchObject({ dryRun: true, estimateUsd: '0.2000', confirmToken: expect.any(String) });
  });

  test('library_list refuses a cursor past 1000 items', async () => {
    const a = await agent();
    expect((await out(legacyCall(a.token, 'library_list', { cursor: '1000' }))).isError).toBeFalsy();
    const deep = await out(legacyCall(a.token, 'library_list', { cursor: '5000' }));
    expect(deep.isError).toBe(true);
    expect(deep.structuredContent).toMatchObject({ error: 'bad_cursor' });
  });

  test('one tool call is one unit of the per-minute limit and one agent.tool row, and the 31st dry run in a minute is refused', async () => {
    const a = await agent();
    const audited = async () => (await pool.query(`select count(*)::int as n from audit_entries where target = $1`, [`api_token:${a.id}`])).rows[0].n as number;
    await legacyCall(a.token, 'whoami');
    expect(hits.get(`req:${a.id}`)!.length).toBe(1);
    expect([await toolRows(a.id), await audited()]).toEqual([1, 1]);
    const row = (await pool.query(`select actor_id, new_value from audit_entries where action = 'agent.tool' and target = $1`, [`api_token:${a.id}`])).rows[0];
    expect(row).toMatchObject({ actor_id: a.userId, new_value: { tool: 'whoami', outcome: 'ok', via: 'mcp', args: expect.stringMatching(/^[0-9a-f]{16}$/) } });

    for (let i = 1; i <= 30; i++) expect((await out(legacyCall(a.token, 'job_create', runArgs(a.userId)))).structuredContent).toMatchObject({ dryRun: true });
    expect(hits.get(`req:${a.id}`)!.length).toBe(31);
    expect(await toolRows(a.id)).toBe(31);
    const refused = await out(legacyCall(a.token, 'job_create', runArgs(a.userId)));
    expect(refused.isError).toBe(true);
    expect(refused.structuredContent).toMatchObject({ error: 'rate_limited', status: 429 });
    expect(hits.get(`req:${a.id}`)!.length).toBe(32);
    expect(await toolRows(a.id)).toBe(32);
  });

  test('x-* headers naming another token or session change nothing: the session comes only from the Bearer, through AsyncLocalStorage', async () => {
    const a = await agent();
    const b = await agent();
    const otherDry = await out(legacyCall(b.token, 'job_create', runArgs(b.userId)));
    const spoof = {
      'x-cvs-confirm': otherDry.structuredContent!.confirmToken as string,
      'x-cvs-workspace': 'ws_other',
      'x-agent-token': b.token,
      'x-cvs-session': `agent:${b.id}`,
      'x-user-id': b.userId,
    };
    expect((await out(legacyCall(a.token, 'whoami', {}, spoof))).structuredContent).toMatchObject({ user: { email: a.email }, connection: { id: a.id } });
    const jobs = await count('jobs');
    expect((await out(legacyCall(a.token, 'job_create', runArgs(a.userId), spoof))).structuredContent).toMatchObject({ dryRun: true });
    expect(await count('jobs')).toBe(jobs);
  });

  test('jobs_list pages 20 jobs in at most 16 KB, newest first, and its cursor reaches the rest', async () => {
    const a = await agent();
    for (let i = 0; i < 25; i++)
      await pool.query(
        `insert into jobs (id, user_id, team_id, model, provider, prompt, aspect, duration_s, input_asset_ids, status, workspace_id, created_at)
           values ($1, $2, 'team-unassigned', 'fal-mcp', 'fal', $3, '9:16', 5, '{}', 'succeeded', 'ws_vet', now() - $4 * interval '1 minute')`,
        [`job-${a.userId}-${String(i).padStart(2, '0')}`, a.userId, 'p'.repeat(500), i],
      );
    const res = await legacyCall(a.token, 'jobs_list');
    const first = res.rpc.result!;
    expect(Buffer.byteLength(JSON.stringify(res.rpc))).toBeLessThanOrEqual(16 * 1024);
    const page = first.structuredContent as { jobs: { id: string; url: string }[]; nextCursor: string };
    expect(page.jobs).toHaveLength(20);
    expect(page.jobs[0]).toMatchObject({ id: `job-${a.userId}-00`, url: `http://localhost/library?item=job-${a.userId}-00` });
    const rest = (await out(legacyCall(a.token, 'jobs_list', { cursor: page.nextCursor }))).structuredContent as { jobs: { id: string }[] };
    expect(rest.jobs.map((j) => j.id)).toEqual([20, 21, 22, 23, 24].map((i) => `job-${a.userId}-${i}`));
  });
});
