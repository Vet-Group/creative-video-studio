// Helpers for the social login specs. The Google and Lark hosts are answered here; every other fetch goes to the real one.
// The real better-auth handler runs the whole flow, so the specs test the rules in lib/auth.ts, not a stand-in.
import { vi } from 'vitest';

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
/** better-auth reads Google's id_token claims without checking the signature in the code flow, so an unsigned token is enough. */
const unsignedJwt = (claims: Record<string, unknown>) => `${b64({ alg: 'none', typ: 'JWT' })}.${b64(claims)}.`;

export interface GoogleProfile {
  sub: string;
  email: string;
  email_verified?: boolean;
  name?: string;
}
export interface LarkProfile {
  open_id: string;
  tenant_key?: string;
  enterprise_email?: string;
  email?: string;
  name?: string;
}

export function mockProviders() {
  const google = new Map<string, GoogleProfile>();
  const lark = new Map<string, LarkProfile>();
  const larkTokenRequests: Record<string, unknown>[] = [];
  let seq = 0;
  const real = globalThis.fetch;
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.hostname === 'oauth2.googleapis.com' && url.pathname === '/token') {
      const p = google.get(new URLSearchParams(String(init?.body)).get('code') ?? '');
      if (!p) return Response.json({ error: 'invalid_grant' }, { status: 400 });
      return Response.json({
        access_token: 'google-access',
        token_type: 'Bearer',
        expires_in: 3600,
        id_token: unsignedJwt({ iss: 'https://accounts.google.com', aud: 'google-client', sub: p.sub, email: p.email, email_verified: p.email_verified ?? true, name: p.name ?? p.email }),
      });
    }
    if (url.hostname === 'open.larksuite.com' && url.pathname === '/open-apis/authen/v2/oauth/token') {
      const body = JSON.parse(String(init?.body)) as Record<string, string>;
      larkTokenRequests.push(body);
      if (!lark.has(body.code!)) return Response.json({ code: 20001, error: 'invalid_grant' }, { status: 400 });
      return Response.json({ code: 0, access_token: `lark-access-${body.code}`, token_type: 'Bearer', expires_in: 7200, refresh_token: 'lark-refresh', scope: 'contact:user.employee:readonly' });
    }
    if (url.hostname === 'open.larksuite.com' && url.pathname === '/open-apis/authen/v1/user_info') {
      const token = new Headers(init?.headers).get('authorization')?.replace('Bearer lark-access-', '') ?? '';
      const p = lark.get(token);
      return p ? Response.json({ code: 0, msg: 'success', data: { name: p.open_id, ...p } }) : Response.json({ code: 99991663, msg: 'invalid token' }, { status: 401 });
    }
    return real(input, init);
  });
  return {
    /** A Google authorization code that exchanges for this profile. */
    googleCode(profile: GoogleProfile): string {
      const code = `google-code-${++seq}`;
      google.set(code, profile);
      return code;
    },
    /** A Lark authorization code that exchanges for a user whose user_info is this profile. */
    larkCode(profile: LarkProfile): string {
      const code = `lark-code-${++seq}`;
      lark.set(code, profile);
      return code;
    },
    larkTokenRequests,
  };
}

interface Route {
  GET(request: Request): Promise<Response>;
  POST(request: Request): Promise<Response>;
}

export interface Flow {
  /** The authorization URL better-auth sent the browser to. */
  authUrl: URL;
  /** Where the callback sent the browser. */
  location: URL;
  /** The `?error=` code on that location, if any. */
  error: string | null;
  /** The session cookie the callback set; empty when it set none. */
  cookie: string;
}

const pairs = (res: Response) => res.headers.getSetCookie().map((c) => c.split(';')[0]!).filter((c) => !c.endsWith('='));

/**
 * One whole social flow: the sign-in (or, with `link`, the signed-in linkSocial) call, the provider redirect back with `code`, and the
 * callback. `body` overrides what the browser sends, for example `requestSignUp: true`.
 */
export async function oauth(route: Route, o: { provider: 'google' | 'lark'; code: string; link?: { cookie: string }; body?: Record<string, unknown> }): Promise<Flow> {
  const path = o.link ? '/api/auth/link-social' : '/api/auth/sign-in/social';
  const start = await route.POST(
    new Request(`http://localhost${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://localhost', ...(o.link ? { cookie: o.link.cookie } : {}) },
      body: JSON.stringify({ provider: o.provider, callbackURL: '/create', errorCallbackURL: o.link ? '/account/sign-in-methods' : '/login', ...o.body }),
    }),
  );
  if (start.status !== 200) throw new Error(`start answered ${start.status}: ${await start.text()}`);
  const authUrl = new URL(((await start.json()) as { url: string }).url);
  const cookies = [...pairs(start), ...(o.link ? [o.link.cookie] : [])].join('; ');
  const res = await route.GET(new Request(`http://localhost/api/auth/callback/${o.provider}?code=${o.code}&state=${authUrl.searchParams.get('state')}`, { headers: { cookie: cookies } }));
  const location = new URL(res.headers.get('location') ?? '/', 'http://localhost');
  return { authUrl, location, error: location.searchParams.get('error'), cookie: pairs(res).filter((c) => c.includes('session_token')).join('; ') };
}
