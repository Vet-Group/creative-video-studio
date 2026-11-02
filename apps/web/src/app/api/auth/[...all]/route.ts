import { toNextJsHandler } from 'better-auth/next-js';
import { auth } from '@/lib/auth';

const handlers = toNextJsHandler(auth);

/**
 * The admin plugin's own HTTP endpoints (remove-user, set-role, ban-user, ...) would let an Admin session skip the audit log, the team
 * rule and "users are never deleted". The Admin routes call `auth.api` directly, so every path under /api/auth/admin is closed.
 * /list-sessions is closed too: it hands every session token to the page; /api/me/sessions lists them without. /get-access-token,
 * /refresh-token and /account-info are closed: they hand out the Google or Lark tokens, which outlive a password change.
 * /two-factor/get-totp-uri is closed: the TOTP secret is shown once, in the answer of /two-factor/enable, and never read back.
 * /two-factor/send-otp and /two-factor/verify-otp are closed: no email or SMS codes are set up, only the authenticator app.
 */
function closed(request: Request): boolean {
  try {
    return /^\/api\/auth\/+(admin(\/|$)|(list-sessions|get-access-token|refresh-token|account-info|two-factor\/+(get-totp-uri|send-otp|verify-otp))\/*$)/i.test(decodeURIComponent(new URL(request.url).pathname));
  } catch {
    return true;
  }
}

const guarded = (handler: (request: Request) => Promise<Response>) => (request: Request) =>
  closed(request) ? Promise.resolve(Response.json({ error: 'not found' }, { status: 404 })) : handler(request);

export const GET = guarded(handlers.GET);
export const POST = guarded(handlers.POST);
