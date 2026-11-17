import { pool } from '@/lib/auth';
import { RATING_SNOOZE_DAYS } from '@/lib/rating';
import { guard, impersonationRefusal, isImpersonated } from '@/lib/session';

/** The prompt's "later" button: the prompt stays away for RATING_SNOOZE_DAYS days. */
export async function POST(request: Request) {
  const g = await guard(request, 'member');
  if (g.error) return g.error;
  if (isImpersonated(g.session)) return impersonationRefusal();
  await pool.query(`update users set rating_snoozed_until = now() + make_interval(days => $2) where id = $1`, [g.session.user.id, RATING_SNOOZE_DAYS]);
  return Response.json({ ok: true });
}
