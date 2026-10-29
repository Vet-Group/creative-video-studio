import { type RouteContext } from '@/lib/assets';
import { pool } from '@/lib/auth';
import { guard } from '@/lib/session';

/** Deletes the caller's own hook or location; an Admin may also delete a company one. Jobs and templates that name it keep the id, which the pages drop. */
export async function DELETE(request: Request, { params }: RouteContext) {
  const g = await guard(request, 'member');
  if (g.error) return g.error;
  const { id } = await params;
  const admin = g.session.user.role === 'admin';
  const res = await pool.query('delete from user_choices where id = $1 and (user_id = $2 or ($3 and is_company))', [id, g.session.user.id, admin]);
  return res.rowCount ? new Response(null, { status: 204 }) : Response.json({ error: 'not found' }, { status: 404 });
}
