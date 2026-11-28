// Test support for the agent suites, which run once with personal access tokens and once with OAuth access tokens (CVS_TEST_AGENT_KIND=oauth, set by
// the *-oauth.test.ts files): an approved OAuth connection made in SQL, with a live (or expired) access token and a refresh token.
import { createHash, randomBytes } from 'node:crypto';
import type { Queryable } from '@cvs/core/ledger';

export const oauthKind = () => process.env.CVS_TEST_AGENT_KIND === 'oauth';

const sha256 = (s: string) => createHash('sha256').update(s).digest();
const secret = (prefix: string) => `${prefix}${randomBytes(32).toString('base64url')}`;

/** An OAuth connection of `userId`: `token` is its access token (`cvs_oat_`), expired with `accessExpired`. */
export async function oauthConnection(
  q: Queryable,
  o: { userId: string; workspaceId?: string; capUsd?: string; accessExpired?: boolean },
): Promise<{ id: string; token: string; refreshToken: string; clientId: string }> {
  const clientId = `cvsc_${randomBytes(18).toString('base64url')}`;
  const id = randomBytes(12).toString('hex').slice(0, 12);
  await q.query(`insert into oauth_clients (id, name, redirect_uris, first_consent_at) values ($1, 'Test client', '{http://127.0.0.1/callback}', now())`, [clientId]);
  await q.query(`insert into api_tokens (id, user_id, workspace_id, kind, name, oauth_client_id, monthly_cap_usd) values ($1, $2, $3, 'oauth', 'test', $4, $5)`, [
    id,
    o.userId,
    o.workspaceId ?? 'ws_vet',
    clientId,
    o.capUsd ?? '20',
  ]);
  const token = secret('cvs_oat_');
  const refreshToken = secret('cvs_ort_');
  await q.query(`insert into oauth_access_tokens (hash, api_token_id, client_id, expires_at) values ($1, $2, $3, now() + $4 * interval '1 second')`, [
    sha256(token),
    id,
    clientId,
    o.accessExpired ? -1 : 3600,
  ]);
  await q.query(`insert into oauth_refresh_tokens (hash, api_token_id, client_id, expires_at) values ($1, $2, $3, now() + interval '30 days')`, [sha256(refreshToken), id, clientId]);
  return { id, token, refreshToken, clientId };
}
