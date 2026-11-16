import { auth, type Session } from './auth';

type Guard = { session: Session; error?: never } | { session?: never; error: Response };

/** A template editor: an Admin, or a user an Admin let edit the motion presets and decide the members' proposals. */
export const isEditor = (user: Session['user']): boolean => user.role === 'admin' || user.canEditTemplates === true;

/** True for a session an Admin opened with "sign in as" (better-auth sets impersonatedBy): it acts as the user but may not change the user's own credentials. */
export const isImpersonated = (session: Session): boolean => Boolean(session.session.impersonatedBy);

export const impersonationRefusal = () => Response.json({ error: 'not_allowed_while_impersonating' }, { status: 403 });

/**
 * For API routes: 401 without a valid session (or a banned user), 403 while the user must first replace an Admin's temporary password
 * (only /api/auth stays open, for /change-password; an Admin signed in as the user is not held up by it), 403 when an Admin (or a template editor, isEditor) is required and the user is not one.
 */
export async function guard(request: Request, role: 'member' | 'editor' | 'admin'): Promise<Guard> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session || session.user.banned) return { error: Response.json({ error: 'unauthenticated' }, { status: 401 }) };
  if (session.user.mustChangePassword && !isImpersonated(session)) return { error: Response.json({ error: 'password_change_required' }, { status: 403 }) };
  if ((role === 'admin' && session.user.role !== 'admin') || (role === 'editor' && !isEditor(session.user))) return { error: Response.json({ error: 'forbidden' }, { status: 403 }) };
  return { session };
}
