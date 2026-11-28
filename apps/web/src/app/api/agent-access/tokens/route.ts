import { tokenMonthSpend } from '@cvs/core/limits';
import { bad, readBody } from '@/lib/admin';
import { createPat, PAT_DAYS, TOKEN_CREATE_FRESH_MS, tokenAdmin } from '@/lib/agent-access';
import { pool } from '@/lib/auth';

// Settings > "Connect AI": an Admin's agent access tokens. Cookie only (the agent deny set refuses a Bearer here); the secret leaves the server once, in
// the answer to its POST, and never in the list.

/**
 * The caller's connections, or with `?all=1` every user's (each with its owner), newest first and revoked ones last: no secret and no hash. An OAuth
 * connection carries its client's self-declared name. `paused`
 * when the owner is no longer an Admin (lib/agent-access.ts refuses the token until a re-promotion), `monthSpendUsd` this month's spend through it.
 */
export async function GET(request: Request) {
  const g = await tokenAdmin(request);
  if (g.error) return g.error;
  const me = g.session.user.id;
  const all = new URL(request.url).searchParams.get('all') === '1';
  const { rows } = await pool.query(
    `select t.id, t.name, t.kind, t.user_id, u.name as owner_name, u.email as owner_email, u.role as owner_role, t.created_at, t.expires_at, t.last_used_at,
            t.last_used_ip, t.revoked_at, coalesce(t.expires_at <= now(), false) as expired, c.name as client_name
       from api_tokens t join users u on u.id = t.user_id left join oauth_clients c on c.id = t.oauth_client_id
      where $1::text is null or t.user_id = $1
      order by t.revoked_at is not null, t.created_at desc, t.id limit 100`,
    [all ? null : me],
  );
  const members = process.env.CVS_AGENT_API_MEMBERS === '1';
  const tokens = await Promise.all(
    rows.map(async (r) => {
      const paused = r.owner_role !== 'admin' && !members;
      return {
        id: r.id as string,
        name: r.name as string,
        kind: r.kind as 'pat' | 'oauth',
        clientName: r.client_name as string | null,
        owner: { id: r.user_id as string, name: r.owner_name as string, email: r.owner_email as string },
        mine: r.user_id === me,
        createdAt: r.created_at.toISOString(),
        expiresAt: r.expires_at?.toISOString() ?? null,
        lastUsedAt: r.last_used_at?.toISOString() ?? null,
        lastUsedIp: r.last_used_ip as string | null,
        status: r.revoked_at ? 'revoked' : r.expired ? 'expired' : paused ? 'paused' : 'active',
        paused,
        monthSpendUsd: await tokenMonthSpend(pool, r.id),
      };
    }),
  );
  return Response.json({ enabled: process.env.CVS_AGENT_API !== '0', tokens });
}

/**
 * A new personal access token for the caller in this workspace: `name` (1-60), `days` (7, 30 or 90; 30 when left out; null never expires); a
 * `capUsd` from an older client is ignored, since a connection has no cap of its own (owner decision 2026-11-28). Needs a sign-in in the last 10
 * minutes (403 reauth_required), and fewer than 10 active tokens (409 too_many_tokens). The secret is in this answer only.
 */
export async function POST(request: Request) {
  const g = await tokenAdmin(request);
  if (g.error) return g.error;
  if (Date.now() - new Date(g.session.session.createdAt).getTime() > TOKEN_CREATE_FRESH_MS) return bad('reauth_required', 403);
  if (process.env.CVS_AGENT_API === '0') return bad('agent_api_off', 409);
  const body = (await readBody(request)) ?? {};
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (name.length < 1 || name.length > 60) return bad('name must have 1 to 60 characters');
  const days = body.days === undefined ? 30 : body.days;
  if (days !== null && !PAT_DAYS.includes(days as (typeof PAT_DAYS)[number])) return bad('days must be 7, 30, 90 or null');
  const made = await createPat({ userId: g.session.user.id, workspaceId: g.workspaceId, name, days: days as (typeof PAT_DAYS)[number] | null });
  if (made === 'too_many') return bad('too_many_tokens', 409);
  return Response.json(made, { status: 201, headers: { 'cache-control': 'no-store' } });
}
