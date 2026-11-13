// Smart Remake (Feature B). Off by default: the /api/remakes routes 404 and the worker queue is not created until a deploy sets
// REA_REMAKE_ENABLED=1. Mirrors the worker's reaRemakeEnabled (apps/worker/src/remake.ts); the two tiers read the same env.
import { reaAnalyzeEnabled } from './analyze';

export const reaRemakeEnabled = (): boolean => process.env.REA_REMAKE_ENABLED === '1';

/** The Smart Remake app (/apps/smart-remake) needs the analysis it starts from and the remake it ends in. */
export const smartRemakeAppEnabled = (): boolean => reaAnalyzeEnabled() && reaRemakeEnabled();

/** What the remake routes answer for one row. */
export const REMAKE_COLUMNS = `id, analysis_id as "analysisId", product_asset_id as "productAssetId", shots, status, result, output_asset_id as "outputAssetId",
  cost_usd as "costUsd", error, created_at as "createdAt", finished_at as "finishedAt"`;
