import { audit } from '@cvs/core/audit';
import { withTransaction } from '@cvs/core/ledger';
import { bad, readBody } from '@/lib/admin';
import { pool } from '@/lib/auth';
import { isAvatarColor, nameProblem } from '@/lib/profile';
import { guard } from '@/lib/session';

/**
 * The caller changes their own display name (1 to 60 characters after trimming, no control characters) and avatar colour (one of the
 * palette's, or null for the colour the name gives). Audited with the old and new values in the transaction of the change.
 * better-auth's /update-user is closed (api/auth/[...all]/route.ts), so this is the only way a user renames themselves.
 */
export async function PATCH(request: Request) {
  const g = await guard(request, 'member');
  if (g.error) return g.error;
  const { name, avatarColor } = (await readBody(request)) ?? {};
  if (name === undefined && avatarColor === undefined) return bad('give name or avatarColor');
  if (name !== undefined && (typeof name !== 'string' || nameProblem(name))) return bad('name must have 1 to 60 characters and no control characters');
  if (avatarColor !== undefined && avatarColor !== null && !isAvatarColor(avatarColor)) return bad('avatarColor must be null or a colour of the palette');
  const userId = g.session.user.id;
  const profile = await withTransaction(pool, async (tx) => {
    const old = (await tx.query('select name, avatar_color from users where id = $1 for update', [userId])).rows[0] as { name: string; avatar_color: string | null };
    const next = { name: typeof name === 'string' ? name.trim() : old.name, avatarColor: avatarColor === undefined ? old.avatar_color : (avatarColor as string | null) };
    if (next.name === old.name && next.avatarColor === old.avatar_color) return next;
    await tx.query('update users set name = $2, avatar_color = $3, updated_at = now() where id = $1', [userId, next.name, next.avatarColor]);
    await audit(tx, { actorId: userId, action: 'user.profile_update', target: `user:${userId}`, oldValue: { name: old.name, avatarColor: old.avatar_color }, newValue: next });
    return next;
  });
  return Response.json(profile);
}
