import { TOKEN_CREATE_FRESH_MS, tokenAdmin } from '@/lib/agent-access';
import { approve, backTo, checkAuthorize, publicOrigin } from '@/lib/oauth';

const AUTHORIZE_PARAMS = ['client_id', 'redirect_uri', 'state', 'code_challenge', 'code_challenge_method', 'response_type', 'resource'] as const;

/**
 * The consent form of /oauth/authorize (an HTML form POST): an Admin's own cookie session sent from this app (tokenAdmin), never an agent (the deny set
 * covers /api/oauth). Deny goes back with error=access_denied; Allow needs a sign-in of the last 10 minutes, makes the connection and goes
 * back with the code. The authorize parameters are checked again here, as the page checked them.
 */
export async function POST(request: Request) {
  if (process.env.CVS_AGENT_API === '0') return Response.json({ error: 'agent_api_off' }, { status: 503 });
  const g = await tokenAdmin(request);
  if (g.error) return g.error;
  const form = await request.formData().catch(() => null);
  if (!form) return Response.json({ error: 'send the consent form' }, { status: 400 });
  const params = Object.fromEntries(AUTHORIZE_PARAMS.flatMap((k) => (typeof form.get(k) === 'string' ? [[k, form.get(k) as string]] : [])));
  const check = await checkAuthorize(params);
  if (check.kind === 'fatal') return Response.json({ error: `invalid_${check.reason}` }, { status: 400 });
  if (check.kind === 'error') return Response.redirect(backTo(check.redirectUri, { error: check.error, error_description: check.description, state: check.state }), 303);
  const { client, request: asked } = check;
  if (form.get('decision') !== 'allow') return Response.redirect(backTo(asked.redirectUri, { error: 'access_denied', state: asked.state }), 303);
  const page = new URL('/oauth/authorize', publicOrigin());
  for (const [k, v] of Object.entries(params)) page.searchParams.set(k, v);
  // A stale sign-in goes back to the page, which asks for a new one.
  if (Date.now() - new Date(g.session.session.createdAt).getTime() > TOKEN_CREATE_FRESH_MS) return Response.redirect(page, 303);
  const made = await approve({ userId: g.session.user.id, workspaceId: g.workspaceId, client, request: asked });
  // The page then finds no client and says the registration has expired.
  if (made === 'gone') return Response.redirect(page, 303);
  if (made === 'too_many') {
    page.searchParams.set('too_many', '1');
    return Response.redirect(page, 303);
  }
  return Response.redirect(backTo(asked.redirectUri, { code: made.code, state: asked.state }), 303);
}
