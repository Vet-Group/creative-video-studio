// Workspace management (docs/WORKSPACES.md §3 and §4, phase 3): the rules the Admin's Workspaces page and an owner's Members page share.
import { randomBytes } from 'node:crypto';
import { audit } from '@cvs/core/audit';
import { type Queryable, withTransaction } from '@cvs/core/ledger';
import { COMPANY_WORKSPACE_ID } from '@cvs/db';
import { ACCOUNT_CREATED, ownerMade } from './account-audit';
import { authFailure, bad, readBody } from './admin';
import { auth, pool } from './auth';
import { impersonationRefusal, isImpersonated, type RequestSession } from './session';

export type WorkspaceRole = 'owner' | 'member';
export const isRole = (v: unknown): v is WorkspaceRole => v === 'owner' || v === 'member';

/** zod's z.email(), which better-auth's createUser applies: no trailing dot, so "boss@vetgroup.net." is no address. */
const EMAIL = /^(?:[A-Za-z0-9_'+\-]+\.)*[A-Za-z0-9_'+\-]*[A-Za-z0-9_+-]@(?:[A-Za-z0-9][A-Za-z0-9\-]*\.)+[A-Za-z]{2,}$/;
/** An email address as an account is created with, trimmed and in lower case; null for anything else. */
export const emailOf = (v: unknown): string | null => {
  const s = typeof v === 'string' ? v.trim().toLowerCase() : '';
  return s.length <= 254 && EMAIL.test(s) ? s : null;
};
/** A person's or a workspace's name: NFKC, 1 to 100 characters once trimmed, no control or format character (a NUL, a right-to-left override); else null. */
export const nameOf = (v: unknown): string | null => {
  const s = typeof v === 'string' ? v.normalize('NFKC').trim() : '';
  return [...s].length >= 1 && [...s].length <= 100 && !/[\p{Cc}\p{Cf}]/u.test(s) ? s : null;
};

/**
 * The company's email domains, from CVS_COMPANY_EMAIL_DOMAINS (comma-separated), else vetgroup.net and vetglobalbrand.com, where Lark staff sign in. A
 * workspace owner may neither create nor add an account on one of them or a subdomain of one, so a partner cannot pre-create a staff member's account
 * nor learn which staff addresses exist (docs/WORKSPACES.md §4).
 */
export function onCompanyDomain(email: string): boolean {
  const host = email.slice(email.lastIndexOf('@') + 1).toLowerCase().replace(/\.+$/, '');
  const domains = (process.env.CVS_COMPANY_EMAIL_DOMAINS || 'vetgroup.net,vetglobalbrand.com').split(',').map((d) => d.trim().toLowerCase()).filter(Boolean);
  return domains.some((d) => host === d || host.endsWith(`.${d}`));
}

type Caller = { session: RequestSession; workspaceId: string; workspaceRole: WorkspaceRole };

/**
 * How the caller may manage workspace `id`: as an Admin (any workspace there is), or as its owner while it is their active workspace, never the company's,
 * whose staff stay on Admin > Users. Otherwise the refusal: 403 inside their own workspace, 404 for any other, so another workspace's existence does not
 * leak. Nothing is changed from a session an Admin opened as someone else.
 */
export async function managerOf(c: Caller, id: string, write: boolean): Promise<'admin' | 'owner' | Response> {
  if (write && isImpersonated(c.session)) return impersonationRefusal();
  if (c.session.user.role === 'admin') return (await pool.query('select 1 from workspaces where id = $1', [id])).rowCount ? 'admin' : bad('not found', 404);
  if (c.workspaceId !== id) return bad('not found', 404);
  return c.workspaceRole === 'owner' && id !== COMPANY_WORKSPACE_ID ? 'owner' : bad('forbidden', 403);
}

/**
 * The active workspaces a user may switch to, oldest membership first; with `sharedWith` (the Admin of an impersonated session) only those both are in.
 * `company` marks the company's, which the switcher badges, so a partner's lookalike name (with a Cyrillic letter) cannot pass for it.
 */
export async function activeWorkspaces(userId: string, sharedWith: string | null): Promise<{ id: string; name: string; company: boolean }[]> {
  const { rows } = await pool.query(
    `select w.id, w.name, w.id = $3 as company from workspace_members m join workspaces w on w.id = m.workspace_id
      where m.user_id = $1 and w.disabled_at is null
        and ($2::text is null or exists (select 1 from workspace_members a where a.workspace_id = m.workspace_id and a.user_id = $2))
      order by m.created_at, m.workspace_id`,
    [userId, sharedWith, COMPANY_WORKSPACE_ID],
  );
  return rows;
}

/** The members of one workspace, owners first. Only this workspace's: nothing says which other workspaces a member is in. `admin` is for an Admin's view. */
export async function membersOf(id: string) {
  const { rows } = await pool.query(
    `select u.id, u.name, u.email, m.role, u.role = 'admin' as admin from workspace_members m join users u on u.id = m.user_id
      where m.workspace_id = $1 order by m.role = 'owner' desc, lower(u.name), u.id`,
    [id],
  );
  return rows as { id: string; name: string; email: string; role: WorkspaceRole; admin: boolean }[];
}

/** Locks the workspace row, so two changes to its owners cannot both pass the last-owner check; false when there is no such workspace. */
const lockWorkspace = async (tx: Queryable, id: string) => Boolean((await tx.query('select 1 from workspaces where id = $1 for update', [id])).rowCount);

/**
 * Creates an account with a temporary password the caller copies to the person once (CVS sends no email); they must replace it at the first sign-in.
 * An Admin's account counts as verified, as on Admin > Users, so a first Google sign-in links to it. An owner's does not, and is marked as an owner's:
 * neither Google nor Lark links a first sign-in into it, and Lark never links at all (lib/account-audit.ts). Returns the new user's id and password,
 * or the refusal. `join` adds the membership and its audit rows in one transaction; if it fails, the account is removed again.
 */
export async function createAccount(
  actorId: string,
  { email, name, byOwner, workspaceId }: { email: string; name: string; byOwner: boolean; workspaceId: string },
  join: (tx: Queryable, userId: string) => Promise<void>,
): Promise<{ userId: string; password: string } | Response> {
  if ((await pool.query('select 1 from users where lower(email) = $1', [email])).rowCount) return bad('email_taken', 409);
  const password = randomBytes(12).toString('base64url');
  let userId: string;
  try {
    // No headers: the caller's right to create was checked by the route; better-auth's own check would ask for an Admin.
    userId = (await auth.api.createUser({ body: { email, name, password, role: 'member', data: { emailVerified: !byOwner, mustChangePassword: true } } })).user.id;
  } catch (e) {
    return authFailure(e);
  }
  try {
    await withTransaction(pool, async (tx) => {
      await audit(tx, { actorId, action: ACCOUNT_CREATED, target: `user:${userId}`, newValue: { workspaceId, email, byOwner } });
      await join(tx, userId);
    });
  } catch (e) {
    await pool.query('delete from users where id = $1', [userId]);
    throw e;
  }
  return { userId, password };
}

/** Adds a membership and audits it under the workspace. */
export async function join(tx: Queryable, actorId: string, workspaceId: string, userId: string, role: WorkspaceRole): Promise<void> {
  await tx.query('insert into workspace_members (workspace_id, user_id, role, added_by) values ($1, $2, $3, $4)', [workspaceId, userId, role, actorId]);
  await audit(tx, { actorId, action: 'workspace.member_add', target: `workspace:${workspaceId}`, newValue: { userId, role } });
}

/**
 * POST a member: `{ email, role }` adds the existing user with that email; `{ email, name, role }` creates an account (createAccount). Answers 201 with the
 * user's id and, for a new account, the temporary password, shown once and never cached. An owner gets 403 company_email for the company's domains
 * before any lookup, and no_user for an Admin or a company member as for an unknown address: they can neither pull staff in nor learn who exists. An
 * account an owner created never joins the company workspace (409 owner_made). Owners are not throttled: each refusal of a well-formed request from an
 * owner is audited as workspace.member_refused (email, reason, mode) outside any transaction, so Admins can spot one probing which addresses have an
 * account; the answer stays the same.
 */
export async function addMember(request: Request, actorId: string, workspaceId: string, byOwner: boolean): Promise<Response> {
  const body = (await readBody(request)) ?? {};
  const email = emailOf(body.email);
  const role = body.role ?? 'member';
  if (!email || !isRole(role) || (body.name !== undefined && !nameOf(body.name))) return bad('email and role (owner|member) are required; name (1 to 100 characters) creates an account');
  const name = body.name === undefined ? null : nameOf(body.name)!;
  const res = await addValid(actorId, workspaceId, byOwner, email, role, name);
  if (byOwner && !res.ok) {
    const { error } = (await res.clone().json()) as { error: string };
    await audit(pool, { actorId, action: 'workspace.member_refused', target: `workspace:${workspaceId}`, newValue: { email, reason: error, mode: name === null ? 'add' : 'create' } });
  }
  return res;
}

async function addValid(actorId: string, workspaceId: string, byOwner: boolean, email: string, role: WorkspaceRole, name: string | null): Promise<Response> {
  if (byOwner && onCompanyDomain(email)) return bad('company_email', 403);
  if (name !== null) {
    const made = await createAccount(actorId, { email, name, byOwner, workspaceId }, (tx, userId) => join(tx, actorId, workspaceId, userId, role));
    return made instanceof Response ? made : Response.json({ id: made.userId, temporaryPassword: made.password }, { status: 201, headers: { 'cache-control': 'no-store' } });
  }
  const staff = `select 1 from workspace_members where workspace_id = $2 and user_id = users.id`;
  const user = (await pool.query(`select id, role = 'admin' or exists (${staff}) as staff from users where lower(email) = $1`, [email, COMPANY_WORKSPACE_ID])).rows[0] as { id: string; staff: boolean } | undefined;
  if (!user || (byOwner && user.staff)) return bad('no_user', 404);
  if (workspaceId === COMPANY_WORKSPACE_ID && (await ownerMade(pool, user.id))) return bad('owner_made', 409);
  return withTransaction(pool, async (tx) => {
    if (!(await lockWorkspace(tx, workspaceId))) return bad('not found', 404);
    if ((await tx.query('select 1 from workspace_members where workspace_id = $1 and user_id = $2', [workspaceId, user.id])).rowCount) return bad('already_member', 409);
    await join(tx, actorId, workspaceId, user.id, role);
    return Response.json({ id: user.id }, { status: 201 });
  });
}

/** Changes a member's role (`role` set) or removes them (`role` null). The last owner can be neither demoted nor removed: 409 last_owner. */
export async function changeMember(actorId: string, workspaceId: string, userId: string, role: WorkspaceRole | null): Promise<Response> {
  return withTransaction(pool, async (tx) => {
    if (!(await lockWorkspace(tx, workspaceId))) return bad('not found', 404);
    const old = (await tx.query('select role from workspace_members where workspace_id = $1 and user_id = $2', [workspaceId, userId])).rows[0]?.role as WorkspaceRole | undefined;
    if (!old) return bad('not found', 404);
    if (old === role) return Response.json({ ok: true });
    const owners = (await tx.query(`select count(*)::int as n from workspace_members where workspace_id = $1 and role = 'owner'`, [workspaceId])).rows[0].n as number;
    if (old === 'owner' && owners <= 1) return bad('last_owner', 409);
    const target = `workspace:${workspaceId}`;
    if (role) {
      await tx.query('update workspace_members set role = $3 where workspace_id = $1 and user_id = $2', [workspaceId, userId, role]);
      await audit(tx, { actorId, action: 'workspace.member_role', target, oldValue: { userId, role: old }, newValue: { userId, role } });
    } else {
      await tx.query('delete from workspace_members where workspace_id = $1 and user_id = $2', [workspaceId, userId]);
      await audit(tx, { actorId, action: 'workspace.member_remove', target, oldValue: { userId, role: old } });
    }
    return Response.json({ ok: true });
  });
}
