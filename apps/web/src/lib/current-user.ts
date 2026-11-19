import { headers } from 'next/headers';
import { readSession } from './session';

/**
 * For pages: the signed-in user of this request, or null without a session or for a banned user (the same rule as `guard`).
 * `impersonatedBy` is the real Admin's id while an Admin is signed in as this user; the temporary-password gate is off then, as in `guard`.
 * `workspaceId` is the workspace the request resolved to (the same resolver as `guard`), null for a user in no active workspace.
 */
export async function currentUser() {
  const session = await readSession(await headers());
  if (!session || session.user.banned) return null;
  const impersonatedBy = session.session.impersonatedBy ?? null;
  return {
    ...session.user,
    impersonatedBy,
    mustChangePassword: impersonatedBy ? false : session.user.mustChangePassword,
    workspaceId: session.workspace?.workspaceId ?? null,
    workspaceRole: session.workspace?.workspaceRole ?? null,
  };
}
