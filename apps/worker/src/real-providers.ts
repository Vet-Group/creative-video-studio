// M.6: the real adapters, each wired only when its key is set, so a worker without keys still runs the mock models and the tests.
import { createFalImageProvider, createFalProvider } from '@cvs/core/providers/fal';
import type { ReadImage } from '@cvs/core/providers/http';
import { createReplicateProvider } from '@cvs/core/providers/replicate';
import type { WorkerDeps } from './worker';
import { getObject } from './storage';

/** `asset://<id>` is an input asset in MinIO: the adapters inline it as a data URL before any call to the provider. */
export const assetReader =
  (pool: WorkerDeps['pool'], read: (key: string) => Promise<Uint8Array> = getObject): ReadImage =>
  async (url) => {
    const { rows } = await pool.query('select s3_key, mime from assets where id = $1 and deleted_at is null', [url.replace(/^asset:\/\//, '')]);
    if (!rows[0]) throw new Error('asset not found');
    return { bytes: await read(rows[0].s3_key), contentType: rows[0].mime };
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
