// A pre-flight look at a photo in an upload slot, before a paid Run (Photoroom's input check, August 2026): a photo too small or too dark tends to come back
// soft or muddy. It only warns; the Run stays the member's call.

/** Below this short side, in pixels, a result tends to come back soft. */
export const MIN_SIDE = 768;
/** A mean luma (0 to 255, Rec. 709) under this reads as an underexposed photo. */
export const DARK_LUMA = 60;

/** What looks wrong with a photo of this size and mean luma; empty when nothing does. */
export function photoWarnings(p: { width: number; height: number; luma: number }): string[] {
  const out: string[] = [];
  if (Math.min(p.width, p.height) < MIN_SIDE) out.push(`ảnh nhỏ (${p.width}×${p.height} px) nên kết quả có thể mờ, hãy dùng ảnh có cạnh ngắn từ ${MIN_SIDE} px`);
  if (p.luma < DARK_LUMA) out.push('ảnh tối nên dễ mất chi tiết, hãy tăng sáng hoặc chụp lại');
  return out;
}

/** The mean luma of RGBA pixels, leaving out the see-through ones (a cut-out PNG's empty area is not dark); 255 when every pixel is see-through. */
export function meanLuma(rgba: Uint8ClampedArray): number {
  let sum = 0;
  let n = 0;
  for (let i = 0; i < rgba.length; i += 4) {
    if (rgba[i + 3]! < 128) continue;
    sum += 0.2126 * rgba[i]! + 0.7152 * rgba[i + 1]! + 0.0722 * rgba[i + 2]!;
    n++;
  }
  return n === 0 ? 255 : sum / n;
}

const checked = new Map<string, Promise<string[]>>();

/** The warnings for the photo at `src`, measured once per page: its full size, and its mean luma on a 32 px copy. A photo that cannot be read gets none. */
export function checkPhoto(src: string): Promise<string[]> {
  let found = checked.get(src);
  if (!found) {
    found = (async () => {
      const res = await fetch(src);
      if (!res.ok) return [];
      const bitmap = await createImageBitmap(await res.blob());
      try {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 32;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(bitmap, 0, 0, 32, 32);
        return photoWarnings({ width: bitmap.width, height: bitmap.height, luma: meanLuma(ctx.getImageData(0, 0, 32, 32).data) });
      } finally {
        bitmap.close();
      }
    })().catch(() => []);
    checked.set(src, found);
  }
  return found;
}
