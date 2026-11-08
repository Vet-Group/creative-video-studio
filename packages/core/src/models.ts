export type Ratio = '9:16' | '1:1' | '16:9';

export interface ModelConfig {
  id: string;
  provider: 'fal' | 'vertex' | 'byteplus' | 'mock';
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
  provider: 'fal' | 'vertex' | 'byteplus' | 'mock';
  endpoint: string;
  label: string;
  ratios: string[];
  maxImages: number;
  /** Resolution label to USD per image, for example { '1K': '0.15' }. */
  imagePrices: Record<string, string>;
  /** The job features that may use this model. */
  features: string[];
}

/** No prompt longer than this is sent, whatever a model takes: past it the extra words rarely change the result, and a typo cannot send a novel. */
export const PROMPT_CEILING = 5000;
/** A model's prompt limit as the app applies it: its own `max_prompt_chars` under the ceiling. */
export const promptLimit = (maxPromptChars: number): number => Math.min(maxPromptChars, PROMPT_CEILING);

/** The fal text-to-image endpoint of each image edit endpoint (their schemas and prices, read 2026-10-29: the same price per image or less); a job with no input image goes there. */
export const FAL_TEXT_ENDPOINTS: Record<string, string> = {
  'fal-ai/nano-banana-pro/edit': 'fal-ai/nano-banana-pro',
  'google/nano-banana-2.1/edit': 'google/nano-banana-2.1',
  'fal-ai/nano-banana-2/edit': 'fal-ai/nano-banana-2',
  'fal-ai/nano-banana/edit': 'fal-ai/nano-banana',
  'openai/gpt-image-2/edit': 'openai/gpt-image-2',
  'bytedance/seedream/v5/pro/edit': 'bytedance/seedream/v5/pro/text-to-image',
};

/** Whether an image model makes a picture from words alone, as Fash's text-to-image examples do: a fal edit endpoint with a text twin, a Gemini model on Vertex (generateContent takes text only), or a mock. */
export const textToImage = (m: { provider: string; endpoint: string }): boolean =>
  m.provider === 'mock' || m.provider === 'byteplus' || (m.provider === 'vertex' ? m.endpoint.startsWith('gemini-') : Object.hasOwn(FAL_TEXT_ENDPOINTS, m.endpoint));

/** USD per input image after the first, by endpoint: Seedream 5.0 Pro on BytePlus (https://docs.byteplus.com/en/docs/modelark/model-pricing, read 2026-11-03); Flash input images are free. */
export const EXTRA_INPUT_IMAGE_USD: Record<string, number> = { 'dola-seedream-5-0-pro-260628': 0.003 };

/** What `images` input images add to an image job's price on this endpoint. */
export const extraInputUsd = (endpoint: string, images: number): number => (Object.hasOwn(EXTRA_INPUT_IMAGE_USD, endpoint) ? Number((EXTRA_INPUT_IMAGE_USD[endpoint]! * Math.max(0, images - 1)).toFixed(4)) : 0);

/** An image model row's prices (resolution to USD) at a thinking level: its `thinking_prices` for the level, or for the default (first) level when the job names none; else `image_prices`. */
export function imagePricesFor(
  m: { image_prices: Record<string, string>; thinking_levels: string[]; thinking_prices: Record<string, Record<string, string>> | null },
  thinking?: string,
): Record<string, string> {
  const level = thinking ?? m.thinking_levels[0];
  // Own keys only: `in` would also accept "constructor" and friends.
  return level !== undefined && m.thinking_prices && Object.hasOwn(m.thinking_prices, level) ? m.thinking_prices[level]! : m.image_prices;
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
  lingerie_try_on: 'Dress the person in the last image in the lingerie pieces from every image but the last, each piece worn as intended and fitted to the body. Keep the fabric details (lace, mesh, satin, straps, seams) and the colours exactly. Keep the face, body shape, pose, skin tone and background exactly unchanged. Do not add any text, logos or watermarks',
};

const FAL_KLING_PAGE = 'https://fal.ai/models/fal-ai/kling-video/o3/pro/reference-to-video';
const FAL_KLING_SCHEMA = 'https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=fal-ai/kling-video/o3/pro/reference-to-video';
const READ_AT = '2026-10-23';

// Migration 0013 (M.6) copies these facts into the seeded model_configs rows; packages/db/src/schema.test.ts keeps the two in step.
/**
 * The bake-off model the tests and scripts still run against. `ratios`, `durationsSec` and `maxImages` are the app's subset of what the provider
 * accepts (see `sources`); Kling offers all of fal's, as the reference site does (migration 0022). The other candidate, Seedance 2.5 on Replicate,
 * was removed with Replicate (migration 0072); its result stays in docs/BAKEOFF.md.
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
 * stored $0.0259). Seedance 2.0 and 2.5 and FLUX 3 price by resolution and tokens only, so audio costs nothing more. Veo 3.1 on Vertex (vertex-video.ts) lists $0.20 -> $0.40 per 1 count at
 * 720p, an estimate that takes one count as one second (migration 0042). Seedance 2.x on BytePlus (byteplus.ts sends generate_audio) bills the clip's
 * tokens with or without sound: the paid canary of 2026-11-08 (scripts/byteplus-canary.ts) billed 21,780 tokens a second for 5 s of Seedance 2.0 with sound
 * against the 21,600 of the silent row, so sound is the row's own price (migration 0056); Fast and Mini billed the same 21,780 in their canaries of the same day. The mock endpoint takes the switch so the specs can drive it; a mock
 * job books 0 regardless.
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
  'veo-3.1-generate-001': 0.4,
  'dreamina-seedance-2-0-260128': 0.1512,
  'dreamina-seedance-2-0-fast-260128': 0.121,
  'dreamina-seedance-2-0-mini-260615': 0.0756,
  'dreamina-seedance-2-5-260628': 0.2312,
  mock: 0,
};

/**
 * The endpoints that always make sound: their fal schemas have no audio switch, and the owner's paid test of 2026-11-04 (migration 0060) heard real
 * speech from each at the row's own price, so audio on costs the stored price and the switch cannot turn it off. Gemini Omni 1.2 Flash on Vertex
 * (vertex-omni.ts) is listed too: Google states it generates native audio and the video pages show no switch to turn it off.
 */
export const ALWAYS_AUDIO: ReadonlySet<string> = new Set(['google/gemini-omni-flash/v1.2/reference-to-video', 'gemini-omni-1.2-flash', 'minimax/h3-max/reference-to-video', 'xai/grok-imagine-video/reference-to-video', 'fal-ai/wan/v2.7/reference-to-video']);

/** The model's price per second for a job, with audio on when `audio` is 'on' (a job's params.audio); undefined when the endpoint cannot make audio. */
export const usdPerSecondFor = (model: { endpoint: string; usdPerSecond: number | string }, audio: string | undefined): number | string | undefined =>
  audio !== 'on' || ALWAYS_AUDIO.has(model.endpoint) ? model.usdPerSecond : Object.hasOwn(AUDIO_USD_PER_SECOND, model.endpoint) ? AUDIO_USD_PER_SECOND[model.endpoint] : undefined;

/**
 * What a reference video (params.videoAssetId) does to a Run's price, by endpoint, from the fal model pages (read 2026-11-06, https://fal.ai/models/<endpoint>):
 * `usd` is the price per second at 720p with a video given, `billsInput` that the reference's seconds are billed too.
 * Seedance 2.0 US Reference: $0.0168 per 1,000 tokens, tokens = height x width x (input s + output s) x 24 / 1024, x0.6 with a video input, "roughly $0.222 per
 * second" with video inputs at 720p (the $0.37 audio-on price x 0.6; the page does not say which seconds that figure counts, the formula counts input and output).
 * Seedance 2.5 US Reference: $0.0214 per 1,000 tokens, the same formula, "roughly $0.2838 per second of generated video" at 720p with video (the $0.473 x 0.6), and
 * "with video references, you will be charged for both input and output videos". Kling O3 Pro Video to Video Reference
 * (https://fal.ai/models/fal-ai/kling-video/o3/pro/video-to-video/reference): "for every second of video you generated you will be charged $0.168", with no audio
 * price and no audio switch in its schema, so audio on or off books the same. Gemini Omni Flash 1.2: "reference images and videos are not billed", so it is not here.
 * The Seedance rates are per second at the 720p tier, which is one pixel area for every ratio (a 1:1 clip is 960x960, verified 2026-11-06 in Leonardo's Seedance 2.0 size table, https://docs.leonardo.ai/v1.0/docs/seedance-20: 720p is 1280x720, 720x1280 or 960x960).
 * The Kling key is the image row's endpoint: the request builder switches to the video-to-video sibling when a video is given (fal.ts).
 */
export const VIDEO_REF_USD: Record<string, { usd: number; billsInput: boolean }> = {
  'bytedance/seedance-2.0/us/reference-to-video': { usd: 0.222, billsInput: true },
  'bytedance/seedance-2.5/us/reference-to-video': { usd: 0.2838, billsInput: true },
  'fal-ai/kling-video/o3/pro/reference-to-video': { usd: 0.168, billsInput: false },
};

/**
 * The price per second of output for a Run with a reference video of `refSec` seconds, so that rate x `durationSec` is the whole bill (the ledger and the worker
 * only know a rate per output second). An endpoint that is not in VIDEO_REF_USD keeps `usdPerSecond`.
 */
export const usdPerSecondWithVideo = (endpoint: string, usdPerSecond: number | string, durationSec: number, refSec: number): number | string =>
  Object.hasOwn(VIDEO_REF_USD, endpoint) ? (VIDEO_REF_USD[endpoint]!.usd * (durationSec + (VIDEO_REF_USD[endpoint]!.billsInput ? refSec : 0))) / durationSec : usdPerSecond;

/** The USD a Run of `durationSec` reserves at the model's price, as a 4-decimal string (a mock job books 0 in the ledger regardless). */
export const estimateUsd = (usdPerSecond: number | string, durationSec: number): string => (Number(usdPerSecond) * durationSec).toFixed(4);
