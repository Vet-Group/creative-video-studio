// Duplicate models (migration 0075, owner decision 2026-11-06): the dearer row of a pair carries `twin_of`, the id of the cheaper row. Admin Settings does not list it,
// and the pickers offer it only in place of its twin while that twin cannot serve. The worker needs nothing: a job names one row.
import type { Queryable } from '@cvs/core/ledger';
import { estimateUsd, extraInputUsd, imagePricesFor, usdPerSecondFor } from '@cvs/core/models';

interface Twinned {
  id: string;
  provider: string;
  twin_of: string | null;
}

/** Whether a Vertex account can take jobs: the worker's credits guard keeps `settings.vertex_active_project` and sets it to null when every account has ended. */
async function vertexUsable(q: Queryable): Promise<boolean> {
  return (await q.query('select vertex_active_project is not null as on from settings where id = 1')).rows[0]?.on === true;
}

/**
 * One row of each pair, from the enabled rows of a listing: the cheaper row, or the dearer one in its place when the cheaper cannot serve, which is when
 * `locked(row)` says so (fal's balance lock; the caller knows the estimate) or it is a Vertex row while no Vertex account is usable. A disabled twin is absent from
 * `rows`, so the other row stays. The dearer row is never put in place of one that works, nor when it could not serve itself (Vertex with no account).
 */
export async function onePerPair<T extends Twinned>(q: Queryable, rows: T[], locked: (row: T) => boolean = () => false): Promise<T[]> {
  if (!rows.some((r) => r.twin_of !== null)) return rows;
  const vertexOn = await vertexUsable(q);
  const usable = (r: T) => r.provider !== 'vertex' || vertexOn;
  const byId = new Map(rows.map((r) => [r.id, r]));
  const drop = new Set<string>();
  for (const dear of rows) {
    const cheap = dear.twin_of === null ? undefined : byId.get(dear.twin_of);
    if (cheap) drop.add(usable(cheap) && !locked(cheap) ? dear.id : usable(dear) ? cheap.id : dear.id);
  }
  return rows.filter((r) => !drop.has(r.id));
}

/** Whether a new job may name model `id` now: the same choice as the pickers make (onePerPair over the row and its twins). */
export async function offeredNow(q: Queryable, id: string, locked: (row: Twinned & { kind: string; usd_per_second: string | null }) => boolean): Promise<boolean> {
  const { rows } = await q.query(
    `select id, provider, twin_of, kind, usd_per_second from model_configs
      where enabled and (id = $1 or twin_of = $1 or id = (select twin_of from model_configs where id = $1))`,
    [id],
  );
  return (await onePerPair(q, rows, locked)).some((r) => r.id === id);
}

/** The price of re-running a failed job on a twin, as the new job's estimate is made (api/jobs); null when the twin does not price the job's settings. */
export function twinEstimate(
  twin: { endpoint: string; usd_per_second: string | null; image_prices: Record<string, string> | null; thinking_levels: string[]; thinking_prices: Record<string, Record<string, string>> | null },
  job: { params: Record<string, string>; duration_s: number; inputs: number },
): string | null {
  if (job.params.resolution !== undefined) {
    const prices = imagePricesFor({ ...twin, image_prices: twin.image_prices ?? {} }, job.params.thinking);
    return Object.hasOwn(prices, job.params.resolution) ? (Number(prices[job.params.resolution]) + extraInputUsd(twin.endpoint, job.inputs)).toFixed(4) : null;
  }
  const perSecond = twin.usd_per_second === null ? undefined : usdPerSecondFor({ endpoint: twin.endpoint, usdPerSecond: twin.usd_per_second }, job.params.audio);
  return perSecond === undefined ? null : estimateUsd(perSecond, job.duration_s);
}
