// The MCP server of /api/mcp: one fresh McpServer per request (stateless), the 15 tools of lib/mcp/tools.ts with JSON-schema inputs. Each tool call writes
// one agent.tool audit row (tool, a digest of its arguments, outcome); never the arguments themselves, which may hold a confirm token or file bytes.
import { createHash } from 'node:crypto';
import { audit } from '@cvs/core/audit';
import { fromJsonSchema, McpServer } from '@modelcontextprotocol/server';
import { canonicalJSON, limited } from '@/lib/agent-access';
import { pool } from '@/lib/auth';
import { mcpSession } from './context';
import { type Outcome, TOOLS } from './tools';

export const INSTRUCTIONS =
  'Creative Video Studio (CVS). Call whoami first. Paid tools (job_create, analysis_create, remake_create) run in two steps: call without confirmToken (dry run), show the estimate to the user, then call again with the same arguments and the returned confirmToken. A confirm_used error means that token was spent: check job_get before trying again. Lists return 20 items at most with nextCursor.';

const result = (o: Outcome) => ({ content: [{ type: 'text' as const, text: JSON.stringify(o.data) }], structuredContent: o.data, ...(o.error && { isError: true }) });

/** The sessions (one per /api/mcp request) whose first tool call ran: that one was paid by the request's own unit of `req:<tokenId>`, every further one pays its own. */
const paidByRequest = new WeakSet<object>();

export function createServer(): McpServer {
  const server = new McpServer({ name: 'cvs', title: 'Creative Video Studio', version: '1.0.0' }, { instructions: INSTRUCTIONS });
  for (const tool of TOOLS) {
    server.registerTool(
      tool.name,
      { title: tool.title, description: tool.description, inputSchema: fromJsonSchema(tool.input), annotations: { title: tool.title, ...tool.annotations } },
      async (args: unknown) => {
        const session = mcpSession();
        const started = Date.now();
        let outcome: Outcome;
        // The endpoint refuses batches; should one get through, its calls still count one unit each, so a request cannot fan out past the limit.
        const extra = paidByRequest.has(session);
        paidByRequest.add(session);
        const wait = extra ? limited(`req:${session.agent.tokenId}`, 120) : 0;
        try {
          outcome = wait ? { error: 'rate_limited', data: { error: 'rate_limited', retryAfterSec: wait } } : await tool.run((args ?? {}) as Record<string, unknown>);
        } catch (e) {
          console.error(`agent.tool_error ${JSON.stringify({ tokenId: session.agent.tokenId, tool: tool.name })}`, e);
          outcome = { error: 'internal_error', data: { error: 'internal_error' } };
        }
        await audit(pool, {
          actorId: session.user.id,
          action: 'agent.tool',
          target: `api_token:${session.agent.tokenId}`,
          newValue: {
            tool: tool.name,
            args: createHash('sha256').update(canonicalJSON(args ?? {})).digest('hex').slice(0, 16),
            outcome: outcome.error ?? 'ok',
            workspaceId: session.workspace?.workspaceId ?? null,
            via: 'mcp',
          },
        });
        console.info(`agent.call ${JSON.stringify({ tokenId: session.agent.tokenId, tool: tool.name, outcome: outcome.error ?? 'ok', ms: Date.now() - started })}`);
        return result(outcome);
      },
    );
  }
  return server;
}
