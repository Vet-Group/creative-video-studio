// The Lark Suite (international tenant) OAuth provider for better-auth's genericOAuth.
// UNVERIFIED against a live tenant: the endpoints, the JSON token request, the PKCE parameters, the scope name and the user_info fields
// (`tenant_key`, `enterprise_email`, `open_id`) follow Lark's published docs only. The D.5-lark live check is what verifies them.
import type { Queryable } from '@cvs/core/ledger';
import { APIError } from 'better-auth/api';
import type { GenericOAuthConfig } from 'better-auth/plugins/generic-oauth';
import { rememberLarkEmail } from './account-audit';

const AUTHORIZE = 'https://accounts.larksuite.com/open-apis/authen/v1/authorize';
const TOKEN = 'https://open.larksuite.com/open-apis/authen/v2/oauth/token';
const USER_INFO = 'https://open.larksuite.com/open-apis/authen/v1/user_info';

/**
 * Sign-up is on: a first Lark sign-in auto-provisions the account (role member, the seeded team), so internal staff need no manual
 * Admin creation. The tenant gate in getUserInfo is what keeps this safe -- only `app.tenantKey` with a company email gets through,
 * everyone else is refused (null). The token request is JSON, not the form body better-auth sends by default, hence `getToken`. The
 * personal `email` is never read, because it is not under the company's control.
 */
export function larkOAuth(app: { appId: string; appSecret: string; tenantKey: string }): GenericOAuthConfig {
  return {
    providerId: 'lark',
    name: 'Lark',
    clientId: app.appId,
    clientSecret: app.appSecret,
    authorizationUrl: AUTHORIZE,
    // user_info's enterprise_email needs contact:user.employee:readonly (Lark Suite reference for authen/v1/user_info, read 2026-10-25);
    // contact:user.enterprise_email:readonly does not exist on Lark Suite and fails the authorize page with error 20043 (D.5-lark).
    scopes: ['contact:user.employee:readonly'],
    async getToken({ code, redirectURI, codeVerifier }) {
      const res = await fetch(TOKEN, {
        method: 'POST',
        headers: { 'content-type': 'application/json; charset=utf-8' },
        body: JSON.stringify({ grant_type: 'authorization_code', client_id: app.appId, client_secret: app.appSecret, code, redirect_uri: redirectURI, code_verifier: codeVerifier }),
      });
      const body = (await res.json().catch(() => null)) as { code?: number; access_token?: string; refresh_token?: string; expires_in?: number; scope?: string; token_type?: string } | null;
      if (!res.ok || !body || (body.code ?? 0) !== 0 || !body.access_token) throw new Error(`Lark token request failed (HTTP ${res.status})`);
      return {
        tokenType: body.token_type,
        accessToken: body.access_token,
        refreshToken: body.refresh_token,
        accessTokenExpiresAt: body.expires_in ? new Date(Date.now() + body.expires_in * 1000) : undefined,
        scopes: body.scope?.split(' '),
      };
    },
    async getUserInfo(tokens) {
      const res = await fetch(USER_INFO, { headers: { authorization: `Bearer ${tokens.accessToken}` } });
      const body = (await res.json().catch(() => null)) as { code?: number; data?: { tenant_key?: string; enterprise_email?: string; open_id?: string; name?: string; avatar_url?: string } } | null;
      const u = body?.data;
      if (!res.ok || body?.code !== 0 || !u || u.tenant_key !== app.tenantKey || !u.open_id || !u.enterprise_email?.trim()) return null;
      const email = u.enterprise_email.trim().toLowerCase();
      rememberLarkEmail(u.open_id, email);
      // The tenant gate and the company email make this address trustworthy, which is why 'lark' is a trusted provider in lib/auth.ts.
      // A new account is named without the Lark role suffix; better-auth does not overwrite an existing user's name on a later sign-in.
      return { id: u.open_id, email, emailVerified: true, name: u.name && withoutRole(u.name), image: u.avatar_url || undefined };
    },
  };
}

/** A Lark display name without its role suffix: "Nguyễn Danh Khánh - Seller" is "Nguyễn Danh Khánh". */
export const withoutRole = (name: string) => name.normalize('NFC').replace(/\s+-\s+.*$/, '').replace(/\s+/g, ' ').trim();

/** A name as two sign-ins compare it: without the Lark role suffix, and in lower case. */
export const personName = (name: string) => withoutRole(name).toLowerCase();

/**
 * databaseHooks.user.create.before. A first Lark sign-in links by equal email, so a staff member whose CVS account has another address (a
 * Gmail one) would get a second, auto-provisioned account. When an existing user has the same name, the sign-in is refused instead with
 * lark_account_not_linked: the login page tells them to sign in the old way and link Lark under "Phương thức đăng nhập". Only an OAuth
 * callback creates users this way (Google has disableSignUp), so Admin-created users are never checked.
 */
export function refuseLikelyDuplicate(q: Queryable) {
  return async (user: { name?: string | null }, ctx?: { path?: string } | null) => {
    const name = personName(user.name ?? '');
    if (!ctx?.path?.startsWith('/callback/') || !name) return;
    const { rows } = await q.query('select name from users');
    if ((rows as { name: string }[]).some((r) => personName(r.name) === name)) {
      throw new APIError('FORBIDDEN', { code: 'lark_account_not_linked', message: 'A user with this name already exists; link Lark from their account' });
    }
  };
}
