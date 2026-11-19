import { type RouteContext } from '@/lib/assets';
import { guard } from '@/lib/session';
import { addMember, managerOf, membersOf } from '@/lib/workspaces';

/** The members of a workspace, for an Admin (any workspace) or its owner (their active workspace, not the company's): lib/workspaces.ts managerOf. */
export async function GET(request: Request, { params }: RouteContext) {
  const g = await guard(request, 'member');
  if (g.error) return g.error;
  const { id } = await params;
  const as = await managerOf(g, id, false);
  if (as instanceof Response) return as;
  return Response.json({ members: await membersOf(id) });
}

/**
 * Add a member: an existing user by `email`, or a new account with `name` too and a temporary password shown once (lib/workspaces.ts addMember). An
 * owner grants only owner or member, never Admin or editor, and may not create an account on the company's email domains.
 */
export async function POST(request: Request, { params }: RouteContext) {
  const g = await guard(request, 'member');
  if (g.error) return g.error;
  const { id } = await params;
  const as = await managerOf(g, id, true);
  if (as instanceof Response) return as;
  return addMember(request, g.session.user.id, id, as === 'owner');
}
