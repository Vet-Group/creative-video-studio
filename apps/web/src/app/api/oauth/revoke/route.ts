import { clientIdOf, formOf, oauthEndpoint, revoke } from '@/lib/oauth';

/** RFC 7009 revocation (lib/oauth.ts revoke): always 200, whatever the token was. */
export const POST = (request: Request) =>
  oauthEndpoint(request, async () => {
    const form = await formOf(request);
    await revoke(form, clientIdOf(request, form));
    return new Response(null, { status: 200, headers: { 'cache-control': 'no-store' } });
  });
