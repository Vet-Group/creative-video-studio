// The Replicate guard (docs/ops/provider-balances.md): Replicate is dropped once its prepaid credit is spent (owner decision, 2026-11-03), so with
// under 2 USD left every enabled Replicate model is turned off and its fal twin on. It runs hourly in the worker process, beside the Vertex tick.
import { audit } from '@cvs/core/audit';
import { type LedgerPool, withTransaction } from '@cvs/core/ledger';
import { replicateCredit } from '@cvs/core/providers/balances';

export const REPLICATE_STOP_USD = 2;

/** Each Replicate row and the fal row it copies (migrations 0033 and 0040; Seedance 2.5 takes 4 references on both); no column links them. */
export const FAL_TWINS: Record<string, string> = {
  'seedance-2.0-replicate': 'seedance-2.0-reference',
  'seedance-2.5': 'seedance-2.5-reference',
  'veo-3.1-replicate': 'veo-3.1',
};

/**
 * One pass, audited as the system (model.set_enabled, no actor). Returns the Replicate models it turned off: none until the Admin enters the
 * credit, while 2 USD or more remain, or once they are all off. A twin is enabled only when this worker can run fal (`falConfigured`); a twin
 * the database refuses to enable is logged and left off.
 */
export async function replicateGuard(pool: LedgerPool, falConfigured: boolean): Promise<string[]> {
  return withTransaction(pool, async (tx) => {
    // The settings lock orders this read after any Admin change to the credit, so the guard never acts on a stale balance.
    await tx.query('select 1 from settings where id = 1 for update');
    const credit = await replicateCredit(tx);
    if (!credit || credit.remainingUsd >= REPLICATE_STOP_USD) return [];
    const { rows } = await tx.query(`select id from model_configs where provider = 'replicate' and enabled order by id for update`);
    const set = async (id: string, enabled: boolean) => {
      await tx.query('update model_configs set enabled = $2, updated_at = now() where id = $1', [id, enabled]);
      await audit(tx, { actorId: null, action: 'model.set_enabled', target: `model:${id}`, oldValue: { enabled: !enabled }, newValue: { enabled, replicateRemainingUsd: credit.remainingUsd } });
    };
    for (const { id } of rows as { id: string }[]) {
      await set(id, false);
      const twin = FAL_TWINS[id];
      const off = twin && (await tx.query(`select 1 from model_configs where id = $1 and provider = 'fal' and not enabled for update`, [twin])).rowCount;
      if (!off) continue;
      if (!falConfigured) {
        console.error(`worker: replicate guard: FAL_KEY is not set, so ${twin} was not enabled in place of ${id}`);
        continue;
      }
      await tx.query('savepoint twin');
      try {
        await set(twin, true);
      } catch (e) {
        await tx.query('rollback to savepoint twin');
        console.error(`worker: replicate guard: could not enable ${twin}:`, e instanceof Error ? e.message : e);
      }
    }
    return rows.map((r) => r.id as string);
  });
}
