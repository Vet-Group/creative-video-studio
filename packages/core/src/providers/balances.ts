// Provider balances for Admin Costs (docs/ops/provider-balances.md). No provider has an API to buy credit, so
// the app only shows the balances, warns when one is low and links to each provider's billing page.
import type { Queryable } from '../ledger';
import { boundedText, timeout, type Fetch } from './http';

export const BILLING_URLS = {
  fal: 'https://fal.ai/dashboard/billing',
  vertex: 'https://console.cloud.google.com/billing',
  byteplus: 'https://console.byteplus.com/finance/overview',
} as const;

/** A balance under the Admin's warning threshold shows red; an unknown one never does. */
export const isLow = (usd: number | null, warningUsd: number): boolean => usd !== null && usd < warningUsd;

export type FalBalance = { ok: true; balance: number; currency: string } | { ok: false; reason: 'no_key' | 'failed'; error: string };

/**
 * fal's credit balance: GET /v1/account/billing?expand=credits with the API key (checked 2026-11-03, answers
 * `{ username, credits: { current_balance, currency } }`). A missing key or a failed read is a result, never a throw.
 */
export async function readFalBalance(o: { key: string | undefined; fetch?: Fetch }): Promise<FalBalance> {
  if (!o.key) return { ok: false, reason: 'no_key', error: 'FAL_KEY is not set' };
  try {
    const res = await (o.fetch ?? fetch)('https://api.fal.ai/v1/account/billing?expand=credits', { signal: timeout(), headers: { Authorization: `Key ${o.key}` } });
    const text = await boundedText(res, 'fal billing', 64 * 1024);
    if (!res.ok) throw new Error(`fal billing: HTTP ${res.status} ${text.slice(0, 300)}`);
    const credits = (JSON.parse(text) as { credits?: { current_balance?: unknown; currency?: unknown } }).credits;
    if (typeof credits?.current_balance !== 'number' || !Number.isFinite(credits.current_balance) || typeof credits.currency !== 'string') {
      throw new Error('fal billing: the answer has no credits.current_balance and currency');
    }
    return { ok: true, balance: credits.current_balance, currency: credits.currency };
  } catch (e) {
    return { ok: false, reason: 'failed', error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * What fal can spend for CVS when a second key is set (FAL_KEY_NEXT, the team account that takes over once FAL_KEY's account runs out):
 * both balances summed until the worker switched (`switched`), then the second alone, since the first can no longer take jobs. Without a
 * second key it is FAL_KEY's balance, as before. Either read failing, or two currencies, is a failed read.
 */
export async function readFalBalances(o: { key: string | undefined; nextKey: string | undefined; switched: boolean; fetch?: Fetch }): Promise<FalBalance> {
  if (!o.nextKey) return readFalBalance({ key: o.key, fetch: o.fetch });
  if (o.switched) return readFalBalance({ key: o.nextKey, fetch: o.fetch });
  const [first, next] = await Promise.all([readFalBalance({ key: o.key, fetch: o.fetch }), readFalBalance({ key: o.nextKey, fetch: o.fetch })]);
  if (!first.ok) return first;
  if (!next.ok) return { ...next, error: `FAL_KEY_NEXT: ${next.error}` };
  if (first.currency !== next.currency) return { ok: false, reason: 'failed', error: `the two fal accounts are in ${first.currency} and ${next.currency}` };
  return { ok: true, balance: Math.round((first.balance + next.balance) * 100) / 100, currency: first.currency };
}

/** The one model the BytePlus Seedance 2.0 resource pack covers (2.0 fast, 2.0 mini and 2.5 are pay-as-you-go), and the pack's price per million tokens. */
export const BYTEPLUS_PACK_MODEL = 'seedance-2.0-byteplus';
const PACK_USD_PER_MTOKENS = 7;
/** A pack under 20% of its tokens or within 14 days of its expiry shows red. */
const PACK_LOW_FRACTION = 0.2;
const PACK_LOW_DAYS = 14;

export interface BytePlusPack {
  totalTokens: number;
  tokensLeft: number;
  percentLeft: number;
  usdLeft: number;
  expiresAt: string;
  expired: boolean;
  daysLeft: number;
  low: boolean;
}

/** What is left of the pack: the Admin's tokens at `asOf` minus the tokens the pack model's jobs were billed after it, never under 0 (see migration 0076). */
export function bytePlusPack(p: { totalTokens: number; tokens: number; usedSince: number; expiresAt: Date }, now: Date): BytePlusPack {
  const tokensLeft = Math.max(0, p.tokens - p.usedSince);
  const percentLeft = (tokensLeft / p.totalTokens) * 100;
  const daysLeft = (p.expiresAt.getTime() - now.getTime()) / 86_400_000;
  return {
    totalTokens: p.totalTokens,
    tokensLeft,
    percentLeft,
    usdLeft: (tokensLeft / 1e6) * PACK_USD_PER_MTOKENS,
    expiresAt: p.expiresAt.toISOString(),
    expired: daysLeft <= 0,
    daysLeft,
    low: percentLeft < PACK_LOW_FRACTION * 100 || daysLeft < PACK_LOW_DAYS,
  };
}

/**
 * The pack the Admin entered (settings.byteplus_pack_*), or null when none is. BytePlus has no API for it: the tokens of the pack model's jobs that finished after the
 * as-of moment are summed live from jobs.provider_tokens, which the worker fills from BytePlus's usage.completion_tokens when it settles the job.
 */
export async function readBytePlusPack(q: Queryable, now = new Date()): Promise<BytePlusPack | null> {
  const { rows } = await q.query(
    `select s.byteplus_pack_total_tokens as total, s.byteplus_pack_tokens as tokens, s.byteplus_pack_expires_at as expires,
            (select coalesce(sum(j.provider_tokens), 0)::float8 from jobs j where j.model = $1 and j.provider_tokens is not null and j.finished_at > s.byteplus_pack_as_of) as used
       from settings s where s.id = 1 and s.byteplus_pack_as_of is not null`,
    [BYTEPLUS_PACK_MODEL],
  );
  const r = rows[0];
  return r ? bytePlusPack({ totalTokens: r.total, tokens: r.tokens, usedSince: Number(r.used), expiresAt: new Date(r.expires) }, now) : null;
}
