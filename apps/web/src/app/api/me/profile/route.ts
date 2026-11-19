import { audit } from '@cvs/core/audit';
import { withTransaction } from '@cvs/core/ledger';
import { COMPANY_WORKSPACE_ID } from '@cvs/db';
import { bad, readBody } from '@/lib/admin';
import { pool } from '@/lib/auth';
import { isAvatarColor, nameProblem } from '@/lib/profile';
import { guard, impersonationRefusal, isImpersonated } from '@/lib/session';
import { emailOf, onCompanyDomain } from '@/lib/workspaces';

/**
 * The caller changes their own display name (1 to 60 characters after trimming, no control characters), avatar colour (one of the
 * palette's, or null for the colour the name gives) and sign-in email (owner, 2026-11-11: saved at once, without a confirmation mail, if
 * no other user has it). Audited with the old and new values in the transaction of the change.
 * better-auth's /update-user is closed (api/auth/[...all]/route.ts), so this is the only way a user renames themselves.
 * A self-typed email is not verified: better-auth then never links a first Google sign-in to it by equal address, so typing someone
 * else's address does not hand them this account. Linked Lark and Google accounts and passkeys keep working; an Admin's change verifies it.
 * Outside the company's workspace a new address on the company's email domains is refused (403 company_email), before the uniqueness check: a partner
 * may neither pre-claim a staff member's address (and block their first Lark sign-in) nor learn which staff addresses exist (docs/WORKSPACES.md §4).
 */
export async function PATCH(request: Request) {
  const g = await guard(request, 'member');
  if (g.error) return g.error;
  if (isImpersonated(g.session)) return impersonationRefusal();
  const { name, avatarColor, email } = (await readBody(request)) ?? {};
  if (name === undefined && avatarColor === undefined && email === undefined) return bad('give name, avatarColor or email');
  if (name !== undefined && (typeof name !== 'string' || nameProblem(name))) return bad('name must have 1 to 60 characters and no control characters');
  if (avatarColor !== undefined && avatarColor !== null && !isAvatarColor(avatarColor)) return bad('avatarColor must be null or a colour of the palette');
  // As an account is created with (lib/workspaces.ts emailOf): "boss@vetgroup.net." is no address, so it cannot slip past the domain rule below.
  const newEmail = email === undefined ? undefined : emailOf(email);
  if (newEmail === null) return bad('email must be an email address');
  const userId = g.session.user.id;
  if (typeof newEmail === 'string' && g.workspaceId !== COMPANY_WORKSPACE_ID && newEmail !== g.session.user.email.toLowerCase() && onCompanyDomain(newEmail)) return bad('company_email', 403);
  if (typeof newEmail === 'string' && (await pool.query('select 1 from users where lower(email) = $1 and id <> $2', [newEmail, userId])).rowCount) {
    return bad('another user has this email', 409);
  }
  const profile = await withTransaction(pool, async (tx) => {
    const old = (await tx.query('select name, avatar_color, email from users where id = $1 for update', [userId])).rows[0] as { name: string; avatar_color: string | null; email: string };
    const next = {
      name: typeof name === 'string' ? name.trim() : old.name,
      avatarColor: avatarColor === undefined ? old.avatar_color : (avatarColor as string | null),
      email: (newEmail as string | undefined) ?? old.email,
    };
    if (next.name === old.name && next.avatarColor === old.avatar_color && next.email === old.email) return next;
    const emailChanged = next.email !== old.email;
    await tx.query('update users set name = $2, avatar_color = $3, email = $4, email_verified = email_verified and not $5, updated_at = now() where id = $1', [
      userId,
      next.name,
      next.avatarColor,
      next.email,
      emailChanged,
    ]);
    await audit(tx, {
      actorId: userId,
      action: 'user.profile_update',
      target: `user:${userId}`,
      oldValue: { name: old.name, avatarColor: old.avatar_color, ...(emailChanged ? { email: old.email } : {}) },
      newValue: { name: next.name, avatarColor: next.avatarColor, ...(emailChanged ? { email: next.email } : {}) },
    });
    return next;
  }).catch((e: unknown) => {
    if ((e as { code?: string }).code === '23505') return null; // the same address saved by someone else since the check above
    throw e;
  });
  if (!profile) return bad('another user has this email', 409);
  return Response.json(profile);
}
