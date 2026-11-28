import { COMPANY_WORKSPACE_ID } from '@cvs/db';
import { type AgentInfo, agentBadPath, agentDenied, agentGate, agentSession } from './agent-access';
import { auth, pool, type Session } from './auth';

/** The workspace a request acts in (docs/WORKSPACES.md §3) and the caller's role in it. */
export type Workspace = { workspaceId: string; workspaceRole: 'owner' | 'member' };
/** A session with the workspace it resolved to; null when the user is an active member of no workspace. `agent` is set only for an agent connection (guard). */
export type RequestSession = Session & { workspace: Workspace | null; agent?: AgentInfo };

type Guard = ({ session: RequestSession; error?: never } & Workspace) | { session?: never; workspaceId?: never; workspaceRole?: never; error: Response };

/** The browser's chosen workspace; it only selects among the user's own active memberships. */
export const WORKSPACE_COOKIE = 'cvs_ws';
/** The workspace a page rendered with, sent by the client on a write (lib/api.ts), so a tab left on another workspace cannot write into this one. */
export const WORKSPACE_HEADER = 'x-cvs-workspace';

/**
 * A template editor: an Admin, or a user an Admin let edit the motion presets and decide the members' proposals. The shared catalog is the company's,
 * so the flag holds only in the company workspace.
 */
export const isEditor = (user: Session['user'], workspaceId: string): boolean =>
  workspaceId === COMPANY_WORKSPACE_ID && (user.role === 'admin' || user.canEditTemplates === true);

/** True for a session an Admin opened with "sign in as" (better-auth sets impersonatedBy): it acts as the user but may not change the user's own credentials. */
export const isImpersonated = (session: Session): boolean => Boolean(session.session.impersonatedBy);

export const impersonationRefusal = () => Response.json({ error: 'not_allowed_while_impersonating' }, { status: 403 });

const IMPERSONATION_MAX_MS = 60 * 60 * 1000;
/** The only non-GET requests an Admin signed in as another Admin may send (guard): ending it, switching workspace, and the Library zip and lookbook (reads sent as POST). */
const IMPERSONATED_ADMIN_WRITES = new Set(['/api/me/stop-impersonating', '/api/me/workspace', '/api/library/zip', '/api/library/lookbook']);

const cookieValue = (headers: Headers, name: string): string | null => {
  for (const part of (headers.get('cookie') ?? '').split(';')) {
    const at = part.indexOf('=');
    if (at > 0 && part.slice(0, at).trim() === name) {
      try {
        return decodeURIComponent(part.slice(at + 1).trim());
      } catch {
        return null; // a malformed value names no workspace, so the oldest membership applies
      }
    }
  }
  return null;
};

/**
 * The workspace of a user's request, in one query: the one `requested` names if the user is a member of it and it is not disabled, else the user's oldest
 * active membership, else null. With `sharedWith` (the Admin of an impersonated session) only a workspace both are members of counts.
 */
export async function resolveWorkspace(userId: string, requested: string | null, sharedWith: string | null = null): Promise<Workspace | null> {
  const { rows } = await pool.query<{ workspace_id: string; role: Workspace['workspaceRole'] }>(
    `select m.workspace_id, m.role from workspace_members m join workspaces w on w.id = m.workspace_id
      where m.user_id = $1 and w.disabled_at is null
        and ($3::text is null or exists (select 1 from workspace_members a where a.workspace_id = m.workspace_id and a.user_id = $3))
      order by coalesce(m.workspace_id = $2, false) desc, m.created_at, m.workspace_id limit 1`,
    [userId, requested, sharedWith],
  );
  return rows[0] ? { workspaceId: rows[0].workspace_id, workspaceRole: rows[0].role } : null;
}

/**
 * The session of these headers with its workspace, or null. A session opened with "sign in as" is valid only for one hour from its start, only while the
 * Admin who opened it is still an unlocked Admin with the developer flag, and only in a workspace both share: better-auth lets the one-hour expiry slip to
 * its 7-day default when the signed dont_remember cookie is dropped, and it knows nothing of the flag or of workspaces, so all three are enforced here, for
 * every caller (`guard`, `currentUser`).
 */
export async function readSession(headers: Headers): Promise<RequestSession | null> {
  const session = await auth.api.getSession({ headers });
  if (!session) return null;
  const by = session.session.impersonatedBy ?? null;
  if (by) {
    if (Date.now() - new Date(session.session.createdAt).getTime() > IMPERSONATION_MAX_MS) return null;
    const holder = await pool.query(`select 1 from users where id = $1 and role = 'admin' and can_impersonate and banned is not true`, [by]);
    if (!holder.rowCount) return null;
  }
  const workspace = await resolveWorkspace(session.user.id, cookieValue(headers, WORKSPACE_COOKIE), by);
  if (by && !workspace) return null; // the Admin shares no active workspace with the user any more: the impersonation has ended
  return { ...session, workspace };
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
 * A request the browser itself says another origin sent: an Origin header that is not APP_URL's, or a Sec-Fetch-Site other than same-origin or none.
 * A browser sends Origin on every request that is not a GET or HEAD, and a page's script can set neither header. A client that sends neither (a script,
 * a test) is not a browser carrying someone's cookie, so it passes; the routes that call sameOrigin themselves stay stricter and refuse a missing Origin too.
 */
export function crossOrigin(request: Request): boolean {
  const site = request.headers.get('sec-fetch-site');
  if (site !== null && site !== 'same-origin' && site !== 'none') return true;
  return request.headers.get('origin') !== null && !sameOrigin(request);
}

/**
 * For API routes: 401 without a valid session (or a banned user), 403 while the user must first replace an Admin's temporary password
 * (only /api/auth stays open, for /change-password; an Admin signed in as the user is not held up by it), 403 `no_workspace` for a user in no active
 * workspace, 403 when an Admin (or a template editor, isEditor) is required and the user is not one, 403 `forbidden origin` for a write another origin sent
 * (crossOrigin), 403 `not_allowed_while_impersonating` for a write by an Admin signed in as another Admin, and 409 `workspace_changed` for a write sent by a tab that rendered another workspace than the one this request resolves to (no header:
 * no check, as from a tab opened before workspaces).
 */
export async function guard(request: Request, role: 'member' | 'editor' | 'admin'): Promise<Guard> {
  // An agent connection (Bearer token or in-process MCP call, lib/agent-access.ts) is accepted here only; without one the cookie session applies as before.
  const agent = await agentSession(request);
  if (agent?.error) return { error: agent.error };
  const session = agent ? agent.session : await readSession(request.headers);
  if (!session || session.user.banned) return { error: Response.json({ error: 'unauthenticated' }, { status: 401 }) };
  if (session.user.mustChangePassword && !isImpersonated(session)) return { error: Response.json({ error: 'password_change_required' }, { status: 403 }) };
  const { workspace } = session;
  if (!workspace) return { error: Response.json({ error: 'no_workspace' }, { status: 403 }) };
  if (session.agent && agentBadPath(new URL(request.url).pathname)) return { error: Response.json({ error: 'bad_path' }, { status: 400 }) };
  if (session.agent && agentDenied(request.method, new URL(request.url).pathname)) return { error: Response.json({ error: 'not_allowed_for_agent' }, { status: 403 }) };
  if ((role === 'admin' && session.user.role !== 'admin') || (role === 'editor' && !isEditor(session.user, workspace.workspaceId))) return { error: Response.json({ error: 'forbidden' }, { status: 403 }) };
  const write = request.method !== 'GET' && request.method !== 'HEAD';
  // A page on a sibling subdomain gets the cookie (SameSite=Lax is per site) and a text/plain body needs no preflight, so the browser's own word decides.
  // An agent request carries no session cookie (refused with both), so no browser can send it from another site.
  if (write && !session.agent && crossOrigin(request)) return { error: Response.json({ error: 'forbidden origin' }, { status: 403 }) };
  // An Admin signed in as an Admin only looks, on every route (member routes have Admin branches too): a change made here would be logged under that
  // Admin's name. Ending the impersonation, switching between the workspaces both share and the Library zip stay open.
  if (write && isImpersonated(session) && session.user.role === 'admin' && !IMPERSONATED_ADMIN_WRITES.has(new URL(request.url).pathname)) return { error: impersonationRefusal() };
  const rendered = request.headers.get(WORKSPACE_HEADER);
  if (write && rendered && rendered !== workspace.workspaceId) return { error: Response.json({ error: 'workspace_changed' }, { status: 409 }) };
  const held = session.agent && (await agentGate(request, session, workspace.workspaceId));
  if (held) return { error: held };
  return { session, ...workspace };
}
