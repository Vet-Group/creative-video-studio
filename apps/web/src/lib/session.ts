import { auth, pool, type Session } from './auth';

type Guard = { session: Session; error?: never } | { session?: never; error: Response };

/** A template editor: an Admin, or a user an Admin let edit the motion presets and decide the members' proposals. */
export const isEditor = (user: Session['user']): boolean => user.role === 'admin' || user.canEditTemplates === true;

/** True for a session an Admin opened with "sign in as" (better-auth sets impersonatedBy): it acts as the user but may not change the user's own credentials. */
export const isImpersonated = (session: Session): boolean => Boolean(session.session.impersonatedBy);

export const impersonationRefusal = () => Response.json({ error: 'not_allowed_while_impersonating' }, { status: 403 });

const IMPERSONATION_MAX_MS = 60 * 60 * 1000;

/**
 * The session of these headers, or null. A session opened with "sign in as" is valid only for one hour from its start and only while the Admin who
 * opened it is still an unlocked Admin with the developer flag: better-auth lets the one-hour expiry slip to its 7-day default when the signed
 * dont_remember cookie is dropped, and it knows nothing of the flag, so both are enforced here, for every caller (`guard`, `currentUser`).
 */
export async function readSession(headers: Headers): Promise<Session | null> {
  const session = await auth.api.getSession({ headers });
  const by = session?.session.impersonatedBy;
  if (!session || !by) return session;
  if (Date.now() - new Date(session.session.createdAt).getTime() > IMPERSONATION_MAX_MS) return null;
  const holder = await pool.query(`select 1 from users where id = $1 and role = 'admin' and can_impersonate and banned is not true`, [by]);
  return holder.rowCount ? session : null;
}

/** The request comes from this app's own origin (APP_URL); a state change that can be sent from another site is refused. */
export function sameOrigin(request: Request): boolean {
  try {
    return request.headers.get('origin') === new URL(process.env.APP_URL!).origin;
  } catch {
    return false;
  }
}

/**
 * For API routes: 401 without a valid session (or a banned user), 403 while the user must first replace an Admin's temporary password
 * (only /api/auth stays open, for /change-password; an Admin signed in as the user is not held up by it), 403 when an Admin (or a template editor, isEditor) is required and the user is not one.
 */
export async function guard(request: Request, role: 'member' | 'editor' | 'admin'): Promise<Guard> {
  const session = await readSession(request.headers);
  if (!session || session.user.banned) return { error: Response.json({ error: 'unauthenticated' }, { status: 401 }) };
  if (session.user.mustChangePassword && !isImpersonated(session)) return { error: Response.json({ error: 'password_change_required' }, { status: 403 }) };
  if ((role === 'admin' && session.user.role !== 'admin') || (role === 'editor' && !isEditor(session.user))) return { error: Response.json({ error: 'forbidden' }, { status: 403 }) };
  // An Admin signed in as an Admin only looks: a change made here would be logged under that Admin's name.
  if (role === 'admin' && isImpersonated(session) && request.method !== 'GET' && request.method !== 'HEAD') return { error: impersonationRefusal() };
  return { session };
}
