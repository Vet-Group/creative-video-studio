// Smart Remake (Feature B). Off by default: the /api/remakes routes 404 and the worker queue is not created until a deploy sets
// REA_REMAKE_ENABLED=1. Mirrors the worker's reaRemakeEnabled (apps/worker/src/remake.ts); the two tiers read the same env.
import { type Analysis, mergeShots } from '@cvs/core/analysis/breakdown';
import type { Queryable } from '@cvs/core/ledger';
import { COMPANY_WORKSPACE_ID } from '@cvs/db';
import type { SharedVideo } from '@/components/SharedVideos';
import { reaAnalyzeEnabled } from './analyze';

export const reaRemakeEnabled = (): boolean => process.env.REA_REMAKE_ENABLED === '1';

/** The Smart Remake app (/apps/smart-remake) needs the analysis it starts from and the remake it ends in. */
export const smartRemakeAppEnabled = (): boolean => reaAnalyzeEnabled() && reaRemakeEnabled();

/** What the remake routes answer for one row; `costUsd` goes out in the company workspace only (spendOf). */
export const REMAKE_COLUMNS = `id, analysis_id as "analysisId", product_asset_id as "productAssetId", shots, status, (result - 'worker' - 'fal') as result, output_asset_id as "outputAssetId",
  cost_usd as "costUsd", error, created_at as "createdAt", finished_at as "finishedAt"`;

/** A remake row as sent: what it and each of its shots cost are the company's figures, so another workspace gets a null cost and shots without one (docs/WORKSPACES.md §3). */
export const spendOf = <T extends { costUsd: unknown; result?: unknown }>(row: T, workspaceId: string): T => {
  if (workspaceId === COMPANY_WORKSPACE_ID) return row;
  const result = row.result as { shots?: Record<string, unknown>[] } | null | undefined;
  return { ...row, costUsd: null, ...(Array.isArray(result?.shots) && { result: { ...result, shots: result.shots.map(({ costUsd: _cost, ...shot }) => shot) } }) };
};

/**
 * The shelf of reference videos an Admin shared in a workspace, newest share first, with only what a card shows (no owner, cost or result). One whose
 * source video was deleted cannot be remade, so it leaves the shelf. GET /api/analyses?shared=1 answers it, and /analyze renders it with the page.
 */
export async function sharedVideos(q: Queryable, workspaceId: string): Promise<SharedVideo[]> {
  const { rows } = await q.query(
    `select id, shared_title as title, shared_at as "sharedAt", result,
            (select a.id from assets a where a.s3_key = analyses.source_key and a.workspace_id = analyses.workspace_id) as "sourceAssetId"
       from analyses
      where workspace_id = $1 and shared_at is not null and exists (select 1 from assets a where a.s3_key = analyses.source_key and a.workspace_id = $1 and a.deleted_at is null)
      order by shared_at desc limit 50`,
    [workspaceId],
  );
  return rows.map(({ result, ...r }) => ({ ...r, durationS: (result as Analysis).durationS ?? null, sceneCount: mergeShots(result as Analysis).shots.length }));
}
