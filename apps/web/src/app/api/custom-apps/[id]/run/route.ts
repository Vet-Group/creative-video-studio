import { estimateUsd } from '@cvs/core/models';
import { type RouteContext, readJson } from '@/lib/assets';
import { pool } from '@/lib/auth';
import { LIVE_CLIP } from '@/lib/clips';
import { composeAssetIds, CUSTOM_APP_CODE, hasDuplicate } from '@/lib/custom-apps';
import { offeredNow } from '@/lib/model-twins';
import { falBalance, falCreditUsd, overCredit } from '@/lib/provider-credit';
import { guard } from '@/lib/session';
import { POST as createJob } from '@/app/api/jobs/route';

const refuse = (error: string, status: number) => Response.json({ error, code: CUSTOM_APP_CODE }, { status });

/**
 * Runs a published app of the active workspace (an Admin may run a draft, to test it): `{ assetIds }`, the member's photos for the app's upload slots in order, and nothing else
 * (400 for any other key, so the prompt, model, ratio, duration, params and the rest cannot be overridden). Everything else comes from the app's row, and the job is made by
 * POST /api/jobs itself, so its checks, the caps, the ledger and the queue are the same as a direct Run's, and its answer passes through unchanged. A model of a pair of duplicates
 * runs on the row offered now (lib/model-twins.ts). The refusals made here carry `code` 'custom_app' with a Vietnamese text: 404 for an app that is not there or is a draft for a
 * member, another workspace's included; 409 when the source clip is deleted or the model is off; 400 for the wrong number of photos or one photo twice.
 */
export async function POST(request: Request, { params }: RouteContext) {
  const g = await guard(request, 'member');
  if (g.error) return g.error;
  const { id } = await params;
  const body = (await readJson(request)) as Record<string, unknown> | null;
  const assetIds = body?.assetIds;
  if (!body || Object.keys(body).length !== 1 || !Array.isArray(assetIds) || !assetIds.every((a) => typeof a === 'string')) return refuse('Yêu cầu chạy không đúng: chỉ gửi danh sách ảnh (assetIds).', 400);
  const app = (
    await pool.query(
      `select a.feature, a.model, a.prompt, a.aspect, a.duration_s, a.params, a.inputs, exists (select 1 from jobs j where j.id = a.source_job_id and ${LIVE_CLIP}) as live
         from custom_apps a where a.id = $1 and a.workspace_id = $2 and (a.published_at is not null or $3::boolean)`,
      [id, g.workspaceId, g.session.user.role === 'admin'],
    )
  ).rows[0];
  if (!app) return refuse('Không tìm thấy ứng dụng này.', 404);
  if (!app.live) return refuse('Ứng dụng này không chạy được nữa: kết quả gốc đã bị xoá.', 409);
  const slots = app.inputs.filter((i: object) => 'slot' in i).length;
  if (assetIds.length !== slots) return refuse(`Ứng dụng này cần đúng ${slots} ảnh.`, 400);
  const ids = composeAssetIds(app.inputs, assetIds);
  if (hasDuplicate(ids)) return refuse('Ảnh tải lên trùng với một ảnh khác của ứng dụng. Hãy chọn ảnh khác.', 400);
  // The row of the app's pair that a new Run may name now. The lock is the one api/jobs/route.ts passes to offeredNow: keep the two the same.
  const credit = await falCreditUsd(pool, await falBalance());
  const locked = (v: { kind: string; provider: string; usd_per_second: string | null }) => v.kind === 'video' && v.usd_per_second !== null && overCredit(v.provider, estimateUsd(v.usd_per_second, app.duration_s), credit);
  let modelId: string | undefined;
  for (const m of (await pool.query('select id from model_configs where id = $1 or twin_of = $1 or id = (select twin_of from model_configs where id = $1) order by id = $1 desc, id', [app.model])).rows) {
    if (await offeredNow(pool, m.id, locked)) {
      modelId = m.id;
      break;
    }
  }
  if (!modelId) return refuse('Mô hình của ứng dụng này đang tắt.', 409);
  const headers = new Headers(request.headers);
  headers.delete('content-length');
  return createJob(
    new Request(new URL('/api/jobs', request.url), {
      method: 'POST',
      headers,
      body: JSON.stringify({ feature: app.feature, modelId, prompt: app.prompt, ratio: app.aspect, ...(app.feature === 'video' && { durationSec: app.duration_s }), params: { ...app.params, app: id }, assetIds: ids }),
    }),
  );
}
