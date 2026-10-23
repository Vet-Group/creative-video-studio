// The Lark Suite (international tenant) OAuth provider for better-auth's genericOAuth.
// UNVERIFIED against a live tenant: the endpoints, the JSON token request, the PKCE parameters, the scope name and the user_info fields
// (`tenant_key`, `enterprise_email`, `open_id`) follow Lark's published docs only. The D.5-lark live check is what verifies them.
import type { GenericOAuthConfig } from 'better-auth/plugins/generic-oauth';
import { rememberLarkEmail } from './account-audit';

const AUTHORIZE = 'https://accounts.larksuite.com/open-apis/authen/v1/authorize';
const TOKEN = 'https://open.larksuite.com/open-apis/authen/v2/oauth/token';
const USER_INFO = 'https://open.larksuite.com/open-apis/authen/v1/user_info';

/**
 * Sign-in is for existing users only, so nothing is created here. The token request is JSON, not the form body better-auth sends by
 * default, hence `getToken`. A profile from another tenant, or one without a company email, is refused (null): the personal `email`
 * is never read, because it is not under the company's control.
 */
export function larkOAuth(app: { appId: string; appSecret: string; tenantKey: string }): GenericOAuthConfig {
  return {
    providerId: 'lark',
    name: 'Lark',
    clientId: app.appId,
    clientSecret: app.appSecret,
    authorizationUrl: AUTHORIZE,
    scopes: ['contact:user.enterprise_email:readonly'],
    disableSignUp: true,
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
      return { id: u.open_id, email, emailVerified: true, name: u.name, image: u.avatar_url || undefined };
    },
  };
}
