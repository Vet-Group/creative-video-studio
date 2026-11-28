import { createMcpHandler, originValidationResponse } from '@modelcontextprotocol/server';
import { agentContext, agentSession } from '@/lib/agent-access';
import { createServer } from '@/lib/mcp/server';
import { resourceMetadataUrl } from '@/lib/oauth';

// Stateless: the 2026-07-28 protocol per request, and 2025-era clients through the SDK's stateless legacy fallback (the default).
const handler = createMcpHandler(createServer, { maxRequestBodySize: 8 * 1024 * 1024 });

// resource_metadata points an MCP client at the OAuth sign-in (RFC 9728), so a client with no token starts it.
const unauthorized = (error: string, badToken: boolean) =>
  Response.json(
    { error },
    { status: 401, headers: { 'WWW-Authenticate': `Bearer realm="cvs", resource_metadata="${resourceMetadataUrl()}"${badToken ? ', error="invalid_token"' : ''}` } },
  );

/** True when a POST body is a JSON-RPC batch (a JSON array): only a clone's first non-blank bytes are read, at most 1 MB of them. */
async function isBatch(request: Request): Promise<boolean> {
  if (!request.body) return false;
  const reader = request.clone().body!.getReader();
  const decoder = new TextDecoder();
  for (let seen = 0; seen <= 1_000_000; ) {
    const { done, value } = await reader.read();
    if (done) return false;
    seen += value.length;
    const text = decoder.decode(value, { stream: true }).trimStart();
    if (text) {
      // Not awaited: a cloned branch's cancel settles only once the original is canceled too.
      reader.cancel().catch(() => undefined);
      return text.startsWith('[');
    }
  }
  reader.cancel().catch(() => undefined);
  return false;
}

/**
 * The MCP endpoint for agent connections (docs/AGENT-ACCESS.md "MCP"). The Bearer token is resolved once here, as guard() resolves it (kill switch, revoked,
 * expired, banned, demoted, workspace), and counts once against the connection's per-minute limit; a cookie alone is 401 and a JSON-RPC batch 400. Each tool then calls the
 * route handlers in-process with the session in agentContext (AsyncLocalStorage), never in a header, so nothing the client sends can name another session.
 * `CVS_AGENT_API=0` answers 503.
 */
async function serve(request: Request): Promise<Response> {
  if (process.env.CVS_AGENT_API === '0') return Response.json({ error: 'agent_api_off' }, { status: 503 });
  const badOrigin = originValidationResponse(request, [new URL(process.env.APP_URL!).hostname]);
  if (badOrigin) return badOrigin;
  const agent = await agentSession(request);
  if (!agent) return unauthorized('unauthenticated', false);
  if (agent.error) return agent.error.status === 401 ? unauthorized(((await agent.error.json()) as { error: string }).error, true) : agent.error;
  // The SDK's legacy path runs up to 100 batched messages at once for this one request's unit of the rate limit.
  if (await isBatch(request)) return Response.json({ error: 'batch_not_supported' }, { status: 400 });
  const session = { ...agent.session, agent: { ...agent.session.agent!, via: 'mcp' as const } };
  return agentContext.run(session, () => handler.fetch(request));
}

export const GET = serve;
export const POST = serve;
export const DELETE = serve;
