// Sample media for the example tiles and cards: objects under samples/ in the bucket, kept out of Git and shown only to signed-in users.
// The owner chose on 2026-10-25 to load the reference site's samples here; an Admin uploads or replaces them with PUT /api/admin/samples/<name>.
import { HeadObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { bucketName, s3 } from './storage';

export const SAMPLE_PREFIX = 'samples/';
export const MAX_SAMPLE_BYTES = 50 * 1024 * 1024;
const TYPES = { mp4: 'video/mp4', jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' } as const;

/** The content type of a valid sample name (lower-case words joined by dashes, one known extension), or null. */
export function sampleType(name: string): string | null {
  const m = /^[a-z0-9]+(?:-[a-z0-9]+)*\.(mp4|jpg|png|webp)$/.exec(name);
  return m ? TYPES[m[1] as keyof typeof TYPES] : null;
}

/** Whether the bytes look like the type their name claims: the magic numbers of JPEG, PNG, WebP and the MP4 `ftyp` box. */
export function sampleBytesMatch(type: string, b: Uint8Array): boolean {
  const at = (i: number, s: string) => [...s].every((c, k) => b[i + k] === c.charCodeAt(0));
  if (type === 'image/jpeg') return b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  if (type === 'image/png') return b[0] === 0x89 && at(1, 'PNG');
  if (type === 'image/webp') return at(0, 'RIFF') && at(8, 'WEBP');
  return at(4, 'ftyp');
}

export async function listSamples(): Promise<{ name: string; bytes: number }[]> {
  const out: { name: string; bytes: number }[] = [];
  let token: string | undefined;
  do {
    const res = await s3().send(new ListObjectsV2Command({ Bucket: bucketName(), Prefix: SAMPLE_PREFIX, ContinuationToken: token }));
    for (const o of res.Contents ?? []) if (o.Key) out.push({ name: o.Key.slice(SAMPLE_PREFIX.length), bytes: o.Size ?? 0 });
    token = res.NextContinuationToken;
  } while (token);
  return out.filter((s) => sampleType(s.name)).sort((a, b) => a.name.localeCompare(b.name));
}

export async function headSample(name: string): Promise<{ bytes: number } | null> {
  try {
    const res = await s3().send(new HeadObjectCommand({ Bucket: bucketName(), Key: SAMPLE_PREFIX + name }));
    return { bytes: res.ContentLength ?? 0 };
  } catch (e) {
    if ((e as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404) return null;
    throw e;
  }
}
