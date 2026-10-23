import { type RouteContext } from '@/lib/assets';
import { pool } from '@/lib/auth';
import { LIVE_CLIP } from '@/lib/clips';
import { guard } from '@/lib/session';

/**
 * Adds a Library item to the caller's own favourites (`{ favorite: true }`) or takes it out (`{ favorite: false }`). Any member may favourite any
 * live item; favourites are private to the user, change nothing on the job and are not audited. Repeating a call is harmless.
 */
export async function PUT(request: Request, { params }: RouteContext) {
  const g = await guard(request, 'member');
  if (g.error) return g.error;
  const { id } = await params;
  const body = (await request.json().catch(() => null)) as { favorite?: unknown } | null;
  if (typeof body?.favorite !== 'boolean') return Response.json({ error: 'favorite must be true or false' }, { status: 400 });
  const userId = g.session.user.id;
  if ((await pool.query(`select 1 from jobs j where j.id = $1 and ${LIVE_CLIP}`, [id])).rowCount === 0) return Response.json({ error: 'not found' }, { status: 404 });
  if (body.favorite) await pool.query('insert into favorites (user_id, job_id) values ($1, $2) on conflict do nothing', [userId, id]);
  else await pool.query('delete from favorites where user_id = $1 and job_id = $2', [userId, id]);
  return Response.json({ favorite: body.favorite });
}
