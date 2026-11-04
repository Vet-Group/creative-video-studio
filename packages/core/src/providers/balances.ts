// Provider balances for Admin Costs (docs/ops/provider-balances.md). No provider has an API to buy credit, so
// the app only shows the balances, warns when one is low and links to each provider's billing page.
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
