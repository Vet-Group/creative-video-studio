import { createMcpHandler, originValidationResponse } from '@modelcontextprotocol/server';
import { agentContext, agentSession } from '@/lib/agent-access';
import { createServer } from '@/lib/mcp/server';

// Stateless: the 2026-07-28 protocol per request, and 2025-era clients through the SDK's stateless legacy fallback (the default).
const handler = createMcpHandler(createServer, { maxRequestBodySize: 8 * 1024 * 1024 });

const unauthorized = (error: string) =>
  Response.json(
    { error },
    { status: 401, headers: { 'WWW-Authenticate': `Bearer resource_metadata="${new URL(process.env.APP_URL!).origin}/.well-known/oauth-protected-resource/api/mcp"` } },
  );

/**
 * The MCP endpoint for agent connections (docs/AGENT-ACCESS.md "MCP"). The Bearer token is resolved once here, as guard() resolves it (kill switch, revoked,
 * expired, banned, demoted, workspace), and counts once against the connection's per-minute limit; a cookie alone is 401. Each tool then calls the
 * route handlers in-process with the session in agentContext (AsyncLocalStorage), never in a header, so nothing the client sends can name another session.
 * `CVS_AGENT_API=0` answers 503.
 */
async function serve(request: Request): Promise<Response> {
  if (process.env.CVS_AGENT_API === '0') return Response.json({ error: 'agent_api_off' }, { status: 503 });
  const badOrigin = originValidationResponse(request, [new URL(process.env.APP_URL!).hostname]);
  if (badOrigin) return badOrigin;
  const agent = await agentSession(request);
  if (!agent) return unauthorized('unauthenticated');
  if (agent.error) return agent.error.status === 401 ? unauthorized(((await agent.error.json()) as { error: string }).error) : agent.error;
  const session = { ...agent.session, agent: { ...agent.session.agent!, via: 'mcp' as const } };
  return agentContext.run(session, () => handler.fetch(request));
}

export const GET = serve;
export const POST = serve;
export const DELETE = serve;
