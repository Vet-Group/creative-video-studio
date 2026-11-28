import { tokenMonthSpend } from '@cvs/core/limits';
import { bad } from '@/lib/admin';
import { connectionSession, tokenAdmin } from '@/lib/agent-access';
import { type RouteContext } from '@/lib/assets';
import { pool } from '@/lib/auth';

/**
 * Whether connection `id` (any Admin's) would be let in now, without its secret: the same checks a Bearer request meets (lib/agent-access.ts), plus the
 * kill switch. `reason` is null when it would, else revoked, expired, banned, password_change_required, not_admin (shown as paused), workspace or
 * agent_api_off; `lastUsedAt`/`lastUsedIp` as the list shows them, `monthSpendUsd` this month's spend through it. Cookie only, like every route here.
 */
export async function GET(request: Request, { params }: RouteContext) {
  const g = await tokenAdmin(request);
  if (g.error) return g.error;
  const { id } = await params;
  const row = (
    await pool.query('select revoked_at, coalesce(expires_at <= now(), false) as expired, last_used_at, last_used_ip from api_tokens where id = $1', [id])
  ).rows[0];
  if (!row) return bad('not found', 404);
  const found = await connectionSession(id, pool);
  const why = typeof found === 'string' ? found : null;
  const reason = why ?? (process.env.CVS_AGENT_API === '0' ? 'agent_api_off' : null);
  const status = row.revoked_at ? 'revoked' : row.expired ? 'expired' : why === 'not_admin' ? 'paused' : 'active';
  return Response.json(
    {
      id,
      ok: reason === null,
      status,
      reason,
      lastUsedAt: row.last_used_at?.toISOString() ?? null,
      lastUsedIp: row.last_used_ip as string | null,
      monthSpendUsd: await tokenMonthSpend(pool, id),
    },
    { headers: { 'cache-control': 'no-store' } },
  );
}
