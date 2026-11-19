import { bad, readBody } from '@/lib/admin';
import { guard, sameOrigin } from '@/lib/session';
import { changeMember, isRole, managerOf } from '@/lib/workspaces';

type Context = { params: Promise<{ id: string; userId: string }> };

/** Make a member an owner or a member (`role`); the last owner cannot be demoted (409 last_owner). An Admin, or the workspace's owner. */
export async function PATCH(request: Request, { params }: Context) {
  const g = await guard(request, 'member');
  if (g.error) return g.error;
  if (!sameOrigin(request)) return bad('forbidden origin', 403);
  const { id, userId } = await params;
  const as = await managerOf(g, id, true);
  if (as instanceof Response) return as;
  const { role } = (await readBody(request)) ?? {};
  if (!isRole(role)) return bad('role must be owner or member');
  return changeMember(g.session.user.id, id, userId, role);
}

/** Remove a member; their rows stay in the workspace. The last owner cannot be removed (409 last_owner). An Admin, or the workspace's owner. */
export async function DELETE(request: Request, { params }: Context) {
  const g = await guard(request, 'member');
  if (g.error) return g.error;
  if (!sameOrigin(request)) return bad('forbidden origin', 403);
  const { id, userId } = await params;
  const as = await managerOf(g, id, true);
  if (as instanceof Response) return as;
  return changeMember(g.session.user.id, id, userId, null);
}
