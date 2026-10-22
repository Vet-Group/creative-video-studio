import { auth, type Session } from './auth';

type Guard = { session: Session; error?: never } | { session?: never; error: Response };

/** For API routes: 401 without a valid session (or a banned user), 403 when an Admin is required and the user is not one. */
export async function guard(request: Request, role: 'member' | 'admin'): Promise<Guard> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session || session.user.banned) return { error: Response.json({ error: 'unauthenticated' }, { status: 401 }) };
  if (role === 'admin' && session.user.role !== 'admin') return { error: Response.json({ error: 'forbidden' }, { status: 403 }) };
  return { session };
}
