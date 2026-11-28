// A pre-flight look at a photo in an upload slot, before a paid Run (Photoroom's input check, August 2026): a photo too small or too dark tends to come back
// soft or muddy. It only warns; the Run stays the member's call.
import { thumbUrl } from './api';

/** Below this short side, in pixels, a result tends to come back soft. */
export const MIN_SIDE = 768;
/** A mean luma (0 to 255, Rec. 709) under this reads as an underexposed photo. */
export const DARK_LUMA = 60;
/** How much of a file's start is read for its size: a JPEG's EXIF, XMP and ICC segments come before its frame header. */
export const HEAD_BYTES = 128 * 1024;

/** What looks wrong with a photo of this size (unknown when its header could not be read) and mean luma; empty when nothing does. */
export function photoWarnings(p: { width?: number; height?: number; luma: number }): string[] {
  const out: string[] = [];
  if (p.width && p.height && Math.min(p.width, p.height) < MIN_SIDE) out.push(`ảnh nhỏ (${p.width}×${p.height} px) nên kết quả có thể mờ, hãy dùng ảnh có cạnh ngắn từ ${MIN_SIDE} px`);
  if (p.luma < DARK_LUMA) out.push('ảnh tối nên dễ mất chi tiết, hãy tăng sáng hoặc chụp lại');
  return out;
}

/** The mean luma of opaque RGBA pixels. */
export function meanLuma(rgba: Uint8ClampedArray): number {
  let sum = 0;
  for (let i = 0; i < rgba.length; i += 4) sum += 0.2126 * rgba[i]! + 0.7152 * rgba[i + 1]! + 0.0722 * rgba[i + 2]!;
  return sum / (rgba.length / 4);
}

/** The stored width and height of a JPEG, PNG or WebP from the start of its file; undefined when the header is not in `b`.
 * A JPEG's EXIF rotation is not applied, so a turned phone photo reports its sides swapped, which leaves its short side the same. */
export function imageSize(b: Uint8Array): { width: number; height: number } | undefined {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const at = (o: number, s: string) => s.split('').every((c, i) => b[o + i] === c.charCodeAt(0));
  try {
    if (b[0] === 0x89 && at(1, 'PNG')) return { width: v.getUint32(16), height: v.getUint32(20) };
    if (at(0, 'RIFF') && at(8, 'WEBP')) {
      if (at(12, 'VP8 ')) return { width: v.getUint16(26, true) & 0x3fff, height: v.getUint16(28, true) & 0x3fff };
      if (at(12, 'VP8L')) {
        const bits = v.getUint32(21, true);
        return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
      }
      if (at(12, 'VP8X')) return { width: (v.getUint32(24, true) & 0xffffff) + 1, height: (v.getUint32(27, true) & 0xffffff) + 1 };
      return undefined;
    }
    if (b[0] === 0xff && b[1] === 0xd8) {
      // Walk the segments to the first frame header (SOF0 to SOF15, leaving out DHT C4, JPG C8 and DAC CC).
      for (let o = 2; o + 9 <= b.length; ) {
        if (b[o] !== 0xff) return undefined;
        const m = b[o + 1]!;
        if (m === 0xff) {
          o++;
          continue;
        }
        if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { width: v.getUint16(o + 7), height: v.getUint16(o + 5) };
        o += 2 + v.getUint16(o + 2);
      }
    }
  } catch {
    // A file cut short inside its header.
  }
  return undefined;
}

const checked = new Map<string, Promise<string[]>>();

const blobOf = async (res: Response) => {
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.blob();
};

/** The warnings for a photo in a slot, measured once per page: its size from the first HEAD_BYTES of the file (a ranged request, never the whole photo),
 * and its mean luma on a 32 px copy of its tile thumbnail, which the slot has already loaded and which is flattened on white, so a print on a
 * see-through background is not taken for a dark photo. A local picture (`url`) is read from memory. A check that fails gets no warning and is tried again next time. */
export function checkPhoto(img: { id: string; url?: string }): Promise<string[]> {
  const key = img.url ?? img.id;
  let found = checked.get(key);
  if (!found) {
    found = (async () => {
      const local = img.url ? await blobOf(await fetch(img.url)) : undefined;
      const head = local ? local.slice(0, HEAD_BYTES) : await blobOf(await fetch(`/api/assets/${img.id}/content`, { headers: { range: `bytes=0-${HEAD_BYTES - 1}` } }));
      const thumb = local ?? (await blobOf(await fetch(thumbUrl(img.id))));
      const bitmap = await createImageBitmap(thumb);
      try {
        const ctx = Object.assign(document.createElement('canvas'), { width: 32, height: 32 }).getContext('2d')!;
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, 32, 32);
        ctx.drawImage(bitmap, 0, 0, 32, 32);
        return photoWarnings({ ...imageSize(new Uint8Array(await head.arrayBuffer())), luma: meanLuma(ctx.getImageData(0, 0, 32, 32).data) });
      } finally {
        bitmap.close();
      }
    })().catch(() => {
      checked.delete(key);
      return [];
    });
    checked.set(key, found);
  }
  return found;
}
