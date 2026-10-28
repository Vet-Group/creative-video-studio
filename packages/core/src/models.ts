export type Ratio = '9:16' | '1:1' | '16:9';

export interface ModelConfig {
  id: string;
  provider: 'fal' | 'replicate' | 'mock';
  /** The provider's model path. */
  endpoint: string;
  label: string;
  ratios: Ratio[];
  durationsSec: number[];
  maxImages: number;
  /** For example '1080p'; null while unknown, which keeps the model from being enabled. */
  outputResolution: string | null;
  usdPerSecond: number;
  /** The response field that carries the billed amount; null when the API returns none. */
  billedAmountField: string | null;
  /** Where each fact above was read: field name to source URL and read date. */
  sources: Record<string, { url: string; readAt: string }>;
  /** Cheapest valid settings for every paid test clip (the plan's Credit thrift rule). */
  thrift?: { durationSec: number; resolution: string | null };
}

/** An image model: priced per image and resolution, with no durations. `ratios` may include 'auto' (follow the input). */
export interface ImageModelConfig {
  id: string;
  provider: 'fal' | 'replicate' | 'mock';
  endpoint: string;
  label: string;
  ratios: string[];
  maxImages: number;
  /** Resolution label to USD per image, for example { '1K': '0.15' }. */
  imagePrices: Record<string, string>;
  /** The job features that may use this model. */
  features: string[];
}

/**
 * The prompt of an app that has no prompt field of its own (or only an optional one), stored with the job and sent when the Run names none.
 * The two swaps send the new person as the first image and the photo to change as the second. For Background Changer it stands for "the second image is the new background".
 */
export const FEATURE_PROMPTS: Record<string, string> = {
  try_on: 'Dress the person in the first image in the garment from the other image(s). Keep the person, face, pose, body and background exactly unchanged. Do not add any text, logos or watermarks.',
  character_swap: 'replace the whole person in the second image with the person from the first image, keep the background',
  model_swap: 'replace the person in the second image with the model from the first image, keep the clothing, pose and background exactly',
  background_changer: 'Replace the background with the one in the reference image.',
  reframe: 'Extend the image to the new aspect ratio.',
  image_upscale: 'Upscale the image.',
  face_swap: 'Swap the face from the first image onto the person in the second image.',
  background_remover: 'Remove the background.',
  jewelry_try_on: 'Put the jewelry from every image but the last on the person in the last image, each piece where it is worn and at a realistic scale. Keep its design, metal colour and stones exactly, and match its reflections and shadows to the light of the photo. Keep the person, face, pose, clothing and background exactly unchanged. Do not add any text, logos or watermarks.',
};

const FAL_KLING_PAGE = 'https://fal.ai/models/fal-ai/kling-video/o3/pro/reference-to-video';
const FAL_KLING_SCHEMA = 'https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=fal-ai/kling-video/o3/pro/reference-to-video';
const REPLICATE_PAGE = 'https://replicate.com/bytedance/seedance-2.5';
const REPLICATE_SCHEMA = 'https://api.replicate.com/v1/models/bytedance/seedance-2.5';
const READ_AT = '2026-10-23';

// Migration 0013 (M.6) copies these facts into the seeded model_configs rows; packages/db/src/schema.test.ts keeps the two in step.
/**
 * The two bake-off candidates. `ratios`, `durationsSec` and `maxImages` are the app's subset of what the provider accepts (see `sources`);
 * Kling offers all of fal's, as the reference site does (migration 0022).
 */
export const BAKEOFF_MODELS: ModelConfig[] = [
  {
    id: 'kling-o3-pro',
    provider: 'fal',
    endpoint: 'fal-ai/kling-video/o3/pro/reference-to-video',
    label: 'Kling O3 Pro',
    // fal accepts 16:9, 9:16 and 1:1; Create Video still offers only 9:16 and 1:1 (the models API).
    ratios: ['9:16', '1:1', '16:9'],
    // fal accepts 3-15 s as strings "3".."15".
    durationsSec: [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
    // fal documents "Maximum 4 total (elements + reference images)" only for requests with a video; the app sends none, and takes up to 7 like the
    // reference site's Marketing Studio Advanced (migration 0022). Create Video still sends at most 4 (the jobs API).
    maxImages: 7,
    // fal states no output resolution and the schema has no resolution input; B.5a measured the canary clip at 1080x1920 (scripts/bakeoff/rubric.md).
    outputResolution: '1080p',
    // Audio off: $0.112 per second (audio on is $0.14).
    usdPerSecond: 0.112,
    // The queue status carries only metrics.inference_time and the result is the model output; no billed amount.
    billedAmountField: null,
    thrift: { durationSec: 5, resolution: '1080p' },
    sources: {
      ratios: { url: FAL_KLING_SCHEMA, readAt: '2026-10-26' },
      durationsSec: { url: FAL_KLING_SCHEMA, readAt: '2026-10-26' },
      maxImages: { url: FAL_KLING_SCHEMA, readAt: '2026-10-26' },
      outputResolution: { url: 'scripts/bakeoff/rubric.md', readAt: READ_AT },
      usdPerSecond: { url: FAL_KLING_PAGE, readAt: READ_AT },
      billedAmountField: { url: 'https://fal.ai/docs/model-apis/model-endpoints/queue', readAt: READ_AT },
    },
  },
  {
    id: 'seedance-2.5',
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

/**
 * USD per second with native audio on, by endpoint: the endpoints whose request builder sends the audio switch (fal.ts), at the price their fal model
 * page states (read 2026-10-26, https://fal.ai/models/<endpoint>), for the resolution the builder asks for. Kling O3 Pro $0.112 -> $0.14, Kling 3.0 Pro
 * $0.112 -> $0.168, Kling 2.6 Pro $0.07 -> $0.14, Veo 3.1 $0.20 -> $0.40 (720p/1080p), Seedance 1.5 Pro $1.20 -> $2.40 per million tokens (so twice the
 * stored $0.0259). Seedance 2.0 and 2.5 and FLUX 3 price by resolution and tokens only, so audio costs nothing more. The mock endpoint takes the switch
 * so the specs can drive it; a mock job books 0 regardless.
 */
export const AUDIO_USD_PER_SECOND: Record<string, number> = {
  'fal-ai/kling-video/o3/pro/reference-to-video': 0.14,
  'fal-ai/kling-video/v3/pro/image-to-video': 0.168,
  'fal-ai/kling-video/v2.6/pro/image-to-video': 0.14,
  'fal-ai/veo3.1/image-to-video': 0.4,
  'fal-ai/bytedance/seedance/v1.5/pro/image-to-video': 0.0518,
  'bytedance/seedance-2.0/us/image-to-video': 0.3034,
  'bytedance/seedance-2.0/us/reference-to-video': 0.37,
  'bytedance/seedance-2.5/us/image-to-video': 0.473,
  'bytedance/seedance-2.5/us/reference-to-video': 0.473,
  'blackforestlabs/flux-3/image-to-video': 0.29,
  'blackforestlabs/flux-3/keyframes-to-video': 0.29,
  mock: 0,
};

/** The model's price per second for a job, with audio on when `audio` is 'on' (a job's params.audio); undefined when the endpoint cannot make audio. */
export const usdPerSecondFor = (model: { endpoint: string; usdPerSecond: number | string }, audio: string | undefined): number | string | undefined =>
  audio === 'on' ? (Object.hasOwn(AUDIO_USD_PER_SECOND, model.endpoint) ? AUDIO_USD_PER_SECOND[model.endpoint] : undefined) : model.usdPerSecond;

/** The USD a Run of `durationSec` reserves at the model's price, as a 4-decimal string (a mock job books 0 in the ledger regardless). */
export const estimateUsd = (usdPerSecond: number | string, durationSec: number): string => (Number(usdPerSecond) * durationSec).toFixed(4);
