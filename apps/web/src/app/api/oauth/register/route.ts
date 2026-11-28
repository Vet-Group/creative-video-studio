import { OAuthError, oauthEndpoint, oauthReply, registerClient } from '@/lib/oauth';

/** RFC 7591 dynamic client registration (lib/oauth.ts registerClient): 201 with the client, 429 past 10 an hour from one address. */
export const POST = (request: Request) =>
  oauthEndpoint(request, async (ip) => {
    let body: unknown;
    try {
      body = JSON.parse(await request.text());
    } catch {
      throw new OAuthError('invalid_client_metadata', 'Send the client metadata as JSON.');
    }
    const made = await registerClient(body, ip);
    if ('wait' in made) return oauthReply({ error: 'slow_down', error_description: 'Too many registrations from this address; try again later.' }, 429, { 'Retry-After': String(made.wait) });
    return oauthReply(made.client, 201);
  });
