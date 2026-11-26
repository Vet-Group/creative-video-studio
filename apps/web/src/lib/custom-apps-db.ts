// The queries of the custom apps (lib/custom-apps.ts is the pure half). Every statement filters on the workspace the caller resolved, also for an id the client sent.
import type { Queryable } from '@cvs/core/ledger';
import { promptLimit } from '@cvs/core/models';
import type { CustomAppInput } from '@cvs/db';
import { pool } from '@/lib/auth';
import { LIVE_CLIP } from '@/lib/clips';
import { type AppDraft, type CustomAppConfig, draftFromJob, toAppConfig } from '@/lib/custom-apps';

/** A source job as the editor and POST /api/admin/apps need it: what an app can be made of it (`draft`, or the Vietnamese reason it cannot) and what the checks read. */
export interface AppSource {
  draft: AppDraft | string;
  /** The cheaper row of the model's pair of duplicates (migration 0075), the app's model, and its label. */
  pairModel: string;
  modelLabel: string;
  maxPromptChars: number;
  inputIds: string[];
  images: { id: string; filename: string }[];
  outputAssetId: string;
  posterAssetId: string | null;
}

/** The live clip `jobId` of the workspace as an app source; null when there is none (another workspace's, deleted, purged or not succeeded). `lock` takes the row `for share`, so a clip DELETE waits for the write. */
export async function appSource(q: Queryable, jobId: string, workspaceId: string, lock = false): Promise<AppSource | null> {
  const j = (
    await q.query(
      `select j.feature, j.preset_id, j.prompt, j.enhanced_prompt, j.aspect, j.duration_s, j.params, j.input_asset_ids, j.output_asset_id, j.poster_asset_id, p.id as pair_model, p.label, p.max_prompt_chars
         from jobs j join model_configs m on m.id = j.model join model_configs p on p.id = coalesce(m.twin_of, m.id)
        where j.id = $1 and j.workspace_id = $2 and ${LIVE_CLIP}${lock ? ' for share of j' : ''}`,
      [jobId, workspaceId],
    )
  ).rows[0];
  if (!j) return null;
  const images = await q.query('select id, filename from assets where id = any($1::text[]) and workspace_id = $2 and deleted_at is null order by array_position($1::text[], id)', [j.input_asset_ids, workspaceId]);
  return {
    draft: draftFromJob({ feature: j.feature, presetId: j.preset_id, prompt: j.prompt, enhancedPrompt: j.enhanced_prompt, ratio: j.aspect, durationSec: j.duration_s, params: j.params, inputCount: j.input_asset_ids.length }),
    pairModel: j.pair_model,
    modelLabel: j.label,
    maxPromptChars: promptLimit(j.max_prompt_chars),
    inputIds: j.input_asset_ids,
    images: images.rows,
    outputAssetId: j.output_asset_id,
    posterAssetId: j.poster_asset_id,
  };
}

/** The apps whose source clip is live, with the ids of each one's pair of models (the app's model and its dearer twins). */
const LIVE_APPS = `select a.id, a.feature, a.name, a.description, a.category, a.aspect, a.duration_s, a.params, a.inputs, a.published_at, j.output_asset_id, j.poster_asset_id,
    array(select m.id from model_configs m where m.id = a.model or m.twin_of = a.model order by m.id) as pair_ids
  from custom_apps a join jobs j on j.id = a.source_job_id
  where a.workspace_id = $1 and ${LIVE_CLIP}`;

const config = (r: { [column: string]: any }): CustomAppConfig => // a pg row
  toAppConfig({ id: r.id, feature: r.feature, name: r.name, description: r.description, category: r.category, aspect: r.aspect, durationS: r.duration_s, params: r.params, inputs: r.inputs, publishedAt: r.published_at, outputAssetId: r.output_asset_id, posterAssetId: r.poster_asset_id }, r.pair_ids);

/** The workspace's published apps whose source clip is live, newest first. */
export async function publishedApps(workspaceId: string): Promise<CustomAppConfig[]> {
  return (await pool.query(`${LIVE_APPS} and a.published_at is not null order by a.published_at desc, a.id`, [workspaceId])).rows.map(config);
}

/** One app of the workspace whose source clip is live; a draft only for an Admin. Null otherwise. */
export async function customApp(id: string, workspaceId: string, isAdmin: boolean): Promise<CustomAppConfig | null> {
  const r = (await pool.query(`${LIVE_APPS} and a.id = $2 and (a.published_at is not null or $3)`, [workspaceId, id, isAdmin])).rows[0];
  return r ? config(r) : null;
}

export interface AdminAppRow {
  id: string;
  name: string;
  category: string;
  published: boolean;
  /** False once the source clip is gone. */
  sourceLive: boolean;
}

/** Every app of the workspace, drafts too, newest first. */
export async function adminApps(workspaceId: string): Promise<AdminAppRow[]> {
  const { rows } = await pool.query(
    `select a.id, a.name, a.category, a.published_at is not null as published, exists (select 1 from jobs j where j.id = a.source_job_id and ${LIVE_CLIP}) as source_live
       from custom_apps a where a.workspace_id = $1 order by a.created_at desc, a.id`,
    [workspaceId],
  );
  return rows.map((r) => ({ id: r.id, name: r.name, category: r.category, published: r.published, sourceLive: r.source_live }));
}

export interface AdminApp extends AdminAppRow {
  sourceJobId: string;
  description: string;
  prompt: string;
  inputs: CustomAppInput[];
}

/** One app of the workspace with the fields the editor changes; null for another workspace's id. */
export async function adminApp(id: string, workspaceId: string): Promise<AdminApp | null> {
  const r = (
    await pool.query(
      `select a.id, a.name, a.category, a.published_at is not null as published, exists (select 1 from jobs j where j.id = a.source_job_id and ${LIVE_CLIP}) as source_live,
              a.source_job_id, a.description, a.prompt, a.inputs
         from custom_apps a where a.id = $1 and a.workspace_id = $2`,
      [id, workspaceId],
    )
  ).rows[0];
  return r ? { id: r.id, name: r.name, category: r.category, published: r.published, sourceLive: r.source_live, sourceJobId: r.source_job_id, description: r.description, prompt: r.prompt, inputs: r.inputs } : null;
}
