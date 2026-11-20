import { COMPANY_WORKSPACE_ID } from '@cvs/db';
import { auth, pool } from '@/lib/auth';
import { authFailure, bad, readBody } from '@/lib/admin';
import { guard } from '@/lib/session';
import { userMethods } from '@/lib/user-methods';

/** Admin: list users, each with the names of their workspaces, the sign-in methods linked to the account, its passkeys last, whether 2FA is on, whether the user edits presets, whether it is an automation account and whether the user is outside the Lark organisation. */
export async function GET(request: Request) {
  const g = await guard(request, 'admin');
  if (g.error) return g.error;
  // shortcut: one page of 10000 instead of paging, far above the headcount of one company; page through if the user count ever nears it
  const { users } = await auth.api.listUsers({ headers: request.headers, query: { limit: 10_000 } });
  const methods = await userMethods(pool);
  for (const p of (await pool.query('select id, user_id, created_at from passkeys order by created_at, id')).rows) {
    methods.set(p.user_id, [...(methods.get(p.user_id) ?? []), { id: p.id, provider: 'passkey', email: null, createdAt: p.created_at.toISOString() }]);
  }
  // The workspaces each user is in, by name (docs/WORKSPACES.md: identity is instance-wide, membership grants data).
  const workspaces = new Map<string, string[]>();
  for (const m of (await pool.query('select m.user_id, w.name from workspace_members m join workspaces w on w.id = m.workspace_id order by w.name')).rows) {
    workspaces.set(m.user_id, [...(workspaces.get(m.user_id) ?? []), m.name]);
  }
  return Response.json({
    users: users.map((u) => ({ id: u.id, email: u.email, name: u.name, role: u.role, banned: u.banned, teamId: (u as typeof u & { teamId: string }).teamId, twoFactor: (u as typeof u & { twoFactorEnabled?: boolean }).twoFactorEnabled === true, canEditTemplates: (u as typeof u & { canEditTemplates?: boolean }).canEditTemplates === true, system: (u as typeof u & { system?: boolean }).system === true, outsideLark: (u as typeof u & { outsideLark?: boolean }).outsideLark === true, canImpersonate: (u as typeof u & { canImpersonate?: boolean }).canImpersonate === true, methods: methods.get(u.id) ?? [], workspaces: workspaces.get(u.id) ?? [] })),
  });
}

/**
 * Admin: create a Member or Admin account (Q4: accounts are created by an Admin, never by sign-up).
 * The team is required and must be a visible one. The password is optional (interview round 8): a user without one can sign in only
 * with Lark or Google. The email counts as verified, which better-auth needs before it links a first social sign-in to the account.
 * A password set here is known to the Admin, so the user must replace it at the first sign-in, as with a temporary one ([id]/route.ts).
 * The user joins the company workspace (an Admin as its owner, as migration 0106 filed the Admins); naming another workspace comes with its management pages.
 */
export async function POST(request: Request) {
  const g = await guard(request, 'admin');
  if (g.error) return g.error;
  const { email, name, password, teamId, role = 'member', outsideLark = false } = (await readBody(request)) ?? {};
  if (typeof email !== 'string' || typeof name !== 'string' || (password !== undefined && typeof password !== 'string') || (role !== 'member' && role !== 'admin') || typeof outsideLark !== 'boolean') {
    return bad('email, name, teamId and role (member|admin) are required; password and outsideLark (boolean) are optional');
  }
  if (typeof teamId !== 'string') return bad('teamId is required');
  if (!(await pool.query('select 1 from teams where id = $1 and not hidden', [teamId])).rowCount) return bad('teamId must be the id of a visible team');
  try {
    const { user } = await auth.api.createUser({ headers: request.headers, body: { email, name, password, role, data: { teamId, emailVerified: true, outsideLark, mustChangePassword: typeof password === 'string' } } });
    await pool.query('insert into workspace_members (workspace_id, user_id, role, added_by) values ($1, $2, $3, $4) on conflict do nothing', [
      COMPANY_WORKSPACE_ID,
      user.id,
      role === 'admin' ? 'owner' : 'member',
      g.session.user.id,
    ]);
    return Response.json({ id: user.id, email: user.email, role, teamId }, { status: 201 });
  } catch (e) {
    return authFailure(e);
  }
}
