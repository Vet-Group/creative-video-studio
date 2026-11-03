// Provider balances for Admin Costs and the worker's Replicate guard (docs/ops/provider-balances.md). No provider has an API to buy credit, so
// the app only shows the balances, warns when one is low and links to each provider's billing page.
import type { Queryable } from '../ledger';
import { boundedText, timeout, type Fetch } from './http';

export const BILLING_URLS = {
  fal: 'https://fal.ai/dashboard/billing',
  vertex: 'https://console.cloud.google.com/billing',
  replicate: 'https://replicate.com/account/billing',
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

export interface ReplicateCredit {
  creditUsd: string;
  /** When the Admin entered the credit (ISO time). */
  since: string;
  spentUsd: string;
  remainingUsd: number;
}

/**
 * Replicate has no balance API (GET /v1/account/billing answers 404), so remaining = the Admin-entered balance minus the replicate spending of
 * the credit period: every ledger row of a job created after the balance was entered (holds of jobs in flight included), and the rows without a
 * job (bake-off, manual) booked after it. A job sent before belongs to the old balance even when it settles later; an invoice difference is a
 * month's correction, not spending from this balance. Null when no balance was entered.
 */
export async function replicateCredit(q: Queryable): Promise<ReplicateCredit | null> {
  const { rows } = await q.query(
    `select s.replicate_credit_usd::text as "creditUsd", s.replicate_credit_since as since, coalesce(sum(c.usd), 0)::numeric(12, 4)::text as "spentUsd",
            (s.replicate_credit_usd - coalesce(sum(c.usd), 0))::text as remaining
       from settings s
       left join cost_entries c on c.provider = 'replicate' and c.kind <> 'invoice_diff'
            and case when c.job_id is null then c.created_at > s.replicate_credit_since
                     else exists (select 1 from jobs j where j.id = c.job_id and j.created_at > s.replicate_credit_since) end
      where s.id = 1 group by s.id`,
  );
  const r = rows[0];
  if (!r || r.creditUsd === null || r.since === null) return null;
  return { creditUsd: r.creditUsd, since: new Date(r.since).toISOString(), spentUsd: r.spentUsd, remainingUsd: Number(r.remaining) };
}
