import { auth } from '@/lib/auth';
import { guard } from '@/lib/session';

/** Admin: list users. */
export async function GET(request: Request) {
  const g = await guard(request, 'admin');
  if (g.error) return g.error;
  const { users } = await auth.api.listUsers({ headers: request.headers, query: { limit: 100 } });
  return Response.json({ users: users.map((u) => ({ id: u.id, email: u.email, name: u.name, role: u.role, banned: u.banned })) });
}

/**
 * Admin: create a Member or Admin account (Q4: accounts are created by an Admin, never by sign-up).
 * The password is optional (interview round 8): a user without one can sign in only with Lark.
 */
export async function POST(request: Request) {
  const g = await guard(request, 'admin');
  if (g.error) return g.error;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const { email, name, password, role = 'member' } = body ?? {};
  if (typeof email !== 'string' || typeof name !== 'string' || (password !== undefined && typeof password !== 'string') || (role !== 'member' && role !== 'admin')) {
    return Response.json({ error: 'email, name and role (member|admin) are required; password is optional' }, { status: 400 });
  }
  const { user } = await auth.api.createUser({ headers: request.headers, body: { email, name, password, role } });
  return Response.json({ id: user.id, email: user.email, role }, { status: 201 });
}
