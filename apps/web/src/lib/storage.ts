// The S3 client for the app's own MinIO (127.0.0.1 only, so every byte goes through our routes).
import { CopyObjectCommand, CreateBucketCommand, DeleteObjectCommand, GetObjectCommand, HeadBucketCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

/** A setting from the environment, else from the repo's .env (local runs; variables already set win), or undefined. */
function envOpt(name: string): string | undefined {
  if (!process.env[name]) {
    try {
      process.loadEnvFile(new URL('../../../../.env', import.meta.url));
    } catch {
      // No .env file.
    }
  }
  return process.env[name];
}

/** A required setting; throws when neither the environment nor .env has it. */
function env(name: string): string {
  const value = envOpt(name);
  if (!value) throw new Error(`${name} is not set; copy .env.example to .env`);
  return value;
}

// One client per server process; dev reloads keep it on globalThis.
const g = globalThis as unknown as { cvsS3?: S3Client };

/** The client's 50 sockets are shared by every media request: a body nobody reads (a browser that dropped a video range) frees its
 * socket after a minute of silence instead of holding it until restart, which on 2026-11-14 queued every thumbnail and sample behind it. */
export const REQUEST_HANDLER = { connectionTimeout: 5_000, requestTimeout: 60_000 };

export function s3(): S3Client {
  return (g.cvsS3 ??= new S3Client({
    endpoint: env('S3_ENDPOINT'),
    region: 'us-east-1',
    forcePathStyle: true,
    credentials: { accessKeyId: env('S3_ACCESS_KEY_ID'), secretAccessKey: env('S3_SECRET_ACCESS_KEY') },
    requestHandler: REQUEST_HANDLER,
  }));
}

export const bucketName = () => env('S3_BUCKET');

// Cloudflare R2 holds the direct browser uploads that would exceed the request-body cap (large videos): the browser PUTs
// straight to R2 with a presigned URL, so neither the app nor the tunnel caps the size. An R2 object's asset carries an
// `r2:` prefix in its s3_key, so every reader (content route, worker, purge) routes to R2 from the key alone — no schema
// column and no change at the call sites. The real R2 object key is the part after the prefix.
const R2 = 'r2:';
const h = globalThis as unknown as { cvsR2?: S3Client };
function r2(): S3Client {
  return (h.cvsR2 ??= new S3Client({
    endpoint: env('R2_ENDPOINT'),
    region: 'auto',
    forcePathStyle: true,
    credentials: { accessKeyId: env('R2_ACCESS_KEY_ID'), secretAccessKey: env('R2_SECRET_ACCESS_KEY') },
    requestHandler: REQUEST_HANDLER,
  }));
}

/** The client, bucket and real object key for a stored key, reading the `r2:` prefix that marks an R2 object. */
function loc(key: string): { client: S3Client; Bucket: string; Key: string } {
  return key.startsWith(R2) ? { client: r2(), Bucket: env('R2_BUCKET'), Key: key.slice(R2.length) } : { client: s3(), Bucket: bucketName(), Key: key };
}

/** The s3_key that marks an object as living in R2, for the `objectKey` the browser uploaded to (e.g. `assets/<id>`). */
export const r2Key = (objectKey: string) => R2 + objectKey;

/** Whether R2 is configured for direct uploads; when not (local dev, or an outage) the caller falls back to the MinIO path. */
export const r2Configured = () => Boolean(envOpt('R2_ENDPOINT') && envOpt('R2_ACCESS_KEY_ID') && envOpt('R2_SECRET_ACCESS_KEY') && envOpt('R2_BUCKET'));

/** A presigned PUT URL the browser uses to upload one object straight to R2 (10 min). The upload must send this content type. */
export async function presignR2Put(objectKey: string, contentType: string): Promise<string> {
  return getSignedUrl(r2(), new PutObjectCommand({ Bucket: env('R2_BUCKET'), Key: objectKey, ContentType: contentType }), { expiresIn: 600 });
}

/** The size and content type of a stored object, for validating a browser upload after it lands. */
export async function headObject(key: string): Promise<{ size: number; contentType?: string }> {
  const { client, Bucket, Key } = loc(key);
  const res = await client.send(new HeadObjectCommand({ Bucket, Key }));
  return { size: res.ContentLength ?? 0, contentType: res.ContentType };
}

/** Creates the bucket when it is missing (called at boot in dev, and by tests). */
export async function ensureBucket(): Promise<void> {
  const Bucket = bucketName();
  try {
    await s3().send(new HeadBucketCommand({ Bucket }));
  } catch (e) {
    if ((e as { name?: string }).name !== 'NotFound') throw e;
    await s3().send(new CreateBucketCommand({ Bucket }));
  }
}

export async function putObject(key: string, body: Uint8Array, contentType: string): Promise<void> {
  const { client, Bucket, Key } = loc(key);
  await client.send(new PutObjectCommand({ Bucket, Key, Body: body, ContentType: contentType }));
}

/** Copies an object inside the bucket on the storage server; no byte passes through the app. */
export async function copyObject(from: string, to: string): Promise<void> {
  await s3().send(new CopyObjectCommand({ Bucket: bucketName(), Key: to, CopySource: `${bucketName()}/${from}` }));
}

export async function deleteObject(key: string): Promise<void> {
  const { client, Bucket, Key } = loc(key);
  await client.send(new DeleteObjectCommand({ Bucket, Key }));
}

/** The object as a web stream; `range` is an HTTP byte range such as `bytes=0-99`. `signal` (the browser's request) ends the read and
 * frees its socket when the browser goes away mid-stream. */
export async function getObject(key: string, range?: string, signal?: AbortSignal): Promise<ReadableStream<Uint8Array>> {
  const { client, Bucket, Key } = loc(key);
  const res = await client.send(new GetObjectCommand({ Bucket, Key, Range: range }), { abortSignal: signal });
  if (!res.Body) throw new Error(`Empty body for ${key}`);
  return res.Body.transformToWebStream();
}

/** A byte range of an object as bytes (for sniffing a large upload without reading it all); `range` is `bytes=0-99`. */
export async function getRange(key: string, range: string): Promise<Uint8Array> {
  const { client, Bucket, Key } = loc(key);
  const res = await client.send(new GetObjectCommand({ Bucket, Key, Range: range }));
  if (!res.Body) throw new Error(`Empty body for ${key}`);
  return res.Body.transformToByteArray();
}
