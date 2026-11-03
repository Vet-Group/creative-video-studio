// The Vertex tick (docs/ops/vertex-accounts.md): read each account's billing export, pick the active account with the credits guard every hour,
// and book Google's monthly Vertex total into the ledger once a UTC day. It runs in the worker process; no unit of its own.
import { audit } from '@cvs/core/audit';
import { bookInvoice, type LedgerPool, withTransaction } from '@cvs/core/ledger';
import { activeAccount, creditState } from '@cvs/core/providers/vertex-accounts';
import type { VertexBilling } from '@cvs/core/providers/vertex-billing';

/** The guard runs hourly, so a change in Admin Settings takes effect within the hour. */
export const VERTEX_TICK_MS = 60 * 60 * 1000;

const log = (what: string, e: unknown) => console.error(`worker: vertex ${what}:`, e instanceof Error ? e.message : e);

type Account = { project: string; read: () => Promise<VertexBilling> };

/** One pass: the guard always, the booking when `book` is set. True when every account was read (so the booking, if asked, ran). `read` may throw, which counts as unreadable. */
export async function vertexTick(pool: LedgerPool, accounts: Account[], now = new Date(), { book = true } = {}): Promise<boolean> {
  const results = await Promise.all(
    accounts.map((a) =>
      a.read().then(
        (r) => {
          if (!r.ok) log(`billing ${a.project}`, `${r.reason}: ${r.error}`);
          return r;
        },
        (e) => void log(`billing ${a.project}`, e),
      ),
    ),
  );
  const { rows } = await pool.query(
    `select project_id, credit_total::text as "creditTotal", credit_currency as "creditCurrency", credit_expires_on::text as "creditExpiresOn",
            stop_when_credits_end as "stopWhenCreditsEnd" from vertex_accounts`,
  );
  const today = now.toISOString().slice(0, 10);
  const states = accounts.map((a, i) => ({ project: a.project, state: creditState(rows.find((r) => r.project_id === a.project), results[i], today) }));
  const active = activeAccount(states);
  await withTransaction(pool, async (tx) => {
    const old = (await tx.query('select vertex_active_project as p from settings where id = 1 for update')).rows[0]?.p ?? null;
    if (old === active) return;
    await tx.query('update settings set vertex_active_project = $1, updated_at = now() where id = 1', [active]);
    const why = states.find((s) => s.project === old)?.state;
    await audit(tx, {
      actorId: null, action: 'vertex.switch_account', target: 'settings:1',
      oldValue: { project: old, ...(why && { remainingUsd: why.remainingUsd, expiresOn: why.expiresOn, unverified: why.unverified }) }, newValue: { project: active },
    });
  });

  // The ledger's vertex invoice is Google's total over every account, booked as the system (audited invoice.enter, no actor). A month is booked
  // only when every account was read, and only once some account has a row in it, so a missing export never books 0.
  if (!results.every((r) => r?.ok)) return false;
  if (!book) return true;
  const read = results as Extract<VertexBilling, { ok: true }>[];
  const month = today.slice(0, 7);
  const prev = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)).toISOString().slice(0, 7);
  for (const m of now.getUTCDate() <= 5 ? [prev, month] : [month]) {
    const skus = read.flatMap((r) => r.rows.filter((x) => x.month === m));
    if (!skus.length) continue;
    const totalUsd = skus.reduce((a, x) => a + x.costUsd, 0).toFixed(4);
    if (m === month) {
      // The export lags hours behind the jobs, so mid-month Google can show less than the ledger's estimates; never lower the ledger then. The
      // previous month is final by the 5th and books whatever the difference, negative too. Same sum as bookInvoice's.
      const { rows: held } = await pool.query(`select coalesce(sum(usd), 0)::text as usd from cost_entries where month = $1 and provider = 'vertex'`, [m]);
      if (Number(totalUsd) < Number(held[0].usd)) {
        log(`invoice ${m}`, `Google's ${totalUsd} USD is below the ledger's ${held[0].usd} USD; not booked until the export catches up`);
        continue;
      }
    }
    await bookInvoice(pool, { month: m, provider: 'vertex', totalUsd }, null);
  }
  return true;
}

/** The hourly tick: the guard every time, the booking on the first tick of each UTC day whose reads all succeed (a failed read retries next hour). */
export function vertexTicker(pool: LedgerPool, accounts: Account[]): (now?: Date) => Promise<void> {
  let bookedDay = '';
  return async (now = new Date()) => {
    const day = now.toISOString().slice(0, 10);
    if (await vertexTick(pool, accounts, now, { book: day !== bookedDay })) bookedDay = day;
  };
}
