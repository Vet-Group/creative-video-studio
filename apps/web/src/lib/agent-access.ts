// Agent access ("Kết nối AI"): a personal access token (or, later, an OAuth connection) acts as its creator in one workspace. `guard()` is the only place an
// agent identity is accepted (lib/session.ts): pages and currentUser never read it. Every agent write needs a single-use confirm token bound to the exact
// request; a paid create also checks the connection's monthly USD cap under the connection's lock, in the transaction that spends.
import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { audit } from '@cvs/core/audit';
import { type Queryable, withTransaction } from '@cvs/core/ledger';
import { tokenMonthSpend } from '@cvs/core/limits';
import { pool } from './auth';
import { guard, impersonationRefusal, isImpersonated, type RequestSession, resolveWorkspace, sameOrigin } from './session';

export type AgentInfo = { tokenId: string; kind: 'pat' | 'oauth'; clientId: string | null; via: 'bearer' | 'mcp' };

/** The agent session of an in-process MCP tool call (set only by /api/mcp): guard() takes it from here, never from a header. */
export const agentContext = new AsyncLocalStorage<RequestSession>();

export const CONFIRM_HEADER = 'x-cvs-confirm';
/** Active (unrevoked, unexpired) connections a user may hold. */
export const MAX_ACTIVE_TOKENS = 10;
export const PAT_DAYS = [7, 30, 90] as const;
const PAT = /^cvs_pat_([A-Za-z0-9]{12})_[A-Za-z0-9_-]{43}$/;
const BEARER = /^Bearer (cvs_(?:pat|oat)_\S*)$/;
const SESSION_COOKIE = /(?:^|;)\s*(?:__Secure-)?better-auth\.session_token=/;
const CONFIRM_TTL_S = 600;
/** The largest body a confirm hashes (the clone is held in memory); JSON admin and run bodies are a few KB. */
const MAX_CONFIRM_BODY = 1_000_000;
const ALNUM = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

const sha256 = (data: string | Uint8Array) => createHash('sha256').update(data).digest();
const units = (usd: string) => Math.round(Number(usd) * 10_000);
const fail = (error: string, status: number) => Response.json({ error }, { status });

/** A new personal access token: `cvs_pat_<12-char public id>_<43-char secret>`; only the sha256 of the whole string is stored. */
export function newPat(): { id: string; token: string; hash: Buffer } {
  const id = Array.from(randomBytes(12), (b) => ALNUM[b % ALNUM.length]).join('');
  const token = `cvs_pat_${id}_${randomBytes(32).toString('base64url')}`;
  return { id, token, hash: sha256(token) };
}

/** Creates a PAT connection for `userId` in `workspaceId`; 'too_many' when the user already holds MAX_ACTIVE_TOKENS active ones. The secret is returned once. */
export async function createPat(i: { userId: string; workspaceId: string; name: string; days: (typeof PAT_DAYS)[number]; capUsd?: string }) {
  return withTransaction(pool, async (tx): Promise<{ id: string; token: string; expiresAt: string } | 'too_many'> => {
    await tx.query(`select pg_advisory_xact_lock(hashtext('agent-create:' || $1))`, [i.userId]);
    const active = (await tx.query(`select count(*)::int as n from api_tokens where user_id = $1 and revoked_at is null and (expires_at is null or expires_at > now())`, [i.userId])).rows[0].n;
    if (active >= MAX_ACTIVE_TOKENS) return 'too_many';
    const { id, token, hash } = newPat();
    const capUsd = i.capUsd ?? '20';
    const expiresAt = (
      await tx.query(
        `insert into api_tokens (id, user_id, workspace_id, kind, name, secret_hash, monthly_cap_usd, expires_at) values ($1, $2, $3, 'pat', $4, $5, $6, now() + $7 * interval '1 day') returning expires_at`,
        [id, i.userId, i.workspaceId, i.name, hash, capUsd, i.days],
      )
    ).rows[0].expires_at.toISOString();
    await audit(tx, { actorId: i.userId, action: 'agent.token_create', target: `api_token:${id}`, newValue: { kind: 'pat', name: i.name, workspaceId: i.workspaceId, expiresAt, capUsd } });
    return { id, token, expiresAt };
  });
}

/** How recent the sign-in must be to mint a token (POST /api/agent-access/tokens): a stolen long-lived cookie alone cannot. */
export const TOKEN_CREATE_FRESH_MS = 10 * 60 * 1000;

/**
 * The gate of the Settings "Kết nối AI" routes: an Admin's own cookie session (an agent is refused by the deny set below), not one opened with
 * "sign in as", and for a write a request this app's page sent (sameOrigin).
 */
export async function tokenAdmin(request: Request) {
  const g = await guard(request, 'admin');
  if (g.error) return g;
  if (isImpersonated(g.session)) return { error: impersonationRefusal() };
  if (request.method !== 'GET' && !sameOrigin(request)) return { error: fail('forbidden origin', 403) };
  return g;
}

// The identity set an agent never touches (users, credentials, sessions, impersonation, tokens), every method; and the writes that change a name or email or create accounts.
const DENY_ALL = ['/api/admin/users', '/api/auth', '/api/me/stop-impersonating', '/api/me/sessions', '/api/agent-access', '/api/oauth'];
const DENY_WRITES = ['/api/me/profile', '/api/admin/workspaces'];
const under = (path: string, root: string) => path === root || path.startsWith(`${root}/`);

/** True when an agent may not send `method` to `rawPath`. The path is decoded and repeated slashes collapsed first, so `%2F` or `//` cannot slip past. */
export function agentDenied(method: string, rawPath: string): boolean {
  let path: string;
  try {
    path = decodeURIComponent(rawPath).replace(/\/{2,}/g, '/');
  } catch {
    return true;
  }
  if (DENY_ALL.some((root) => under(path, root))) return true;
  const write = method !== 'GET' && method !== 'HEAD';
  return write && (DENY_WRITES.some((root) => under(path, root)) || /^\/api\/workspaces\/[^/]+\/members(\/|$)/.test(path));
}

/** The agent writes guard() lets through without its own confirm, by exact method and route (`[id]` is one path segment). `paid` routes confirm
 * themselves (agentPrecheck + agentCharge); `delegates` builds a paid request to /api/jobs, which does. */
export const CONFIRM_EXEMPT = [
  { method: 'POST', route: '/api/assets', reason: 'upload' },
  { method: 'POST', route: '/api/assets/presign-video', reason: 'upload' },
  { method: 'POST', route: '/api/assets/finalize-video', reason: 'upload' },
  { method: 'POST', route: '/api/jobs/[id]/cancel', reason: 'cancel' },
  { method: 'POST', route: '/api/library/zip', reason: 'read' },
  { method: 'POST', route: '/api/library/lookbook', reason: 'read' },
  { method: 'POST', route: '/api/jobs', reason: 'paid' },
  { method: 'POST', route: '/api/remakes', reason: 'paid' },
  { method: 'POST', route: '/api/analyses', reason: 'paid' },
  { method: 'POST', route: '/api/suggestions', reason: 'paid' },
  { method: 'POST', route: '/api/custom-apps/[id]/run', reason: 'delegates' },
] as const;
const EXEMPT = CONFIRM_EXEMPT.map((e) => ({ method: e.method, pattern: new RegExp(`^${e.route.replace(/\[[^\]]+\]/g, '[^/]+')}$`) }));
export const confirmExempt = (method: string, path: string) => EXEMPT.some((e) => e.method === method && e.pattern.test(path));

/** JSON with object keys sorted at every level, so two sends of one body hash the same. */
export function canonicalJSON(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((v) => canonicalJSON(v ?? null)).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJSON(v)}`).join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

/** The hash a confirm binds: of the canonical JSON when the bytes are JSON, else of the raw bytes (empty for no body). */
export function bodyHash(bytes: Uint8Array): string {
  if (bytes.length > 0) {
    try {
      return sha256(canonicalJSON(JSON.parse(Buffer.from(bytes).toString('utf8')))).toString('hex');
    } catch {
      // not JSON: the raw bytes
    }
  }
  return sha256(bytes).toString('hex');
}

const confirmKey = () => createHmac('sha256', process.env.BETTER_AUTH_SECRET ?? '').update('cvs-agent-confirm').digest();
type Bound = { tokenId: string; method: string; path: string; hash: string };
const macOf = (b: Bound, estimate: string, nonce: string, exp: string) =>
  createHmac('sha256', confirmKey()).update([b.tokenId, b.method, b.path, b.hash, estimate, nonce, exp].join('|')).digest();

/** A confirm token `<nonce>.<exp>.<estimate>.<mac>` for this exact request; `estimate` is '-' for a write with no upfront price. */
export function signConfirm(b: Bound, estimate: string, now = Date.now()): { confirmToken: string; expiresAt: string } {
  const nonce = randomBytes(16).toString('base64url');
  const exp = String(Math.floor(now / 1000) + CONFIRM_TTL_S);
  return { confirmToken: `${nonce}.${exp}.${estimate}.${macOf(b, estimate, nonce, exp).toString('base64url')}`, expiresAt: new Date(Number(exp) * 1000).toISOString() };
}

/** The nonce and estimate of a confirm token for this exact request, or why it is refused. The estimate holds a '.', so the parts are taken from both ends. */
export function readConfirm(token: string, b: Bound): { nonce: string; estimate: string } | 'confirm_invalid' | 'confirm_expired' {
  const parts = token.split('.');
  if (parts.length < 4) return 'confirm_invalid';
  const [nonce = '', exp = ''] = parts;
  const mac = Buffer.from(parts.at(-1)!, 'base64url');
  const estimate = parts.slice(2, -1).join('.');
  if (!/^[A-Za-z0-9_-]{22}$/.test(nonce) || !/^\d{1,12}$/.test(exp) || !/^(-|\d+\.\d{4})$/.test(estimate)) return 'confirm_invalid';
  const want = macOf(b, estimate, nonce, exp);
  if (mac.length !== want.length || !timingSafeEqual(mac, want)) return 'confirm_invalid';
  return Number(exp) * 1000 < Date.now() ? 'confirm_expired' : { nonce, estimate };
}

// shortcut: in memory, for the single cvs-web process; move to Postgres if the web runs 2+ processes.
/** The hits of the last minute per key (exported for tests). Only keys with a hit are kept. */
export const hits = new Map<string, number[]>();
/** Past this many keys a key not yet tracked waits: forgetting a tracked key would reset its limit, so a flood of new IPs cannot wash one out. */
export const MAX_RATE_KEYS = 50_000;
let swept = 0;
/** Seconds to wait when `key` already had `max` hits in the last minute (or is new while MAX_RATE_KEYS are tracked), else 0 (and, with `count`, records this one). */
export function limited(key: string, max: number, count = true): number {
  const now = Date.now();
  // Swept at most every 5 s, so a flood of new keys costs one pass per 5 s, not one per request.
  if (now - swept >= 5_000) {
    swept = now;
    for (const [k, v] of hits) if (!(v.at(-1)! > now - 60_000)) hits.delete(k);
  }
  const known = hits.get(key);
  if (!known && hits.size >= MAX_RATE_KEYS) return 60;
  const recent = (known ?? []).filter((t) => t > now - 60_000);
  if (recent.length >= max) {
    hits.set(key, recent);
    return Math.max(1, Math.ceil((recent[0]! + 60_000 - now) / 1000));
  }
  if (count) recent.push(now);
  if (recent.length) hits.set(key, recent);
  else hits.delete(key);
  return 0;
}
/** The failed-sign-in key of a client IP: an IPv6 address by its /64 (one subscriber holds the whole /64), any other value as is. */
export function ipKey(ip: string): string {
  if (!ip.includes(':') || /^::ffff:\d+\.\d+\.\d+\.\d+$/i.test(ip)) return ip.replace(/^::ffff:/i, '');
  const [head = '', tail] = ip.split('%')[0]!.split('::');
  const left = head ? head.split(':') : [];
  const right = tail ? tail.split(':') : [];
  const groups = tail === undefined ? left : [...left, ...Array<string>(Math.max(0, 8 - left.length - right.length)).fill('0'), ...right];
  return `${groups.slice(0, 4).map((g) => parseInt(g, 16).toString(16)).join(':')}::/64`;
}
const tooMany = (seconds: number) => Response.json({ error: 'rate_limited' }, { status: 429, headers: { 'X-Retry-After': String(seconds) } });

type Resolved = { session: RequestSession; error?: never } | { error: Response; session?: never } | null;

/**
 * The agent session of a request, an error, or null (not an agent request: the cookie session applies). An MCP tool call's session comes from agentContext
 * and only when the request carries no cookie and no Authorization header. A `Bearer cvs_pat_` token is refused (401) when unknown, revoked, expired, its
 * owner banned, holding a temporary password, not an Admin (unless CVS_AGENT_API_MEMBERS=1: a demotion pauses the token, a re-promotion restores it), or no
 * longer an active member of the token's (enabled) workspace. The token's workspace is used, never the cvs_ws cookie.
 */
export async function agentSession(request: Request): Promise<Resolved> {
  const authorization = request.headers.get('authorization');
  const store = agentContext.getStore();
  if (store) return request.headers.has('cookie') || authorization !== null ? { error: fail('ambiguous_credentials', 400) } : { session: store };
  const token = authorization?.match(BEARER)?.[1];
  if (!token) return null;
  if (process.env.CVS_AGENT_API === '0') return { error: fail('agent_api_off', 401) };
  // No CORS headers are sent, so a page of another origin cannot add Authorization; a request with both credentials is refused outright.
  if (SESSION_COOKIE.test(request.headers.get('cookie') ?? '')) return { error: fail('ambiguous_credentials', 400) };
  const ip = request.headers.get('cf-connecting-ip') ?? 'unknown';
  const failKey = `fail:${ipKey(ip)}`;
  const waitIp = limited(failKey, 20, false);
  if (waitIp) return { error: tooMany(waitIp) };
  const found = await lookup(token);
  if (typeof found === 'string') {
    limited(failKey, 20);
    console.warn(`agent.auth_fail ${JSON.stringify({ reason: found, ip })}`);
    return { error: fail('unauthenticated', 401) };
  }
  const wait = limited(`req:${found.agent.tokenId}`, 120);
  if (wait) return { error: tooMany(wait) };
  await pool.query(`update api_tokens set last_used_at = now(), last_used_ip = $2 where id = $1 and (last_used_at is null or last_used_at < now() - interval '1 minute')`, [
    found.agent.tokenId,
    ip,
  ]);
  return { session: { ...found, session: { ...found.session, ipAddress: ip, userAgent: request.headers.get('user-agent') } } };
}

async function lookup(token: string): Promise<(RequestSession & { agent: AgentInfo }) | string> {
  const m = PAT.exec(token);
  if (!m) return 'unknown'; // cvs_oat_ access tokens come with OAuth (migration 0128)
  const r = (
    await pool.query(
      `select t.id as token_id, t.kind, t.workspace_id, t.created_at as token_created_at, t.expires_at, t.revoked_at is not null as revoked,
              coalesce(t.expires_at <= now(), false) as expired, u.banned and (u.ban_expires is null or u.ban_expires > now()) as banned,
              u.id, u.email, u.name, u.role, u.email_verified, u.image, u.created_at, u.updated_at, u.team_id, u.must_change_password, u.can_edit_templates,
              u.system, u.outside_lark, u.can_impersonate, u.two_factor_enabled
         from api_tokens t join users u on u.id = t.user_id where t.secret_hash = $1 and t.id = $2`,
      [sha256(token), m[1]],
    )
  ).rows[0];
  if (!r) return 'unknown';
  if (r.revoked) return 'revoked';
  if (r.expired) return 'expired';
  if (r.banned) return 'banned';
  if (r.must_change_password) return 'password_change_required';
  if (r.role !== 'admin' && process.env.CVS_AGENT_API_MEMBERS !== '1') return 'not_admin';
  const workspace = await resolveWorkspace(r.id, r.workspace_id);
  if (workspace?.workspaceId !== r.workspace_id) return 'workspace';
  return {
    user: {
      id: r.id, email: r.email, name: r.name, role: r.role, banned: false, banReason: null, banExpires: null, emailVerified: r.email_verified, image: r.image,
      createdAt: r.created_at, updatedAt: r.updated_at, teamId: r.team_id, mustChangePassword: false, canEditTemplates: r.can_edit_templates, system: r.system,
      outsideLark: r.outside_lark, canImpersonate: r.can_impersonate, twoFactorEnabled: r.two_factor_enabled,
    },
    session: {
      id: `agent:${r.token_id}`, userId: r.id, token: '', createdAt: r.token_created_at, updatedAt: r.token_created_at,
      expiresAt: r.expires_at ?? new Date(Date.now() + 3_600_000), ipAddress: null, userAgent: null, impersonatedBy: null,
    },
    workspace,
    agent: { tokenId: r.token_id, kind: r.kind, clientId: null, via: 'bearer' },
  };
}

/** The body bytes of a request, read from a clone (the handler reads the original); null past MAX_CONFIRM_BODY. */
async function bodyBytes(request: Request): Promise<Uint8Array | null> {
  if (!request.body) return new Uint8Array(0);
  const reader = request.clone().body!.getReader();
  const chunks: Uint8Array[] = [];
  let seen = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return Buffer.concat(chunks);
    seen += value.length;
    if (seen > MAX_CONFIRM_BODY) {
      // Not awaited: a cloned branch's cancel settles only once the original is canceled too.
      reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
}

/** What a 428 shows a human of the write: the top-level fields with short values. */
function summaryOf(bytes: Uint8Array): Record<string, unknown> {
  let body: unknown;
  try {
    body = bytes.length ? JSON.parse(Buffer.from(bytes).toString('utf8')) : {};
  } catch {
    return { bytes: bytes.length };
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { body: typeof body === 'string' ? body.slice(0, 80) : Array.isArray(body) ? `[${body.length} items]` : body };
  return Object.fromEntries(
    Object.entries(body).slice(0, 20).map(([k, v]) => [k, typeof v === 'string' ? v.slice(0, 80) : Array.isArray(v) ? `[${v.length} items]` : v && typeof v === 'object' ? '{...}' : v]),
  );
}

/**
 * The agent-only rules guard() applies once the session, its workspace and its role passed: an audit row for every Admin read; for a write that is not
 * CONFIRM_EXEMPT, a 428 with a confirm token bound to the method, path and body, then (resent with it) the nonce spent once; and an audit row for every
 * write that goes on to its handler. Null lets the request through.
 */
export async function agentGate(request: Request, session: RequestSession, workspaceId: string): Promise<Response | null> {
  const agent = session.agent!;
  const url = new URL(request.url);
  const { method } = request;
  const target = `api_token:${agent.tokenId}`;
  if (method === 'GET' || method === 'HEAD') {
    if (url.pathname.startsWith('/api/admin/')) await audit(pool, { actorId: session.user.id, action: 'agent.read', target, newValue: { method, path: url.pathname, workspaceId, via: agent.via } });
    return null;
  }
  let nonce: string | null = request.headers.get(CONFIRM_HEADER)?.split('.')[0] ?? null; // a paid route checks its own confirm
  if (!confirmExempt(method, url.pathname)) {
    // The boundary changes on every send, so a multipart body could never match its confirm.
    if (/^multipart\/form-data/i.test(request.headers.get('content-type') ?? '')) return fail('multipart_not_confirmable', 415);
    const length = request.headers.get('content-length');
    if (Number(length) > MAX_CONFIRM_BODY || (length === null && request.headers.has('transfer-encoding'))) return fail('body_too_large_for_confirm', 413);
    const bytes = await bodyBytes(request);
    if (!bytes) return fail('body_too_large_for_confirm', 413);
    const bound = { tokenId: agent.tokenId, method, path: url.pathname + url.search, hash: bodyHash(bytes) };
    const header = request.headers.get(CONFIRM_HEADER);
    if (header === null) {
      const wait = limited(`dry:${agent.tokenId}`, 30);
      if (wait) return tooMany(wait);
      return Response.json({ error: 'confirm_required', method, path: bound.path, summary: summaryOf(bytes), ...signConfirm(bound, '-') }, { status: 428 });
    }
    const confirm = readConfirm(header, bound);
    if (typeof confirm === 'string') return fail(confirm, 409);
    // Spent before the handler runs: a retry after a timeout gets confirm_used and must read the current state first.
    const spent = await pool.query(`insert into agent_confirms (nonce, api_token_id, method, path) values ($1, $2, $3, $4) on conflict do nothing`, [confirm.nonce, agent.tokenId, method, bound.path]);
    if (!spent.rowCount) return fail('confirm_used', 409);
    nonce = confirm.nonce;
  }
  await audit(pool, { actorId: session.user.id, action: 'agent.request', target, newValue: { method, path: url.pathname, workspaceId, via: agent.via, nonce: nonce && /^[A-Za-z0-9_-]{22}$/.test(nonce) ? nonce : null } });
  return null;
}

/** A paid create's call as agentPrecheck read it: the request it binds, and the confirm it carried (null on a dry run). */
export type AgentCall = Bound & { confirm: { nonce: string; estimate: string } | null };

/** The stored first answer of a spent nonce, or 409 confirm_used for one a guard confirm spent; null when the nonce is new. */
async function replay(q: Queryable, nonce: string): Promise<Response | null> {
  const row = (await q.query('select result_status, result_body from agent_confirms where nonce = $1', [nonce])).rows[0];
  if (!row) return null;
  return row.result_status === null ? fail('confirm_used', 409) : Response.json(row.result_body, { status: row.result_status });
}

/**
 * The first step of a paid create (POST /api/jobs, /api/remakes, /api/analyses, /api/suggestions), before any estimate or cap work: null for a cookie
 * session; a 409 for a confirm token that does not match this request or has expired; the stored first answer when its nonce was already spent (no new
 * work, even past the cap); else the call to hand to agentCharge.
 */
export async function agentPrecheck(g: { session: RequestSession }, request: Request, body: unknown): Promise<AgentCall | Response | null> {
  const agent = g.session.agent;
  if (!agent) return null;
  const url = new URL(request.url);
  const bound = { tokenId: agent.tokenId, method: request.method, path: url.pathname + url.search, hash: sha256(canonicalJSON(body)).toString('hex') };
  const header = request.headers.get(CONFIRM_HEADER);
  if (header === null) return { ...bound, confirm: null };
  const confirm = readConfirm(header, bound);
  if (typeof confirm === 'string') return fail(confirm, 409);
  return (await replay(pool, confirm.nonce)) ?? { ...bound, confirm };
}

/**
 * The last step of a paid create before its insert, in the route's transaction and after the route's own lock (so the lock order is the same everywhere):
 * takes the connection's lock, refuses past its monthly cap (429 token_monthly_usd: spend + estimate over the cap, or spend at the cap for an LLM route
 * with no upfront price), answers a dry run with 428 and a confirm token for this estimate (nothing is written), refuses a confirm for another price
 * (409 confirm_stale with a fresh token), and else spends the nonce with `result`, the answer the route gives, to replay to a resend. Null goes on.
 */
export async function agentCharge(tx: Queryable, call: AgentCall | null, estimate: string | number | null, result: { status: number; body: unknown }): Promise<Response | null> {
  if (!call) return null;
  await tx.query(`select pg_advisory_xact_lock(hashtext('agent:' || $1))`, [call.tokenId]);
  // A concurrent send of the same confirm waited on the lock above: it answers the winner's result.
  const done = call.confirm && (await replay(tx, call.confirm.nonce));
  if (done) return done;
  const price = estimate === null ? '-' : Number(estimate).toFixed(4);
  const capUsd: string = (await tx.query('select monthly_cap_usd::text as cap from api_tokens where id = $1', [call.tokenId])).rows[0].cap;
  const usedUsd = await tokenMonthSpend(tx, call.tokenId);
  const tokenMonth = { usedUsd, capUsd };
  if (price === '-' ? units(usedUsd) >= units(capUsd) : units(usedUsd) + units(price) > units(capUsd)) {
    console.warn(`agent.cap_refused ${JSON.stringify({ tokenId: call.tokenId, usedUsd, capUsd })}`);
    return Response.json({ error: 'token_monthly_usd', tokenMonth }, { status: 429 });
  }
  const fresh = (error: string) => ({ error, estimateUsd: price === '-' ? null : price, ...signConfirm(call, price), tokenMonth });
  if (!call.confirm) {
    const wait = limited(`dry:${call.tokenId}`, 30);
    return wait ? tooMany(wait) : Response.json(fresh('confirm_required'), { status: 428 });
  }
  if (call.confirm.estimate !== price) return Response.json(fresh('confirm_stale'), { status: 409 });
  const wait = limited(`paid:${call.tokenId}`, 10);
  if (wait) return tooMany(wait);
  await tx.query('insert into agent_confirms (nonce, api_token_id, method, path, result_status, result_body) values ($1, $2, $3, $4, $5, $6::jsonb)', [
    call.confirm.nonce,
    call.tokenId,
    call.method,
    call.path,
    result.status,
    JSON.stringify(result.body),
  ]);
  return null;
}
