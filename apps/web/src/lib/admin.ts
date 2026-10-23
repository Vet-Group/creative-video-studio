// Small helpers shared by the /api/admin routes.
import { isAPIError } from 'better-auth/api';

export const bad = (error: string, status = 400) => Response.json({ error }, { status });

/** The JSON object of a request body, or null when it is missing or not an object. */
export async function readBody(request: Request): Promise<Record<string, unknown> | null> {
  const body: unknown = await request.json().catch(() => null);
  return body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
}

/** A better-auth refusal as the response it asks for; any other error is rethrown. */
export function authFailure(e: unknown): Response {
  if (isAPIError(e)) return bad(e.message, e.statusCode);
  throw e;
}

export const pgCode = (e: unknown): string | undefined => (e as { code?: string } | null)?.code;

export const nonEmpty = (v: unknown): v is string => typeof v === 'string' && v.trim() !== '';

/** An ICT month as the ledger writes it, 'YYYY-MM'. */
export const isMonth = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);

/** A money amount from a JSON number or string with at most 4 decimals, as a 4-decimal string; null for anything else. Never goes through a float. */
export function money(v: unknown, allowNegative = false): string | null {
  const s = typeof v === 'number' || typeof v === 'string' ? String(v).trim() : '';
  if (!(allowNegative ? /^-?\d{1,8}(\.\d{1,4})?$/ : /^\d{1,8}(\.\d{1,4})?$/).test(s)) return null;
  const [whole, fraction = ''] = s.split('.');
  return `${whole}.${fraction.padEnd(4, '0')}`;
}

/** Reads the `offset` and `limit` query parameters; null when either is not a whole number in range. */
export function pageParams(url: URL, defaultLimit: number, maxLimit: number): { offset: number; limit: number } | null {
  const num = (name: string, fallback: number) => (url.searchParams.has(name) ? Number(url.searchParams.get(name)) : fallback);
  const offset = num('offset', 0);
  const limit = num('limit', defaultLimit);
  return Number.isInteger(offset) && offset >= 0 && Number.isInteger(limit) && limit >= 1 && limit <= maxLimit ? { offset, limit } : null;
}
