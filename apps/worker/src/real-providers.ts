// M.6: the real adapters, each wired only when its key is set, so a worker without keys still runs the mock models and the tests.
import { createFalEnhancer } from '@cvs/core/enhance';
import { createFalSuggester } from '@cvs/core/suggest';
import { createFalImageProvider, createFalProvider } from '@cvs/core/providers/fal';
import type { ReadImage } from '@cvs/core/providers/http';
import { createReplicateProvider } from '@cvs/core/providers/replicate';
import { createVertexImageProvider, type ServiceAccountKey } from '@cvs/core/providers/vertex';
import { readFileSync } from 'node:fs';
import sharp from 'sharp';
import type { WorkerDeps } from './worker';
import { getObject } from './storage';

// Inputs are inlined as base64 in the JSON body. In the bake-off Replicate reset a 3.8 MB body while 3.7 MB passed, so with up to 4 images
// each one is kept at or under 600 KB (4 x 600 KB is about 3.2 MB of base64). The videos are 1080p at most, so 2048 px loses nothing.
export const MAX_INLINE_BYTES = 600_000;
const MAX_SIDE = 2048;

/** An image that is small enough passes through untouched; a larger one is turned upright and re-encoded until it fits: JPEG, or WebP when it has transparency. */
export async function fitForInline(bytes: Uint8Array, contentType: string): Promise<{ bytes: Uint8Array; contentType: string }> {
  const { width = Infinity, height = Infinity, hasAlpha } = await sharp(bytes).metadata();
  if (bytes.byteLength <= MAX_INLINE_BYTES && Math.max(width, height) <= MAX_SIDE) return { bytes, contentType };
  for (const [side, quality] of [[MAX_SIDE, 85], [MAX_SIDE, 70], [1536, 70], [1024, 70], [768, 60]] as const) {
    const img = sharp(bytes).rotate().resize(side, side, { fit: 'inside', withoutEnlargement: true });
    const out = await (hasAlpha ? img.webp({ quality }) : img.jpeg({ quality, mozjpeg: true })).toBuffer();
    if (out.byteLength <= MAX_INLINE_BYTES) return { bytes: new Uint8Array(out), contentType: hasAlpha ? 'image/webp' : 'image/jpeg' };
  }
  throw new Error(`the image cannot be brought under ${MAX_INLINE_BYTES} bytes`);
}

/** The image turned upright and centre-cropped to `ratio` ('9:16'), for endpoints whose video follows the input image's shape. */
export async function cropToRatio(bytes: Uint8Array, ratio: string): Promise<{ bytes: Uint8Array; contentType: string }> {
  const [rw, rh] = ratio.split(':').map(Number);
  if (!rw || !rh) throw new Error(`cannot crop to ratio ${ratio}`);
  const upright = await sharp(bytes).rotate().toBuffer();
  const { width = 0, height = 0, hasAlpha } = await sharp(upright).metadata();
  const w = Math.min(width, Math.round((height * rw) / rh));
  const h = Math.min(height, Math.round((width * rh) / rw));
  const img = sharp(upright).extract({ left: Math.floor((width - w) / 2), top: Math.floor((height - h) / 2), width: w, height: h });
  const out = await (hasAlpha ? img.png() : img.jpeg({ quality: 92, mozjpeg: true })).toBuffer();
  return { bytes: new Uint8Array(out), contentType: hasAlpha ? 'image/png' : 'image/jpeg' };
}

/** `asset://<id>` is an input asset in MinIO: the adapters inline an image as a data URL before any call to the provider, cropped when asked, shrunk by fitForInline. A video passes as it is (fal uploads it). */
export const assetReader =
  (pool: WorkerDeps['pool'], read: (key: string) => Promise<Uint8Array> = getObject): ReadImage =>
  async (url, opts) => {
    const { rows } = await pool.query('select s3_key, mime from assets where id = $1 and deleted_at is null', [url.replace(/^asset:\/\//, '')]);
    if (!rows[0]) throw new Error('asset not found');
    const bytes = await read(rows[0].s3_key);
    if (rows[0].mime.startsWith('video/')) return { bytes, contentType: rows[0].mime };
    if (!opts?.ratio) return fitForInline(bytes, rows[0].mime);
    const cropped = await cropToRatio(bytes, opts.ratio);
    return fitForInline(cropped.bytes, cropped.contentType);
  };

/** fal serves the video and image models, Replicate the video ones, Vertex (a service account key file) the image ones. */
export function realProviders(pool: WorkerDeps['pool'], env: NodeJS.ProcessEnv = process.env, read?: (key: string) => Promise<Uint8Array>): Pick<WorkerDeps, 'providers' | 'imageProviders' | 'enhance' | 'suggest'> {
  const readImage = assetReader(pool, read);
  const providers: WorkerDeps['providers'] = {};
  const imageProviders: NonNullable<WorkerDeps['imageProviders']> = {};
  let enhance: WorkerDeps['enhance'];
  let suggest: WorkerDeps['suggest'];
  if (env.FAL_KEY) {
    providers.fal = createFalProvider({ apiKey: env.FAL_KEY, readImage });
    imageProviders.fal = createFalImageProvider({ apiKey: env.FAL_KEY, readImage });
    enhance = createFalEnhancer({ apiKey: env.FAL_KEY });
    suggest = createFalSuggester({ apiKey: env.FAL_KEY });
  }
  if (env.REPLICATE_API_TOKEN) providers.replicate = createReplicateProvider({ apiToken: env.REPLICATE_API_TOKEN, readImage });
  if (env.GOOGLE_APPLICATION_CREDENTIALS) {
    const key = JSON.parse(readFileSync(env.GOOGLE_APPLICATION_CREDENTIALS, 'utf8')) as ServiceAccountKey & { project_id?: string };
    const project = env.GOOGLE_CLOUD_PROJECT || key.project_id;
    if (!project) throw new Error('GOOGLE_CLOUD_PROJECT is not set and the key file has no project_id');
    imageProviders.vertex = createVertexImageProvider({ key, project, region: env.GOOGLE_CLOUD_LOCATION || undefined, readImage });
  }
  return { providers, imageProviders, enhance, suggest };
}
