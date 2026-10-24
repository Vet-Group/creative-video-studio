// M.6: the real adapters, each wired only when its key is set, so a worker without keys still runs the mock models and the tests.
import { createFalImageProvider, createFalProvider } from '@cvs/core/providers/fal';
import type { ReadImage } from '@cvs/core/providers/http';
import { createReplicateProvider } from '@cvs/core/providers/replicate';
import sharp from 'sharp';
import type { WorkerDeps } from './worker';
import { getObject } from './storage';

// Inputs are inlined as base64 in the JSON body. In the bake-off Replicate reset a 3.8 MB body while 3.7 MB passed, so with up to 4 images
// each one is kept at or under 600 KB (4 x 600 KB is about 3.2 MB of base64). The videos are 1080p at most, so 2048 px loses nothing.
export const MAX_INLINE_BYTES = 600_000;
const MAX_SIDE = 2048;

/** An image that is small enough passes through untouched; a larger one is turned upright, flattened on white and re-encoded as JPEG until it fits. */
export async function fitForInline(bytes: Uint8Array, contentType: string): Promise<{ bytes: Uint8Array; contentType: string }> {
  const { width = Infinity, height = Infinity } = await sharp(bytes).metadata();
  if (bytes.byteLength <= MAX_INLINE_BYTES && Math.max(width, height) <= MAX_SIDE) return { bytes, contentType };
  for (const [side, quality] of [[MAX_SIDE, 85], [MAX_SIDE, 70], [1536, 70], [1024, 70], [768, 60]] as const) {
    const out = await sharp(bytes).rotate().resize(side, side, { fit: 'inside', withoutEnlargement: true }).flatten({ background: '#ffffff' }).jpeg({ quality, mozjpeg: true }).toBuffer();
    if (out.byteLength <= MAX_INLINE_BYTES) return { bytes: new Uint8Array(out), contentType: 'image/jpeg' };
  }
  throw new Error(`the image cannot be brought under ${MAX_INLINE_BYTES} bytes`);
}

/** `asset://<id>` is an input asset in MinIO: the adapters inline it as a data URL before any call to the provider, shrunk by fitForInline. */
export const assetReader =
  (pool: WorkerDeps['pool'], read: (key: string) => Promise<Uint8Array> = getObject): ReadImage =>
  async (url) => {
    const { rows } = await pool.query('select s3_key, mime from assets where id = $1 and deleted_at is null', [url.replace(/^asset:\/\//, '')]);
    if (!rows[0]) throw new Error('asset not found');
    return fitForInline(await read(rows[0].s3_key), rows[0].mime);
  };

/** fal serves the video and image models, Replicate the video ones. */
export function realProviders(pool: WorkerDeps['pool'], env: NodeJS.ProcessEnv = process.env, read?: (key: string) => Promise<Uint8Array>): Pick<WorkerDeps, 'providers' | 'imageProviders'> {
  const readImage = assetReader(pool, read);
  const providers: WorkerDeps['providers'] = {};
  const imageProviders: NonNullable<WorkerDeps['imageProviders']> = {};
  if (env.FAL_KEY) {
    providers.fal = createFalProvider({ apiKey: env.FAL_KEY, readImage });
    imageProviders.fal = createFalImageProvider({ apiKey: env.FAL_KEY, readImage });
  }
  if (env.REPLICATE_API_TOKEN) providers.replicate = createReplicateProvider({ apiToken: env.REPLICATE_API_TOKEN, readImage });
  return { providers, imageProviders };
}
