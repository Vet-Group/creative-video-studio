export type Ratio = '9:16' | '1:1';

export interface ModelConfig {
  id: string;
  provider: 'fal' | 'replicate' | 'mock';
  /** The provider's model path. */
  endpoint: string;
  label: string;
  ratios: Ratio[];
  durationsSec: number[];
  maxImages: number;
  /** For example '1080p'. */
  outputResolution: string;
  usdPerSecond: number;
  /** The response field that carries the billed amount; null when the API returns none. */
  billedAmountField: string | null;
  /** Where each fact above was read: field name to source URL and read date. */
  sources: Record<string, { url: string; readAt: string }>;
  /** Cheapest valid settings for every paid test clip (the plan's Credit thrift rule). */
  thrift?: { durationSec: number; resolution: string };
}

const FAL_KLING_PAGE = 'https://fal.ai/models/fal-ai/kling-video/o3/pro/reference-to-video';
const FAL_KLING_SCHEMA = 'https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=fal-ai/kling-video/o3/pro/reference-to-video';
const REPLICATE_PAGE = 'https://replicate.com/bytedance/seedance-2.5';
const REPLICATE_SCHEMA = 'https://api.replicate.com/v1/models/bytedance/seedance-2.5';
const READ_AT = '2026-10-23';

/**
 * The two bake-off candidates. The app offers 9:16 and 1:1 and 5-10 s clips (PRD) and sends at most 4 images,
 * so `ratios`, `durationsSec` and `maxImages` are the app's subset of what the provider accepts (see `sources`).
 */
export const BAKEOFF_MODELS: ModelConfig[] = [
  {
    id: 'fal-kling-o3-pro',
    provider: 'fal',
    endpoint: 'fal-ai/kling-video/o3/pro/reference-to-video',
    label: 'Kling o3 Pro (reference)',
    // fal accepts 16:9, 9:16 and 1:1.
    ratios: ['9:16', '1:1'],
    // fal accepts 3-15 s as strings "3".."15".
    durationsSec: [5, 6, 7, 8, 9, 10],
    // fal documents "Maximum 4 total (elements + reference images)" only for requests with a video.
    maxImages: 4,
    // fal states no output resolution and the schema has no resolution input; B.5a measures the canary clip.
    outputResolution: 'unspecified',
    // Audio off: $0.112 per second (audio on is $0.14).
    usdPerSecond: 0.112,
    // The queue status carries only metrics.inference_time and the result is the model output; no billed amount.
    billedAmountField: null,
    thrift: { durationSec: 5, resolution: 'unspecified' },
    sources: {
      ratios: { url: FAL_KLING_SCHEMA, readAt: READ_AT },
      durationsSec: { url: FAL_KLING_SCHEMA, readAt: READ_AT },
      maxImages: { url: FAL_KLING_SCHEMA, readAt: READ_AT },
      outputResolution: { url: FAL_KLING_PAGE, readAt: READ_AT },
      usdPerSecond: { url: FAL_KLING_PAGE, readAt: READ_AT },
      billedAmountField: { url: 'https://fal.ai/docs/model-apis/model-endpoints/queue', readAt: READ_AT },
    },
  },
  {
    id: 'replicate-seedance-2-5',
    provider: 'replicate',
    endpoint: 'bytedance/seedance-2.5',
    label: 'Seedance 2.5',
    // Replicate accepts 16:9, 4:3, 1:1, 3:4, 9:16, 21:9 and adaptive.
    ratios: ['9:16', '1:1'],
    // Replicate accepts an integer from -1 to 30.
    durationsSec: [5, 6, 7, 8, 9, 10],
    // The model page says "up to 30 images"; the app sends at most 4.
    maxImages: 4,
    // resolution is 480p or 720p; the app needs at least 720p.
    outputResolution: '720p',
    // non_video_in at 720p; the app sends images only.
    usdPerSecond: 0.2312,
    // A prediction has id, status, output, metrics.predict_time and so on, but no cost field.
    billedAmountField: null,
    thrift: { durationSec: 5, resolution: '720p' },
    sources: {
      ratios: { url: REPLICATE_SCHEMA, readAt: READ_AT },
      durationsSec: { url: REPLICATE_SCHEMA, readAt: READ_AT },
      maxImages: { url: REPLICATE_PAGE, readAt: READ_AT },
      outputResolution: { url: REPLICATE_SCHEMA, readAt: READ_AT },
      usdPerSecond: { url: REPLICATE_PAGE, readAt: READ_AT },
      billedAmountField: { url: 'https://replicate.com/docs/reference/http', readAt: READ_AT },
    },
  },
];

/** The first reason the model refuses a request, or null when it accepts it. */
export const validateRequest = (model: ModelConfig, req: { ratio: string; durationSec: number; imageCount: number }): string | null => {
  if (!(model.ratios as string[]).includes(req.ratio)) return `ratio ${req.ratio} is not offered`;
  if (!model.durationsSec.includes(req.durationSec)) return `duration ${req.durationSec} s is not offered`;
  if (req.imageCount < 1 || req.imageCount > model.maxImages) return `${req.imageCount} images; ${model.maxImages} at most`;
  return null;
};

/** The USD a Run of `durationSec` reserves at the model's price, as a 4-decimal string (a mock job books 0 in the ledger regardless). */
export const estimateUsd = (usdPerSecond: number | string, durationSec: number): string => (Number(usdPerSecond) * durationSec).toFixed(4);
