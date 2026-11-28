// The OAuth 2.1 server of the MCP endpoint (docs/AGENT-ACCESS.md "OAuth"), so Claude Code and OpenMausBot connect with a sign-in instead of a pasted
// token. Public clients register themselves (RFC 7591) with loopback redirects only, an Admin approves one on /oauth/authorize, and the code (PKCE S256)
// becomes a one-hour access token (`cvs_oat_`) and a 30-day refresh token (`cvs_ort_`) rotated on every use. An approved client is an ordinary
// api_tokens connection (kind 'oauth'), so guard(), the deny set, the monthly cap, the audit trail and Disconnect in Settings apply unchanged.
import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes, timingSafeEqual } from 'node:crypto';
import { audit } from '@cvs/core/audit';
import { type Queryable, withTransaction } from '@cvs/core/ledger';
import { connectionSession, ipKey, limited, MAX_ACTIVE_TOKENS, newTokenId } from './agent-access';
import { pool } from './auth';

export const MCP_PATH = '/api/mcp';
const CODE_TTL_S = 5 * 60;
export const ACCESS_TTL_S = 3600;
/** A refresh token expires this long after it was issued: an idle connection ends, a used one rotates on (owner decision: no expiry while refreshed). */
const REFRESH_TTL_S = 30 * 24 * 3600;
/** A retry of the refresh just made, by the same client, gets the same pair within this time; a later use is a stolen copy. */
export const REFRESH_GRACE_MS = 30_000;
/** Clients no Admin approved yet: past this many the oldest is deleted to make room, so a flood of registrations cannot lock real clients out. */
export const MAX_PENDING_CLIENTS = 200;
export const REGISTRATIONS_PER_HOUR = 10;
const CLIENT_NAME_MAX = 80;
const CLIENT_ID = /^cvsc_[A-Za-z0-9_-]{24}$/;
const PKCE_CHALLENGE = /^[A-Za-z0-9_-]{43}$/;
const PKCE_VERIFIER = /^[A-Za-z0-9._~-]{43,128}$/;
const SECRET = (prefix: string) => new RegExp(`^${prefix}[A-Za-z0-9_-]{43}$`);
// eslint-disable-next-line no-control-regex -- control characters are what this removes from a client's self-declared name
const CONTROL = /[\u0000-\u001f\u007f]/g;

type ErrorCode = 'invalid_request' | 'invalid_client' | 'invalid_grant' | 'unsupported_grant_type' | 'invalid_target' | 'invalid_redirect_uri' | 'invalid_client_metadata';

/** A refusal the endpoints answer as `{ error, error_description }` (RFC 6749 §5.2, RFC 7591 §3.2.2). */
export class OAuthError extends Error {
  constructor(
    readonly error: ErrorCode,
    readonly description: string,
    readonly status = error === 'invalid_client' ? 401 : 400,
  ) {
    super(description);
  }
}

const sha256 = (value: string) => createHash('sha256').update(value).digest();
const secret = (prefix: string) => `${prefix}${randomBytes(32).toString('base64url')}`;

/** The public origin: APP_URL, never the Host header (a forged Host would name another issuer). */
export const publicOrigin = () => new URL(process.env.APP_URL!).origin;
/** The RFC 9728 document of /api/mcp, at the path-suffixed well-known URL the MCP spec tries first. */
export const resourceMetadataUrl = () => `${publicOrigin()}/.well-known/oauth-protected-resource${MCP_PATH}`;

/** RFC 9728 Protected Resource Metadata. */
export const protectedResourceMetadata = () => ({
  resource: `${publicOrigin()}${MCP_PATH}`,
  authorization_servers: [publicOrigin()],
  bearer_methods_supported: ['header'],
  resource_name: 'Creative Video Studio',
});

/** RFC 8414 Authorization Server Metadata: public clients, PKCE S256 only, and `iss` on every authorization response (RFC 9207). */
export function authorizationServerMetadata() {
  const origin = publicOrigin();
  return {
    issuer: origin,
    authorization_endpoint: `${origin}/oauth/authorize`,
    token_endpoint: `${origin}/api/oauth/token`,
    registration_endpoint: `${origin}/api/oauth/register`,
    revocation_endpoint: `${origin}/api/oauth/revoke`,
    response_types_supported: ['code'],
    response_modes_supported: ['query'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
    revocation_endpoint_auth_methods_supported: ['none'],
    authorization_response_iss_parameter_supported: true,
  };
}

const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]']);

/**
 * An `http://` redirect on a loopback host (a desktop client's local callback, RFC 8252 §7.3) with no query, fragment or userinfo, else null. A query is
 * refused so a registered callback can never carry a parameter of its own (a forwarding `next=`) that the consent page does not show.
 */
export function loopbackRedirect(value: unknown): URL | null {
  if (typeof value !== 'string' || value.length > 512 || value.includes('#') || value.includes('?')) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' && LOOPBACK.has(url.hostname) && !url.username && !url.password ? url : null;
  } catch {
    return null;
  }
}

/** True when `given` is one of the `registered` redirects but for its port: a loopback client picks a free port each time (RFC 8252 §7.3). */
export function redirectMatches(registered: readonly string[], given: string): boolean {
  const g = loopbackRedirect(given);
  return (
    g !== null &&
    registered.some((r) => {
      const u = loopbackRedirect(r);
      return u !== null && u.hostname === g.hostname && u.pathname === g.pathname;
    })
  );
}

/** The client registrations of the last hour per address (exported for tests). */
export const registrations = new Map<string, number[]>();

/** Seconds until `ip` may register again (REGISTRATIONS_PER_HOUR per hour), else 0 and the registration is counted. */
function registerWait(ip: string): number {
  const now = Date.now();
  const key = ipKey(ip);
  if (registrations.size >= 10_000) for (const [k, v] of registrations) if (!(v.at(-1)! > now - 3_600_000)) registrations.delete(k);
  const recent = (registrations.get(key) ?? []).filter((t) => t > now - 3_600_000);
  if (recent.length >= REGISTRATIONS_PER_HOUR || (!registrations.has(key) && registrations.size >= 10_000)) return Math.max(1, Math.ceil(((recent[0] ?? now) + 3_600_000 - now) / 1000));
  registrations.set(key, [...recent, now]);
  return 0;
}

const offers = (list: unknown, wanted: string) => list === undefined || (Array.isArray(list) && list.includes(wanted));

/**
 * Dynamic client registration (RFC 7591). Every client is public (PKCE does the proving), whatever it asked for, and the answer says so. 1 to 3 loopback
 * `http://` redirect URIs; https and other hosts are refused in this version. Clients never approved for a day are deleted, and at MAX_PENDING_CLIENTS
 * waiting the oldest is evicted.
 */
export async function registerClient(body: unknown, ip: string) {
  const input = (body && typeof body === 'object' && !Array.isArray(body) ? body : {}) as Record<string, unknown>;
  const uris = input.redirect_uris;
  if (!Array.isArray(uris) || uris.length < 1 || uris.length > 3) throw new OAuthError('invalid_redirect_uri', 'Send 1 to 3 redirect_uris.');
  if (!uris.every((u) => loopbackRedirect(u))) throw new OAuthError('invalid_redirect_uri', 'A redirect URI must be http on 127.0.0.1, localhost or [::1], without a query or fragment.');
  if (!offers(input.grant_types, 'authorization_code') || !offers(input.response_types, 'code')) {
    throw new OAuthError('invalid_client_metadata', 'Only the authorization_code grant (with refresh_token) and response_type code are offered.');
  }
  const name = (typeof input.client_name === 'string' ? input.client_name.replace(CONTROL, '').trim().replace(/\s+/g, ' ') : '').slice(0, CLIENT_NAME_MAX) || 'Ứng dụng MCP';
  const redirectUris = [...new Set(uris as string[])];
  const wait = registerWait(ip);
  if (wait) return { wait };
  const id = `cvsc_${randomBytes(18).toString('base64url')}`;
  const createdAt = await withTransaction(pool, async (tx) => {
    await tx.query(`select pg_advisory_xact_lock(hashtext('oauth-register'))`);
    await prune(tx);
    await tx.query(
      `delete from oauth_clients where id in (select id from oauth_clients where first_consent_at is null order by created_at, id
         limit greatest(0, (select count(*) from oauth_clients where first_consent_at is null) - $1 + 1))`,
      [MAX_PENDING_CLIENTS],
    );
    return (await tx.query(`insert into oauth_clients (id, name, redirect_uris, registered_ip) values ($1, $2, $3, $4) returning created_at`, [id, name, redirectUris, ip])).rows[0]
      .created_at as Date;
  });
  return {
    client: {
      client_id: id,
      client_id_issued_at: Math.floor(createdAt.getTime() / 1000),
      client_name: name,
      redirect_uris: redirectUris,
      token_endpoint_auth_method: 'none',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
    },
  };
}

/** Deletes clients nobody approved within a day, and codes, access tokens and refresh tokens a day past their expiry. */
async function prune(tx: Queryable) {
  await tx.query(`delete from oauth_clients where first_consent_at is null and created_at < now() - interval '1 day'`);
  for (const table of ['oauth_codes', 'oauth_access_tokens', 'oauth_refresh_tokens']) await tx.query(`delete from ${table} where expires_at < now() - interval '1 day'`);
}

export type OAuthClient = { id: string; name: string; redirectUris: string[]; registeredIp: string | null };

async function findClient(q: Queryable, clientId: unknown): Promise<OAuthClient | null> {
  if (typeof clientId !== 'string' || !CLIENT_ID.test(clientId)) return null;
  const r = (await q.query('select id, name, redirect_uris, registered_ip from oauth_clients where id = $1', [clientId])).rows[0];
  return r ? { id: r.id, name: r.name, redirectUris: r.redirect_uris, registeredIp: r.registered_ip } : null;
}

/** What /oauth/authorize was asked, checked. */
export type AuthorizeRequest = { clientId: string; redirectUri: string; state: string; codeChallenge: string; resource: string | null };
export type AuthorizeCheck =
  /** No such client or a redirect it did not register: an error page, never a redirect (RFC 6749 §4.1.2.1). */
  | { kind: 'fatal'; reason: 'client' | 'redirect_uri' }
  /** A bad request from a known client at a registered redirect: the error goes back there. */
  | { kind: 'error'; redirectUri: string; state: string | null; error: 'invalid_request' | 'unsupported_response_type' | 'invalid_target'; description: string }
  | { kind: 'ok'; client: OAuthClient; request: AuthorizeRequest };

/** A resource URI as RFC 3986 compares it (scheme and host case-insensitive, a trailing slash aside), or null with a query, fragment or userinfo. */
function resourceKey(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.search || url.hash || value.includes('?') || url.username || url.password) return null;
    return `${url.origin}${url.pathname.replace(/\/+$/, '')}`;
  } catch {
    return null;
  }
}
/** This server's own name for the RFC 8707 resource a client sent (the MCP endpoint or the origin), or null for anything else. */
function knownResource(value: unknown): string | null {
  const key = typeof value === 'string' ? resourceKey(value) : null;
  return key === null ? null : ([`${publicOrigin()}${MCP_PATH}`, publicOrigin()].find((r) => resourceKey(r) === key) ?? null);
}

/** Checks the authorize query: a known client, a redirect it registered (port aside), response_type=code, PKCE S256, a state, and a resource naming this server if sent. */
export async function checkAuthorize(params: Record<string, string | undefined>): Promise<AuthorizeCheck> {
  const client = await findClient(pool, params.client_id);
  if (!client) return { kind: 'fatal', reason: 'client' };
  const redirectUri = params.redirect_uri ?? (client.redirectUris.length === 1 ? client.redirectUris[0] : undefined);
  if (!redirectUri || !redirectMatches(client.redirectUris, redirectUri)) return { kind: 'fatal', reason: 'redirect_uri' };
  const state = params.state && params.state.length <= 1024 ? params.state : null;
  const refuse = (error: 'invalid_request' | 'unsupported_response_type' | 'invalid_target', description: string): AuthorizeCheck => ({ kind: 'error', redirectUri, state, error, description });
  if (params.response_type !== 'code') return refuse('unsupported_response_type', 'Only response_type=code is supported.');
  if (!state) return refuse('invalid_request', 'state is required.');
  if (params.code_challenge_method !== 'S256' || !PKCE_CHALLENGE.test(params.code_challenge ?? '')) return refuse('invalid_request', 'PKCE with code_challenge_method=S256 is required.');
  let resource: string | null = null;
  if (params.resource !== undefined) {
    resource = knownResource(params.resource);
    if (!resource) return refuse('invalid_target', "resource must be this server's MCP endpoint.");
  }
  return { kind: 'ok', client, request: { clientId: client.id, redirectUri, state, codeChallenge: params.code_challenge!, resource } };
}

/** The redirect back to the client with `params` and this server as `iss` (RFC 9207). */
export function backTo(redirectUri: string, params: Record<string, string | null>): string {
  const url = new URL(redirectUri);
  for (const [k, v] of Object.entries({ ...params, iss: publicOrigin() })) if (v !== null) url.searchParams.set(k, v);
  return url.toString();
}

/**
 * Allow: a new connection (kind 'oauth', no expiry while refreshed) for `userId` in `workspaceId` under `capUsd`, and a single-use code for it,
 * audited as agent.oauth_consent. 'too_many' when the user already holds MAX_ACTIVE_TOKENS active connections, 'gone' when the client was
 * deleted (pruned or evicted) after the form was checked.
 */
export async function approve(i: { userId: string; workspaceId: string; client: OAuthClient; request: AuthorizeRequest; capUsd: string }): Promise<{ code: string } | 'too_many' | 'gone'> {
  return withTransaction(pool, async (tx) => {
    await tx.query(`select pg_advisory_xact_lock(hashtext('agent-create:' || $1))`, [i.userId]);
    // Connections whose code was never exchanged hold a slot for nothing: they end here.
    await tx.query(
      `update api_tokens t set revoked_at = now(), revoke_reason = 'code_unused' where t.user_id = $1 and t.kind = 'oauth' and t.revoked_at is null and t.created_at < now() - interval '10 minutes'
          and not exists (select 1 from oauth_refresh_tokens r where r.api_token_id = t.id)`,
      [i.userId],
    );
    const active = (await tx.query(`select count(*)::int as n from api_tokens where user_id = $1 and revoked_at is null and (expires_at is null or expires_at > now())`, [i.userId])).rows[0].n;
    if (active >= MAX_ACTIVE_TOKENS) return 'too_many';
    // Locks the client row too, so a prune or an eviction cannot delete it before the connection below refers to it.
    if (!(await tx.query(`update oauth_clients set first_consent_at = coalesce(first_consent_at, now()) where id = $1`, [i.client.id])).rowCount) return 'gone';
    const id = newTokenId();
    await tx.query(`insert into api_tokens (id, user_id, workspace_id, kind, name, oauth_client_id, monthly_cap_usd) values ($1, $2, $3, 'oauth', $4, $5, $6)`, [
      id,
      i.userId,
      i.workspaceId,
      i.client.name.slice(0, 60),
      i.client.id,
      i.capUsd,
    ]);
    const code = secret('cvs_oac_');
    await tx.query(
      `insert into oauth_codes (code_hash, client_id, api_token_id, redirect_uri, code_challenge, resource, expires_at) values ($1, $2, $3, $4, $5, $6, now() + $7 * interval '1 second')`,
      [sha256(code), i.client.id, id, i.request.redirectUri, i.request.codeChallenge, i.request.resource, CODE_TTL_S],
    );
    await audit(tx, {
      actorId: i.userId,
      action: 'agent.oauth_consent',
      target: `api_token:${id}`,
      newValue: { kind: 'oauth', clientId: i.client.id, clientName: i.client.name, redirectHost: new URL(i.request.redirectUri).host, workspaceId: i.workspaceId, capUsd: i.capUsd },
    });
    return { code };
  });
}

export type TokenAnswer = { access_token: string; token_type: 'Bearer'; expires_in: number; refresh_token: string };

/** Mints an access and a refresh token for connection `tokenId` of `clientId`, storing only their hashes. */
async function mint(tx: Queryable, tokenId: string, clientId: string): Promise<{ answer: TokenAnswer; refreshHash: Buffer }> {
  const access = secret('cvs_oat_');
  const refresh = secret('cvs_ort_');
  await tx.query(`insert into oauth_access_tokens (hash, api_token_id, client_id, expires_at) values ($1, $2, $3, now() + $4 * interval '1 second')`, [sha256(access), tokenId, clientId, ACCESS_TTL_S]);
  await tx.query(`insert into oauth_refresh_tokens (hash, api_token_id, client_id, expires_at) values ($1, $2, $3, now() + $4 * interval '1 second')`, [sha256(refresh), tokenId, clientId, REFRESH_TTL_S]);
  return { answer: { access_token: access, token_type: 'Bearer', expires_in: ACCESS_TTL_S, refresh_token: refresh }, refreshHash: sha256(refresh) };
}

/** Ends connection `tokenId` because a code or refresh token came back after its use: someone else holds a copy. */
async function endConnection(tx: Queryable, tokenId: string, reason: 'code_reuse' | 'refresh_reuse') {
  const row = (await tx.query(`update api_tokens set revoked_at = now(), revoke_reason = $2 where id = $1 and revoked_at is null returning user_id`, [tokenId, reason])).rows[0];
  if (!row) return;
  await audit(tx, { actorId: null, action: reason === 'refresh_reuse' ? 'agent.oauth_refresh_reuse' : 'agent.token_revoke', target: `api_token:${tokenId}`, newValue: { reason, ownerId: row.user_id } });
  console.warn(`agent.oauth_reuse ${JSON.stringify({ tokenId, reason })}`);
}

function pkceMatches(verifier: unknown, challenge: string): boolean {
  if (typeof verifier !== 'string' || !PKCE_VERIFIER.test(verifier)) return false;
  const actual = Buffer.from(createHash('sha256').update(verifier, 'ascii').digest('base64url'));
  const expected = Buffer.from(challenge);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

const unknownCode = () => new OAuthError('invalid_grant', 'Unknown or expired code.');

/**
 * `grant_type=authorization_code`: the code is spent by the first attempt, right or wrong, and a second use revokes the connection it was for. Client,
 * redirect URI (exact) and PKCE verifier must match, the resource too if sent, and the owner must still pass guard()'s checks.
 */
export async function exchangeCode(form: Record<string, string>, clientId: string): Promise<TokenAnswer> {
  if (!SECRET('cvs_oac_').test(form.code ?? '')) throw unknownCode();
  const outcome = await withTransaction(pool, async (tx): Promise<TokenAnswer | OAuthError> => {
    const code = (await tx.query(`select *, expires_at <= now() as expired from oauth_codes where code_hash = $1 for update`, [sha256(form.code!)])).rows[0];
    if (!code) return unknownCode();
    if (code.used_at) {
      await endConnection(tx, code.api_token_id, 'code_reuse');
      return new OAuthError('invalid_grant', 'The code was already used.');
    }
    await tx.query(`update oauth_codes set used_at = now() where code_hash = $1`, [code.code_hash]);
    if (code.expired) return unknownCode();
    if (clientId !== code.client_id) return new OAuthError('invalid_grant', 'The code was issued to another client.');
    if (form.redirect_uri !== code.redirect_uri) return new OAuthError('invalid_grant', 'redirect_uri does not match the authorization request.');
    if (!pkceMatches(form.code_verifier, code.code_challenge)) return new OAuthError('invalid_grant', 'The PKCE code_verifier does not match.');
    if (form.resource !== undefined && (knownResource(form.resource) === null || (code.resource && knownResource(form.resource) !== code.resource))) {
      return new OAuthError('invalid_target', 'resource does not match.');
    }
    if (typeof (await connectionSession(code.api_token_id, tx)) === 'string') return new OAuthError('invalid_grant', 'The account can no longer connect this app.');
    return (await mint(tx, code.api_token_id, clientId)).answer;
  });
  if (outcome instanceof OAuthError) throw outcome;
  return outcome;
}

// The key that seals a refresh's answer for its grace retry: derived from the refresh token it replaced, which only the client holds, so the stored blob
// gives nothing to someone who reads the database.
const graceKey = (oldRefresh: string) => Buffer.from(hkdfSync('sha256', oldRefresh, 'cvs:oauth-refresh-grace:v1', '', 32));
function seal(oldRefresh: string, answer: TokenAnswer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', graceKey(oldRefresh), iv);
  const body = Buffer.concat([cipher.update(JSON.stringify(answer), 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64url');
}
function unseal(oldRefresh: string, sealed: string | null): TokenAnswer | null {
  if (!sealed) return null;
  try {
    const raw = Buffer.from(sealed, 'base64url');
    const decipher = createDecipheriv('aes-256-gcm', graceKey(oldRefresh), raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    return JSON.parse(Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8')) as TokenAnswer;
  } catch {
    return null;
  }
}

const unknownRefresh = () => new OAuthError('invalid_grant', 'Unknown refresh token.');

/**
 * `grant_type=refresh_token`: a new access and refresh token, the old refresh token spent. The token's client must be the caller and the connection's
 * client. The owner is re-checked as guard() checks a request; a banned, demoted or removed owner gets invalid_grant and the token is not spent, so it works
 * again after a re-promotion. The token just replaced, sent again by the same client within REFRESH_GRACE_MS, gets the same pair; any later use revokes
 * the connection (agent.oauth_refresh_reuse).
 */
export async function refresh(form: Record<string, string>, clientId: string): Promise<TokenAnswer> {
  const token = form.refresh_token ?? '';
  if (!SECRET('cvs_ort_').test(token)) throw unknownRefresh();
  const outcome = await withTransaction(pool, async (tx): Promise<TokenAnswer | OAuthError> => {
    // A concurrent refresh of the same token waits on this row lock, then finds it used within the grace.
    const row = (
      await tx.query(
        `select r.hash, r.api_token_id, r.client_id, r.used_at, r.grace, r.expires_at <= now() as expired, now() - r.used_at <= $2 * interval '1 millisecond' as in_grace,
                t.oauth_client_id as connection_client, t.revoked_at is not null as revoked
           from oauth_refresh_tokens r join api_tokens t on t.id = r.api_token_id where r.hash = $1 for update of r`,
        [sha256(token), REFRESH_GRACE_MS],
      )
    ).rows[0];
    if (!row || row.revoked) return unknownRefresh();
    if (row.client_id !== clientId || row.connection_client !== clientId) return new OAuthError('invalid_grant', 'The refresh token was issued to another client.');
    if (row.used_at) {
      const again = row.in_grace ? unseal(token, row.grace) : null;
      if (again) return again;
      await endConnection(tx, row.api_token_id, 'refresh_reuse');
      return unknownRefresh();
    }
    if (row.expired) return unknownRefresh();
    if (typeof (await connectionSession(row.api_token_id, tx)) === 'string') return new OAuthError('invalid_grant', 'The account can no longer use this connection.');
    const { answer, refreshHash } = await mint(tx, row.api_token_id, clientId);
    await tx.query(`update oauth_refresh_tokens set used_at = now(), replaced_by = $2, grace = $3 where hash = $1`, [row.hash, refreshHash, seal(token, answer)]);
    return answer;
  });
  if (outcome instanceof OAuthError) throw outcome;
  return outcome;
}

/** RFC 7009: the client ends its own connection with one of its access or refresh tokens. Unknown tokens, another client's and repeats change nothing. */
export async function revoke(form: Record<string, string>, clientId: string | undefined): Promise<void> {
  const token = form.token ?? '';
  if (!clientId || !(SECRET('cvs_oat_').test(token) || SECRET('cvs_ort_').test(token))) return;
  await withTransaction(pool, async (tx) => {
    const row = (
      await tx.query(
        `update api_tokens t set revoked_at = now(), revoked_by = t.user_id, revoke_reason = 'oauth_revoke'
          where t.revoked_at is null and t.oauth_client_id = $2
            and t.id = (select api_token_id from oauth_access_tokens where hash = $1 union all select api_token_id from oauth_refresh_tokens where hash = $1 limit 1)
          returning t.id, t.user_id`,
        [sha256(token), clientId],
      )
    ).rows[0];
    if (row) await audit(tx, { actorId: row.user_id, action: 'agent.token_revoke', target: `api_token:${row.id}`, newValue: { reason: 'oauth_revoke', ownerId: row.user_id } });
  });
}

export const oauthReply = (body: unknown, status = 200, headers: Record<string, string> = {}) => Response.json(body, { status, headers: { 'cache-control': 'no-store', pragma: 'no-cache', ...headers } });

/** The form body (`application/x-www-form-urlencoded`, as RFC 6749 says, or JSON) as strings; at most 16 KB. */
export async function formOf(request: Request): Promise<Record<string, string>> {
  const text = await request.text();
  if (text.length > 16_384) throw new OAuthError('invalid_request', 'The body is too large.');
  if (/^application\/json/i.test(request.headers.get('content-type') ?? '')) {
    const parsed: unknown = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new OAuthError('invalid_request', 'Send a form body.');
    return Object.fromEntries(Object.entries(parsed).filter(([, v]) => typeof v === 'string')) as Record<string, string>;
  }
  return Object.fromEntries(new URLSearchParams(text));
}

/** `client_id` from the body, or from HTTP Basic with an empty secret (some public clients send it so). */
export function clientIdOf(request: Request, form: Record<string, string>): string | undefined {
  const basic = /^Basic ([A-Za-z0-9+/=]+)$/i.exec(request.headers.get('authorization') ?? '')?.[1];
  const id = basic ? Buffer.from(basic, 'base64').toString('utf8').split(':')[0] : undefined;
  if (!id) return form.client_id;
  try {
    return decodeURIComponent(id);
  } catch {
    throw new OAuthError('invalid_client', 'The Basic client id is not valid percent-encoding.');
  }
}

/**
 * Runs one /api/oauth endpoint: 503 while the agent API is off (`CVS_AGENT_API=0`), 60 requests a minute per client address, OAuth errors as JSON, and
 * never a body in a log line (codes, verifiers and tokens travel in them).
 */
export async function oauthEndpoint(request: Request, work: (ip: string) => Promise<Response>): Promise<Response> {
  if (process.env.CVS_AGENT_API === '0') return oauthReply({ error: 'temporarily_unavailable', error_description: 'Agent access is off.' }, 503);
  const ip = request.headers.get('cf-connecting-ip') ?? 'unknown';
  const wait = limited(`oauth:${ipKey(ip)}`, 60);
  if (wait) return oauthReply({ error: 'slow_down', error_description: `Too many requests; retry in ${wait} s.` }, 429, { 'Retry-After': String(wait) });
  try {
    return await work(ip);
  } catch (error) {
    if (error instanceof OAuthError) return oauthReply({ error: error.error, error_description: error.description }, error.status);
    if (error instanceof SyntaxError) return oauthReply({ error: 'invalid_request', error_description: 'Unreadable body.' }, 400);
    console.error(`oauth ${new URL(request.url).pathname} failed: ${(error as Error).name}`);
    return oauthReply({ error: 'server_error', error_description: 'Unexpected server error.' }, 500);
  }
}
