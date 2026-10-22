// The S3 client for the app's own MinIO (127.0.0.1 only, so every byte goes through our routes).
import { CreateBucketCommand, DeleteObjectCommand, GetObjectCommand, HeadBucketCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

/** A setting from the environment, else from the repo's .env (local runs; variables already set win). */
function env(name: string): string {
  if (!process.env[name]) {
    try {
      process.loadEnvFile(new URL('../../../../.env', import.meta.url));
    } catch {
      // No .env file.
    }
  }
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set; copy .env.example to .env`);
  return value;
}

// One client per server process; dev reloads keep it on globalThis.
const g = globalThis as unknown as { cvsS3?: S3Client };

export function s3(): S3Client {
  return (g.cvsS3 ??= new S3Client({
    endpoint: env('S3_ENDPOINT'),
    region: 'us-east-1',
    forcePathStyle: true,
    credentials: { accessKeyId: env('S3_ACCESS_KEY_ID'), secretAccessKey: env('S3_SECRET_ACCESS_KEY') },
  }));
}

export const bucketName = () => env('S3_BUCKET');

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
  await s3().send(new PutObjectCommand({ Bucket: bucketName(), Key: key, Body: body, ContentType: contentType }));
}

export async function deleteObject(key: string): Promise<void> {
  await s3().send(new DeleteObjectCommand({ Bucket: bucketName(), Key: key }));
}

/** The object as a web stream; `range` is an HTTP byte range such as `bytes=0-99`. */
export async function getObject(key: string, range?: string): Promise<ReadableStream<Uint8Array>> {
  const res = await s3().send(new GetObjectCommand({ Bucket: bucketName(), Key: key, Range: range }));
  if (!res.Body) throw new Error(`Empty body for ${key}`);
  return res.Body.transformToWebStream();
}
