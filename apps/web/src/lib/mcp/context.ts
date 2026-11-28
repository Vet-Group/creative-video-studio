// How an MCP tool reaches the app: it calls an existing route handler in-process with a plain Request that carries no cookie and no Authorization. The
// agent session comes only from agentContext (AsyncLocalStorage, set by /api/mcp around the call), so guard(), the caps, the confirms, the ledger and
// the audit rows are the route's own.
import { agentContext, CONFIRM_HEADER, inProcessRequests, REPLAY_HEADER } from '@/lib/agent-access';
import type { RequestSession } from '@/lib/session';

type Handler = (request: Request, context: { params: Promise<{ id: string }> }) => Promise<Response>;

export type RouteCall = { method?: string; path: string; body?: unknown; form?: FormData; confirm?: string; id?: string };
export type RouteAnswer = { status: number; body: Record<string, unknown> | null; replay: boolean };

/** The agent session of the tool call under way (set by /api/mcp); a tool run outside it is a bug. */
export function mcpSession(): RequestSession & { agent: NonNullable<RequestSession['agent']> } {
  const session = agentContext.getStore();
  if (!session?.agent) throw new Error('an MCP tool ran outside agentContext');
  return session as RequestSession & { agent: NonNullable<RequestSession['agent']> };
}

/** Runs `handler` on `call` as the current agent and reads its JSON answer. */
export async function callRoute(handler: Handler, call: RouteCall): Promise<RouteAnswer> {
  mcpSession();
  const headers = new Headers();
  if (call.body !== undefined) headers.set('content-type', 'application/json');
  if (call.confirm) headers.set(CONFIRM_HEADER, call.confirm);
  const request = new Request(new URL(call.path, process.env.APP_URL), {
    method: call.method ?? 'GET',
    headers,
    body: call.form ?? (call.body === undefined ? undefined : JSON.stringify(call.body)),
  });
  inProcessRequests.add(request);
  const res = await handler(request, { params: Promise.resolve({ id: call.id ?? '' }) });
  const text = await res.text();
  let body: Record<string, unknown> | null = null;
  try {
    body = text ? (JSON.parse(text) as Record<string, unknown>) : null;
  } catch {
    body = { error: text.slice(0, 200) };
  }
  return { status: res.status, body, replay: res.headers.get(REPLAY_HEADER) === '1' };
}
