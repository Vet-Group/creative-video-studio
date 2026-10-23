import { toNextJsHandler } from 'better-auth/next-js';
import { auth } from '@/lib/auth';

const handlers = toNextJsHandler(auth);

/**
 * The admin plugin's own HTTP endpoints (remove-user, set-role, ban-user, ...) would let an Admin session skip the audit log, the team
 * rule and "users are never deleted". The Admin routes call `auth.api` directly, so every path under /api/auth/admin is closed.
 */
function closed(request: Request): boolean {
  try {
    return /^\/api\/auth\/+admin(\/|$)/i.test(decodeURIComponent(new URL(request.url).pathname));
  } catch {
    return true;
  }
}

const guarded = (handler: (request: Request) => Promise<Response>) => (request: Request) =>
  closed(request) ? Promise.resolve(Response.json({ error: 'not found' }, { status: 404 })) : handler(request);

export const GET = guarded(handlers.GET);
export const POST = guarded(handlers.POST);
