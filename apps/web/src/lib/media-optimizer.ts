import { optimizerImageSize } from './optimizer-image-size';

export const IMAGE_FORMATS = ['image/png', 'image/jpeg', 'image/webp'] as const;
export type ImageFormat = typeof IMAGE_FORMATS[number];
export const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
export const MAX_IMAGE_PIXELS = 16_000_000;

export function imageFileReason(file: Pick<File, 'type' | 'size'>): string | undefined {
  if (!IMAGE_FORMATS.includes(file.type as ImageFormat)) return 'Chỉ hỗ trợ ảnh PNG, JPG và WEBP. Chưa hỗ trợ video.';
  if (!file.size || file.size > MAX_IMAGE_BYTES) return 'Chọn ảnh không rỗng, tối đa 20 MB.';
}

export async function imageSignatureReason(file: File): Promise<string | undefined> {
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const matches = file.type === 'image/png'
    ? [137, 80, 78, 71, 13, 10, 26, 10].every((b, i) => bytes[i] === b)
    : file.type === 'image/jpeg'
      ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
      : file.type === 'image/webp' && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP';
  if (!matches) return 'Nội dung tệp không khớp định dạng ảnh. Hãy chọn ảnh PNG, JPG hoặc WEBP hợp lệ.';
}

export async function decodeOptimizerImage(file: File): Promise<ImageBitmap> {
  const reason = imageFileReason(file) ?? await imageSignatureReason(file);
  if (reason) throw new Error(reason);
  const size = optimizerImageSize(new Uint8Array(await file.arrayBuffer()), file.type);
  if (!size) throw new Error('Không đọc được kích thước ảnh từ dữ liệu hợp lệ.');
  const invalid = imageSizeReason(size.width, size.height);
  if (invalid) throw new Error(invalid);
  return createImageBitmap(file);
}

export function imageSizeReason(width: number, height: number): string | undefined {
  if (![width, height].every((n) => Number.isInteger(n) && n > 0 && n <= 8000) || width * height > MAX_IMAGE_PIXELS) return 'Kích thước phải là số nguyên từ 1 đến 8000 px, tối đa 16 triệu điểm ảnh.';
}

export function resizedDimensions(width: number, height: number, side: 'width' | 'height', value: number) {
  return side === 'width' ? { width: value, height: Math.max(1, Math.round(value * height / width)) } : { width: Math.max(1, Math.round(value * width / height)), height: value };
}

export function outputSizeText(original: number, output: number): string {
  const percent = Math.round(Math.abs(original - output) / original * 100);
  return output < original ? `Giảm ${percent}% dung lượng` : output > original ? `Lớn hơn bản gốc ${percent}%` : 'Dung lượng không đổi';
}

/** The listing preset (Etsy, Shopify): a square JPEG of this side with the whole image on white. */
export const LISTING_SIDE = 2048;
/** The most images the listing preset takes at once; two or more come back as one .zip. */
export const MAX_LISTING_IMAGES = 50;

/** Where an image of `width` × `height` lands when fitted whole and centred in a `boxWidth` × `boxHeight` box; the rest is padding. */
export function fitRect(width: number, height: number, boxWidth: number, boxHeight: number) {
  const scale = Math.min(boxWidth / width, boxHeight / height);
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));
  return { x: Math.round((boxWidth - w) / 2), y: Math.round((boxHeight - h) / 2), width: w, height: h };
}

/** Encodes `image` at `width` × `height`. With `fit`, the image's own size, it is drawn whole and centred on white instead of stretched (the listing preset). */
export async function optimizeImage(image: CanvasImageSource, width: number, height: number, format: ImageFormat, fit?: { width: number; height: number }): Promise<Blob> {
  const reason = imageSizeReason(width, height);
  if (reason) throw new Error(reason);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  try {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Trình duyệt không hỗ trợ xử lý ảnh.');
    // White under the image: JPEG has no transparency, and the listing padding is white.
    if (format === 'image/jpeg' || fit) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);
    }
    const r = fit ? fitRect(fit.width, fit.height, width, height) : { x: 0, y: 0, width, height };
    ctx.drawImage(image, r.x, r.y, r.width, r.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, format, 0.82));
    if (!blob || blob.type !== format) throw new Error('Trình duyệt không hỗ trợ định dạng đã chọn.');
    return blob;
  } finally {
    canvas.width = canvas.height = 0;
  }
}
