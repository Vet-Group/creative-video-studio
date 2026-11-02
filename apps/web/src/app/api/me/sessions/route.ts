import { audit } from '@cvs/core/audit';
import { withTransaction } from '@cvs/core/ledger';
import { bad } from '@/lib/admin';
import { pool } from '@/lib/auth';
import { guard } from '@/lib/session';

// The app's own routes, not better-auth's /list-sessions and /revoke-session: those hand every session token to the page and refuse a
// session older than a day (freshAge).

/** The caller's live sessions, newest first, without their tokens; `current` marks the one this request came with. */
export async function GET(request: Request) {
  const g = await guard(request, 'member');
  if (g.error) return g.error;
  const { rows } = await pool.query(
    'select id, user_agent, ip_address, created_at, updated_at from sessions where user_id = $1 and expires_at > now() order by created_at desc, id',
    [g.session.user.id],
  );
  return Response.json({
    sessions: rows.map((r) => ({
      id: r.id,
      userAgent: r.user_agent,
      ipAddress: r.ip_address,
      createdAt: new Date(r.created_at).toISOString(),
      updatedAt: new Date(r.updated_at).toISOString(),
      current: r.id === g.session.session.id,
    })),
  });
}

/** Signs out the caller's session `?id=`, or every other one without it; the session of this request stays. Audited with the count. */
export async function DELETE(request: Request) {
  const g = await guard(request, 'member');
  if (g.error) return g.error;
  const id = new URL(request.url).searchParams.get('id');
  const userId = g.session.user.id;
  const revoked = await withTransaction(pool, async (tx) => {
    const { rowCount } = await tx.query(`delete from sessions where user_id = $1 and id <> $2${id === null ? '' : ' and id = $3'}`, [
      userId,
      g.session.session.id,
      ...(id === null ? [] : [id]),
    ]);
    if (rowCount) await audit(tx, { actorId: userId, action: 'user.sessions_revoke', target: `user:${userId}`, newValue: { sessions: rowCount, others: id === null } });
    return rowCount ?? 0;
  });
  if (id !== null && revoked === 0) return bad('not found', 404);
  return Response.json({ revoked });
}
