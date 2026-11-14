import { api } from './api';
import { decodeOptimizerImage, optimizeImage } from './media-optimizer';

/** The compressed copy's name: the result's own name with `-nen` and the Media Optimizer's default type (WebP). */
export const compressedName = (name: string): string => `${name.replace(/\.[^.]+$/, '')}-nen.webp`;

function save(blob: Blob, name: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}

/**
 * Saves an image result re-encoded with the Media Optimizer's defaults (WebP, original size). When that is not smaller the original is saved instead.
 * `name` is the original's download name (the asset's own filename when omitted); returns whether the compressed copy was the one saved.
 */
export async function downloadCompressed(assetId: string, name?: string): Promise<boolean> {
  const info = await api<{ mime: string; filename: string }>(`/api/assets/${assetId}`);
  const res = await fetch(`/api/assets/${assetId}/content`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const file = name ?? info.filename;
  const original = new File([await res.blob()], file, { type: info.mime });
  const bitmap = await decodeOptimizerImage(original);
  try {
    const compressed = await optimizeImage(bitmap, bitmap.width, bitmap.height, 'image/webp');
    const smaller = compressed.size < original.size;
    save(smaller ? compressed : original, smaller ? compressedName(file) : file);
    return smaller;
  } finally {
    bitmap.close();
  }
}

const POLL_MS = 2_000;
const GIVE_UP_MS = 10 * 60_000; // the worker's own expiry for one compression

function open(url: string, name?: string) {
  const a = document.createElement('a');
  a.href = url;
  if (name) a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
}

/**
 * Saves a video result compressed by the worker (POST /api/assets/[id]/compress, then polls): made once and kept, so the next click is quick. When the copy
 * is not enough smaller the original is saved instead. `name` is the original's download name; returns whether the compressed copy was the one saved.
 */
export async function downloadCompressedVideo(assetId: string, name?: string): Promise<boolean> {
  const path = `/api/assets/${assetId}/compress`;
  type Reply = { status: 'ready' | 'working' | 'original' | 'failed' | 'none'; downloadUrl?: string };
  let r = await api<Reply>(path, { method: 'POST' });
  for (const until = Date.now() + GIVE_UP_MS; r.status === 'working' && Date.now() < until; ) {
    await new Promise((go) => setTimeout(go, POLL_MS));
    r = await api<Reply>(path);
  }
  if (r.status === 'ready') open(r.downloadUrl!, name && `${name.replace(/\.[^.]+$/, '')}-nen.mp4`);
  else if (r.status === 'original') open((await api<{ downloadUrl: string }>(`/api/assets/${assetId}`)).downloadUrl, name);
  else throw new Error(`compression ${r.status}`);
  return r.status === 'ready';
}
