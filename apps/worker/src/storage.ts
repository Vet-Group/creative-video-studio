// The worker's S3 client for the app's own MinIO (the same bucket the web app streams from).
import { createWriteStream } from 'node:fs';
import type { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { CreateBucketCommand, DeleteObjectCommand, GetObjectCommand, HeadBucketCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

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

// Cloudflare R2 holds the direct browser uploads that the web app presigns (large videos). The asset's s3_key carries an
// `r2:` prefix, so the worker reads such a source from R2 by the key alone — see apps/web/src/lib/storage.ts.
const R2 = 'r2:';
let r2Client: S3Client | undefined;
function r2(): S3Client {
  return (r2Client ??= new S3Client({
    endpoint: env('R2_ENDPOINT'),
    region: 'auto',
    forcePathStyle: true,
    credentials: { accessKeyId: env('R2_ACCESS_KEY_ID'), secretAccessKey: env('R2_SECRET_ACCESS_KEY') },
  }));
}

/** The client, bucket and real object key for a stored key, reading the `r2:` prefix that marks an R2 object. */
function loc(key: string): { client: S3Client; Bucket: string; Key: string } {
  return key.startsWith(R2) ? { client: r2(), Bucket: env('R2_BUCKET'), Key: key.slice(R2.length) } : { client: s3(), Bucket: bucketName(), Key: key };
}

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
  const { client, Bucket, Key } = loc(key);
  await client.send(new PutObjectCommand({ Bucket, Key, Body: body, ContentType: contentType }));
}

export async function getObject(key: string): Promise<Uint8Array> {
  const { client, Bucket, Key } = loc(key);
  const res = await client.send(new GetObjectCommand({ Bucket, Key }));
  return res.Body!.transformToByteArray();
}

/** Streams a stored object into `file`, so a large video never sits in memory; `signal` gives up on a read that stalls. */
export async function downloadObject(key: string, file: string, signal?: AbortSignal): Promise<void> {
  const { client, Bucket, Key } = loc(key);
  const res = await client.send(new GetObjectCommand({ Bucket, Key }), { abortSignal: signal });
  await pipeline(res.Body as Readable, createWriteStream(file), { signal });
}

export async function hasObject(key: string): Promise<boolean> {
  const { client, Bucket, Key } = loc(key);
  try {
    await client.send(new HeadObjectCommand({ Bucket, Key }));
    return true;
  } catch (e) {
    if ((e as { name?: string }).name === 'NotFound') return false;
    throw e;
  }
}

export async function deleteObject(key: string): Promise<void> {
  const { client, Bucket, Key } = loc(key);
  await client.send(new DeleteObjectCommand({ Bucket, Key }));
}
