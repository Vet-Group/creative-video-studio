// The daily Vertex tick (docs/ops/vertex-accounts.md): read each account's billing export, pick the active account with the credits guard, and
// book Google's monthly Vertex total into the ledger. It runs in the worker process at startup and every 24 hours; no unit of its own.
import { audit } from '@cvs/core/audit';
import { bookInvoice, type LedgerPool, withTransaction } from '@cvs/core/ledger';
import { activeAccount, creditState } from '@cvs/core/providers/vertex-accounts';
import type { VertexBilling } from '@cvs/core/providers/vertex-billing';

export const VERTEX_TICK_MS = 24 * 60 * 60 * 1000;

const log = (what: string, e: unknown) => console.error(`worker: vertex ${what}:`, e instanceof Error ? e.message : e);

/** `read` answers the account's billing export; a throw counts as unreadable, like a 403. */
export async function vertexTick(pool: LedgerPool, accounts: { project: string; read: () => Promise<VertexBilling> }[], now = new Date()): Promise<void> {
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
      oldValue: { project: old, ...(why && { remainingUsd: why.remainingUsd, expiresOn: why.expiresOn }) }, newValue: { project: active },
    });
  });

  // The ledger's vertex invoice is Google's total over every account. A month is booked only when every account was read, and only once some account
  // has a row in it, so a missing export never books 0. Known limit: the export lags hours behind the jobs, so the current month's difference can
  // briefly be negative until Google catches up.
  if (!results.every((r) => r?.ok)) return;
  const read = results as Extract<VertexBilling, { ok: true }>[];
  const month = today.slice(0, 7);
  const prev = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)).toISOString().slice(0, 7);
  for (const m of now.getUTCDate() <= 5 ? [prev, month] : [month]) {
    const skus = read.flatMap((r) => r.rows.filter((x) => x.month === m));
    if (!skus.length) continue;
    await bookInvoice(pool, { month: m, provider: 'vertex', totalUsd: skus.reduce((a, x) => a + x.costUsd, 0).toFixed(4) });
  }
}
