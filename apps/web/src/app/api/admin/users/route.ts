import { auth, pool } from '@/lib/auth';
import { authFailure, bad, readBody } from '@/lib/admin';
import { guard } from '@/lib/session';

/** Admin: list users. */
export async function GET(request: Request) {
  const g = await guard(request, 'admin');
  if (g.error) return g.error;
  // shortcut: one page of 10000 instead of paging, far above the headcount of one company; page through if the user count ever nears it
  const { users } = await auth.api.listUsers({ headers: request.headers, query: { limit: 10_000 } });
  return Response.json({
    users: users.map((u) => ({ id: u.id, email: u.email, name: u.name, role: u.role, banned: u.banned, teamId: (u as typeof u & { teamId: string }).teamId })),
  });
}

/**
 * Admin: create a Member or Admin account (Q4: accounts are created by an Admin, never by sign-up).
 * The team is required and must be a visible one. The password is optional (interview round 8): a user without one can sign in only with Lark.
 */
export async function POST(request: Request) {
  const g = await guard(request, 'admin');
  if (g.error) return g.error;
  const { email, name, password, teamId, role = 'member' } = (await readBody(request)) ?? {};
  if (typeof email !== 'string' || typeof name !== 'string' || (password !== undefined && typeof password !== 'string') || (role !== 'member' && role !== 'admin')) {
    return bad('email, name, teamId and role (member|admin) are required; password is optional');
  }
  if (typeof teamId !== 'string') return bad('teamId is required');
  if (!(await pool.query('select 1 from teams where id = $1 and not hidden', [teamId])).rowCount) return bad('teamId must be the id of a visible team');
  try {
    const { user } = await auth.api.createUser({ headers: request.headers, body: { email, name, password, role, data: { teamId } } });
    return Response.json({ id: user.id, email: user.email, role, teamId }, { status: 201 });
  } catch (e) {
    return authFailure(e);
  }
}
