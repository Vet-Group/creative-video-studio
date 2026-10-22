// The worker's S3 client for the app's own MinIO (the same bucket the web app streams from).
import { CreateBucketCommand, DeleteObjectCommand, HeadBucketCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

/** A setting from the environment, else from the repo's .env (local runs; variables already set win). */
function env(name: string): string {
  if (!process.env[name]) {
    try {
      process.loadEnvFile(new URL('../../../.env', import.meta.url));
    } catch {
      // No .env file.
    }
  }
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set; copy .env.example to .env`);
  return value;
}

let client: S3Client | undefined;
export function s3(): S3Client {
  return (client ??= new S3Client({
    endpoint: env('S3_ENDPOINT'),
    region: 'us-east-1',
    forcePathStyle: true,
    credentials: { accessKeyId: env('S3_ACCESS_KEY_ID'), secretAccessKey: env('S3_SECRET_ACCESS_KEY') },
  }));
}

export const bucketName = () => env('S3_BUCKET');

/** Creates the bucket when it is missing. */
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
