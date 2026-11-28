import { clientIdOf, exchangeCode, formOf, OAuthError, oauthEndpoint, oauthReply, refresh } from '@/lib/oauth';

/** The token endpoint (lib/oauth.ts): `authorization_code` with PKCE, and `refresh_token` with rotation. */
export const POST = (request: Request) =>
  oauthEndpoint(request, async () => {
    const form = await formOf(request);
    const clientId = clientIdOf(request, form);
    if (!clientId) throw new OAuthError('invalid_client', 'client_id is required.');
    if (form.grant_type === 'authorization_code') return oauthReply(await exchangeCode(form, clientId));
    if (form.grant_type === 'refresh_token') return oauthReply(await refresh(form, clientId));
    throw new OAuthError('unsupported_grant_type', 'Use authorization_code or refresh_token.');
  });
