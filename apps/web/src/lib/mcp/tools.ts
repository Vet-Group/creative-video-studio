// The 15 MCP tools (docs/AGENT-ACCESS.md "MCP"). Each one calls an existing route handler in-process (lib/mcp/context.ts), so the route's guard,
// caps, confirms and ledger apply unchanged; a tool only shapes the answer small (lists <= 20 items with a cursor, an app `url` per item).
import { tokenMonthSpend } from '@cvs/core/limits';
import * as analysisOne from '@/app/api/analyses/[id]/route';
import * as analyses from '@/app/api/analyses/route';
import * as assetUpload from '@/app/api/assets/route';
import * as finalizeVideo from '@/app/api/assets/finalize-video/route';
import * as presignVideo from '@/app/api/assets/presign-video/route';
import * as customRun from '@/app/api/custom-apps/[id]/run/route';
import * as imageModels from '@/app/api/image-models/route';
import * as jobCancel from '@/app/api/jobs/[id]/cancel/route';
import * as jobOne from '@/app/api/jobs/[id]/route';
import * as jobs from '@/app/api/jobs/route';
import * as library from '@/app/api/library/route';
import * as limits from '@/app/api/me/limits/route';
import * as models from '@/app/api/models/route';
import * as remakeOne from '@/app/api/remakes/[id]/route';
import * as remakes from '@/app/api/remakes/route';
import * as stores from '@/app/api/stores/route';
import { visibleApps } from '@/lib/apps';
import { pool } from '@/lib/auth';
import { publishedApps } from '@/lib/custom-apps-db';
import { reaRemakeEnabled } from '@/lib/remake';
import { pageOf } from '@/lib/reuse';
import { callRoute, mcpSession, type RouteAnswer } from './context';

type Json = Record<string, unknown>;
type Args = Record<string, any>; // validated against the tool's JSON schema by the SDK before `run`
/** A tool's answer: `error` set makes it a tool error (isError) the model must not read as success. */
export type Outcome = { data: Json; error?: string };
export type Annotations = { readOnlyHint: boolean; destructiveHint: boolean; idempotentHint: boolean; openWorldHint: boolean };
export type Tool = { name: string; title: string; description: string; input: Json; annotations: Annotations; run: (args: Args) => Promise<Outcome> };

const READ: Annotations = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const PAID: Annotations = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true };
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const origin = () => new URL(process.env.APP_URL!).origin;
const appUrl = (path: string) => `${origin()}${path}`;
const jobUrl = (j: Json) =>
  appUrl(j.status === 'succeeded' ? `/library?item=${encodeURIComponent(String(j.id))}` : (pageOf(String(j.feature)) ?? '/library'));
const download = (assetId: unknown) => (typeof assetId === 'string' ? `${origin()}/api/assets/${encodeURIComponent(assetId)}/content` : null);
const obj = (props: Json, required: string[] = []): Json => ({ type: 'object', properties: props, required, additionalProperties: false });
const str = (description: string, extra: Json = {}): Json => ({ type: 'string', description, ...extra });
const CURSOR = str('The nextCursor of the previous page; omit for the first page.');
const LIMIT = { type: 'integer', minimum: 1, maximum: 20, description: 'Items per page (default 20).' };
const CONFIRM = {
  dryRun: { type: 'boolean', description: 'Default true: price the run and get a confirmToken; nothing is created or charged.' },
  confirmToken: str('The confirmToken of the dry run of these exact arguments, sent only after the user agreed to the estimate.'),
};
const PAID_NOTE =
  'Paid, in two steps: call without confirmToken (dry run) to get the estimate and a confirmToken, show the estimate to the user, and only after they agree call again with the same arguments plus confirmToken.';

/** The answer of a route as a tool outcome: a dry run's 428 is a successful step with the estimate; a replayed or refused confirm is an error. */
function answer(a: RouteAnswer, shape: (body: Json) => Json): Outcome {
  const body = a.body ?? {};
  if (a.replay)
    return {
      error: 'confirm_used',
      data: { error: 'confirm_used', replay: true, message: 'Mã xác nhận này đã dùng. Kiểm tra trạng thái (job_get) trước, rồi chạy thử lại nếu việc chưa xảy ra.', firstAnswer: shape(body) },
    };
  if (a.status >= 200 && a.status < 300) return { data: shape(body) };
  if (a.status === 428 && body.error === 'confirm_required') {
    const { estimateUsd = null, confirmToken, expiresAt, tokenMonth = null } = body;
    return { data: { dryRun: true, estimateUsd, confirmToken, expiresAt, tokenMonth, next: 'Show estimateUsd to the user. Only after they agree, call again with the same arguments and this confirmToken.' } };
  }
  const error = typeof body.error === 'string' ? body.error : `http_${a.status}`;
  const next =
    error === 'confirm_used'
      ? 'Mã xác nhận này đã dùng. Kiểm tra trạng thái (job_get) trước, rồi chạy thử lại nếu việc chưa xảy ra.'
      : error === 'confirm_stale'
        ? 'The price changed: show the new estimateUsd to the user and confirm with the new confirmToken.'
        : error === 'confirm_invalid' || error === 'confirm_expired'
          ? 'Run the dry run again (no confirmToken) and confirm with its new token.'
          : undefined;
  return { error, data: { ...body, error, status: a.status, ...(next && { next }) } };
}

/** A paid create: a dry run without confirmToken, the real call with it. */
async function paid(a: Args, run: (confirm: string | undefined) => Promise<RouteAnswer>, shape: (body: Json) => Json): Promise<Outcome> {
  if (a.dryRun === false && !a.confirmToken) return { error: 'confirm_required', data: { error: 'confirm_required', next: 'Call with dryRun true first, show the estimate, then send its confirmToken.' } };
  return answer(await run(a.confirmToken), shape);
}

/** The fields of `a` named in `keys` that are set. */
const pick = (a: Args, keys: string[]): Json => Object.fromEntries(keys.filter((k) => a[k] !== undefined).map((k) => [k, a[k]]));

async function connection() {
  const s = mcpSession();
  const t = (await pool.query(`select id, name, kind, expires_at, monthly_cap_usd::text as cap from api_tokens where id = $1`, [s.agent.tokenId])).rows[0];
  return { id: t.id as string, name: t.name as string, kind: t.kind as string, expiresAt: t.expires_at, month: { usedUsd: await tokenMonthSpend(pool, t.id), capUsd: t.cap as string } };
}

export const TOOLS: Tool[] = [
  {
    name: 'whoami',
    title: 'Who am I',
    description: 'Call this first. The CVS user this connection acts as (name, email, role), its workspace, the connection (id, name, expiry) and its month spend against its USD cap.',
    input: obj({}),
    annotations: READ,
    run: async () => {
      const s = mcpSession();
      const c = await connection();
      return {
        data: {
          user: { name: s.user.name, email: s.user.email, role: s.user.role },
          workspace: s.workspace,
          connection: { id: c.id, name: c.name, kind: c.kind, expiresAt: c.expiresAt },
          tokenMonth: c.month,
          agentApi: process.env.CVS_AGENT_API !== '0',
        },
      };
    },
  },
  {
    name: 'limits_get',
    title: 'Limits',
    description: "The user's Run caps used today and this month (clips, USD) and this connection's month spend against its cap.",
    input: obj({}),
    annotations: READ,
    run: async () => {
      const r = answer(await callRoute(limits.GET, { path: '/api/me/limits' }), (b) => b);
      return r.error ? r : { data: { member: r.data, tokenMonth: (await connection()).month } };
    },
  },
  {
    name: 'models_list',
    title: 'List models',
    description:
      'The enabled models for a feature with their price and the recommended one. Video features (video, marketing, motion_control, video_edit) are priced for ratio and durationSec; image features (image, try_on and the app features from apps_list) list a price per resolution.',
    input: obj({ feature: str('Default video.'), ratio: str('Video only, default 9:16.'), durationSec: { type: 'integer', minimum: 1, maximum: 60, description: 'Video only, default 5.' } }),
    annotations: READ,
    run: async (a) => {
      const feature = a.feature ?? 'video';
      if (['video', 'marketing', 'motion_control', 'video_edit'].includes(feature)) {
        const q = new URLSearchParams({ feature, ratio: a.ratio ?? (feature === 'motion_control' || feature === 'video_edit' ? 'auto' : '9:16'), durationSec: String(a.durationSec ?? 5) });
        return answer(await callRoute(models.GET, { path: `/api/models?${q}` }), (b) => ({
          models: (b.models as Json[]).map((m) => ({ id: m.id, label: m.label, estimateUsd: m.estimateUsd, recommended: m.recommended, supported: m.supported })),
        }));
      }
      return answer(await callRoute(imageModels.GET, { path: `/api/image-models?feature=${encodeURIComponent(feature)}` }), (b) => ({
        models: (b.models as Json[]).map((m) => ({ id: m.id, label: m.label, prices: m.prices, ratios: m.ratios, maxImages: m.maxImages, recommended: m.recommended })),
      }));
    },
  },
  {
    name: 'apps_list',
    title: 'List apps',
    description: "The app features (job_create's feature) with their input slots, and the workspace's published one-tap apps (job_create's customAppId).",
    input: obj({}),
    annotations: READ,
    run: async () => {
      const s = mcpSession();
      const custom = await publishedApps(s.workspace!.workspaceId);
      const shape = (a: (typeof custom)[number] | ReturnType<typeof visibleApps>[number], customApp: boolean) => ({
        ...(customApp ? { customAppId: a.slug } : { feature: a.feature }),
        name: a.name,
        inputs: a.slots.map((sl) => sl.label),
        url: appUrl(`/apps/${a.slug}`),
      });
      return { data: { apps: visibleApps(reaRemakeEnabled()).filter((a) => !a.soon).map((a) => shape(a, false)), customApps: custom.map((a) => shape(a, true)) } };
    },
  },
  {
    name: 'stores_list',
    title: 'List stores',
    description: 'The stores this user may bill a run to (job_create storeId).',
    input: obj({}),
    annotations: READ,
    run: async () => answer(await callRoute(stores.GET, { path: '/api/stores' }), (b) => ({ stores: (b.stores as Json[]).map((x) => ({ id: x.id, name: x.name, code: x.code, mine: x.mine })) })),
  },
  {
    name: 'asset_upload',
    title: 'Upload an input',
    description:
      'Upload an input. An image: kind "image" with base64 (at most 5 MB) and mime; answers its assetId. A video: kind "video", step "presign" with contentType and size, PUT the file to the returned url, then step "finalize" with the assetId. Free.',
    input: obj(
      {
        kind: { type: 'string', enum: ['image', 'video'] },
        base64: str('Image bytes, base64.'),
        mime: { type: 'string', enum: ['image/png', 'image/jpeg', 'image/webp'] },
        filename: str('Optional file name.', { maxLength: 120 }),
        step: { type: 'string', enum: ['presign', 'finalize'] },
        contentType: { type: 'string', enum: ['video/mp4', 'video/quicktime'] },
        size: { type: 'integer', minimum: 1 },
        assetId: str('The assetId presign returned (finalize).'),
        storeId: str('Optional store of the asset.'),
      },
      ['kind'],
    ),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    run: async (a) => {
      if (a.kind === 'image') {
        if (typeof a.base64 !== 'string' || !a.mime) return { error: 'bad_input', data: { error: 'bad_input', next: 'Send base64 and mime for an image.' } };
        const bytes = Buffer.from(a.base64, 'base64');
        if (bytes.length === 0 || bytes.length > MAX_IMAGE_BYTES) return { error: 'too_large', data: { error: 'too_large', next: 'An image must be 1 byte to 5 MB.' } };
        const form = new FormData();
        form.append('file', new Blob([bytes], { type: a.mime }), a.filename ?? `upload.${a.mime.split('/')[1]}`);
        if (a.storeId) form.append('storeId', a.storeId);
        return answer(await callRoute(assetUpload.POST, { method: 'POST', path: '/api/assets', form }), (b) => {
          const asset = (b.assets as Json[])[0]!;
          return { assetId: asset.id, filename: asset.filename, mime: asset.mime };
        });
      }
      if (a.step === 'presign') return answer(await callRoute(presignVideo.POST, { method: 'POST', path: '/api/assets/presign-video', body: pick(a, ['contentType', 'size']) }), (b) => b);
      if (a.step === 'finalize') return answer(await callRoute(finalizeVideo.POST, { method: 'POST', path: '/api/assets/finalize-video', body: pick(a, ['assetId', 'filename', 'storeId']) }), (b) => b);
      return { error: 'bad_input', data: { error: 'bad_input', next: 'A video needs step presign, then finalize.' } };
    },
  },
  {
    name: 'job_create',
    title: 'Create a job',
    description: `Create a video or image job (Create Video, Image Generation, Try On, Marketing, an app feature) or run a one-tap app (customAppId with only assetIds). ${PAID_NOTE} Then poll job_get.`,
    input: obj({
      feature: str('Default video; see apps_list.'),
      modelId: str('See models_list.'),
      presetId: str('A motion preset (video), instead of prompt.'),
      prompt: str('The free prompt.'),
      assetIds: { type: 'array', items: { type: 'string' }, maxItems: 20, description: 'Input assets from asset_upload, in slot order.' },
      ratio: str('E.g. 9:16, 1:1, 16:9.'),
      durationSec: { type: 'integer', minimum: 1, maximum: 60 },
      storeId: str('See stores_list.'),
      enhance: { type: 'boolean' },
      params: { type: 'object', description: 'Feature-specific settings, e.g. { "resolution": "2K" }.' },
      customAppId: str('Run this one-tap app (apps_list) with only assetIds.'),
      retryOf: str('Retry this failed job.'),
      rerunOf: str('Run this job again.'),
      ...CONFIRM,
    }),
    annotations: PAID,
    run: (a) =>
      paid(
        a,
        (confirm) =>
          a.customAppId
            ? callRoute(customRun.POST, { method: 'POST', path: `/api/custom-apps/${encodeURIComponent(a.customAppId)}/run`, id: a.customAppId, body: { assetIds: a.assetIds ?? [] }, confirm })
            : callRoute(jobs.POST, {
                method: 'POST',
                path: '/api/jobs',
                body: pick(a, ['feature', 'modelId', 'presetId', 'prompt', 'assetIds', 'ratio', 'durationSec', 'storeId', 'enhance', 'params', 'retryOf', 'rerunOf']),
                confirm,
              }),
        (b) => ({ jobId: b.id, status: b.status, url: jobUrl({ id: b.id, status: b.status, feature: a.feature ?? 'video' }) }),
      ),
  },
  {
    name: 'jobs_list',
    title: 'List my jobs',
    description: "The user's own jobs, newest first, 20 at most per page.",
    input: obj({ status: str('queued, submitting, running, succeeded, failed, ...'), feature: str('A feature, e.g. video or image.'), cursor: CURSOR, limit: LIMIT }),
    annotations: READ,
    run: async (a) => {
      const limit = a.limit ?? 20;
      const q = new URLSearchParams({ mine: '1', ...pick(a, ['status', 'feature']), ...(a.cursor && { before: a.cursor }) } as Record<string, string>);
      return answer(await callRoute(jobs.GET, { path: `/api/jobs?${q}` }), (b) => {
        const rows = b.jobs as Json[];
        const page = rows.slice(0, limit);
        return {
          jobs: page.map((j) => ({ id: j.id, feature: j.feature, status: j.status, modelId: j.modelId, createdAt: j.createdAt, url: jobUrl(j) })),
          nextCursor: page.length === limit && rows.length >= limit ? (page.at(-1)!.id as string) : null,
        };
      });
    },
  },
  {
    name: 'job_get',
    title: 'Get a job',
    description: 'A job: status, error, its model, the output asset and its download path (GET with the same Authorization header), and the app url.',
    input: obj({ id: str('The job id.') }, ['id']),
    annotations: READ,
    run: async (a) =>
      answer(await callRoute(jobOne.GET, { path: `/api/jobs/${encodeURIComponent(a.id)}`, id: a.id }), (b) => ({
        id: b.id,
        status: b.status,
        error: b.error,
        feature: b.feature,
        modelId: b.modelId,
        outputAssetId: b.outputAssetId,
        downloadPath: download(b.outputAssetId),
        posterAssetId: b.posterAssetId,
        url: jobUrl(b),
      })),
  },
  {
    name: 'job_cancel',
    title: 'Cancel a job',
    description: "Cancel one of the user's own jobs while it is still queued; its estimate is released. A started job cannot be canceled.",
    input: obj({ id: str('The job id.') }, ['id']),
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    run: async (a) => answer(await callRoute(jobCancel.POST, { method: 'POST', path: `/api/jobs/${encodeURIComponent(a.id)}/cancel`, id: a.id }), (b) => b),
  },
  {
    name: 'analysis_create',
    title: 'Analyze a video',
    description: `Analyze one of the user's own videos (an assetId) into scenes for remake_create. Not priced upfront; the dry run shows the connection's month spend. ${PAID_NOTE}`,
    input: obj({ sourceAssetId: str('A video asset.'), storeId: str('Optional store.'), ...CONFIRM }, ['sourceAssetId']),
    annotations: PAID,
    run: (a) =>
      paid(
        a,
        (confirm) => callRoute(analyses.POST, { method: 'POST', path: '/api/analyses', body: pick(a, ['sourceAssetId', 'storeId']), confirm }),
        (b) => ({ analysisId: b.id, url: appUrl('/analyze') }),
      ),
  },
  {
    name: 'analysis_get',
    title: 'Get an analysis',
    description: 'An analysis: status, error and a short summary of its scenes.',
    input: obj({ id: str('The analysis id.') }, ['id']),
    annotations: READ,
    run: async (a) =>
      answer(await callRoute(analysisOne.GET, { path: `/api/analyses/${encodeURIComponent(a.id)}`, id: a.id }), (b) => {
        const result = (b.result as Json | null) ?? {};
        const shots = (result.shots as Json[] | undefined) ?? [];
        return {
          id: b.id,
          status: b.status,
          error: b.error ?? null,
          summary: typeof result.summary === 'string' ? result.summary.slice(0, 300) : null,
          shotCount: shots.length,
          shots: shots.slice(0, 20).map((s) => ({ index: s.index, start: s.start, end: s.end, role: s.role, point: String(s.point ?? s.prompt ?? '').slice(0, 160) })),
          url: appUrl('/analyze'),
        };
      }),
  },
  {
    name: 'remake_create',
    title: 'Smart Remake',
    description: `Put one of the user's product images into chosen shots of a finished analysis (Smart Remake). ${PAID_NOTE}`,
    input: obj({ analysisId: str('A finished analysis.'), productAssetId: str('A product image asset.'), shots: { type: 'array', items: { type: 'integer' }, minItems: 1, description: "The scenes to remake, by the index of each scene's first shot (analysis_get)." }, ...CONFIRM }, [
      'analysisId',
      'productAssetId',
      'shots',
    ]),
    annotations: PAID,
    run: (a) =>
      paid(
        a,
        (confirm) => callRoute(remakes.POST, { method: 'POST', path: '/api/remakes', body: pick(a, ['analysisId', 'productAssetId', 'shots']), confirm }),
        (b) => ({ remakeId: b.id, url: appUrl('/apps/smart-remake') }),
      ),
  },
  {
    name: 'remake_get',
    title: 'Get a remake',
    description: 'A Smart Remake: status, error, cost and the output asset with its download path.',
    input: obj({ id: str('The remake id.') }, ['id']),
    annotations: READ,
    run: async (a) =>
      answer(await callRoute(remakeOne.GET, { path: `/api/remakes/${encodeURIComponent(a.id)}`, id: a.id }), (b) => ({
        id: b.id,
        status: b.status,
        error: b.error,
        costUsd: b.costUsd ?? null,
        outputAssetId: b.outputAssetId,
        downloadPath: download(b.outputAssetId),
        url: appUrl('/apps/smart-remake'),
      })),
  },
  {
    name: 'library_list',
    title: 'List the Library',
    description: "The workspace Library (everyone's live results), newest first, 20 at most per page.",
    input: obj({ kind: str('all (default), images, videos, or a feature.'), cursor: CURSOR, limit: LIMIT }),
    annotations: READ,
    run: async (a) => {
      const limit = a.limit ?? 20;
      const offset = Number(a.cursor ?? 0);
      if (!Number.isInteger(offset) || offset < 0) return { error: 'bad_cursor', data: { error: 'bad_cursor' } };
      const q = new URLSearchParams({ offset: String(offset), ...(a.kind && { kind: a.kind }) });
      return answer(await callRoute(library.GET, { path: `/api/library?${q}` }), (b) => {
        const rows = b.clips as Json[];
        return {
          items: rows.slice(0, limit).map((c) => ({
            id: c.id,
            feature: c.feature,
            mediaType: c.mediaType,
            createdAt: c.createdAt,
            creator: (c.creator as Json).name,
            outputAssetId: c.videoAssetId,
            url: appUrl(`/library?item=${encodeURIComponent(String(c.id))}`),
          })),
          nextCursor: rows.length > limit || b.hasMore ? String(offset + Math.min(limit, rows.length)) : null,
        };
      });
    },
  },
];
