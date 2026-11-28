import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { DARK_LUMA, HEAD_BYTES, imageSize, meanLuma, MIN_SIDE, photoWarnings } from './photo-check';

describe('photoWarnings', () => {
  it('passes a photo whose short side is at least 768 px and that is not dark, a white-background one included', () => {
    expect(photoWarnings({ width: MIN_SIDE, height: 2000, luma: DARK_LUMA })).toEqual([]);
    expect(photoWarnings({ width: 1024, height: 1024, luma: 250 })).toEqual([]);
  });

  it('names a small photo with its size, and a dark one', () => {
    expect(photoWarnings({ width: 1200, height: 640, luma: 120 })).toEqual(['ảnh nhỏ (1200×640 px) nên kết quả có thể mờ, hãy dùng ảnh có cạnh ngắn từ 768 px']);
    expect(photoWarnings({ width: 1024, height: 1024, luma: DARK_LUMA - 1 })).toEqual(['ảnh tối nên dễ mất chi tiết, hãy tăng sáng hoặc chụp lại']);
    expect(photoWarnings({ width: 300, height: 300, luma: 10 })).toHaveLength(2);
  });

  it('checks only the light when the size is unknown', () => {
    expect(photoWarnings({ luma: 120 })).toEqual([]);
    expect(photoWarnings({ luma: 10 })).toEqual(['ảnh tối nên dễ mất chi tiết, hãy tăng sáng hoặc chụp lại']);
  });
});

describe('imageSize', () => {
  const image = (width: number, height: number, alpha = false) => sharp({ create: { width, height, channels: alpha ? 4 : 3, background: { r: 90, g: 40, b: 200, alpha: 0.5 } } });
  it("reads a JPEG's, a PNG's and every kind of WebP's stored size from the start of the file", async () => {
    expect(imageSize(await image(1201, 641).jpeg().toBuffer())).toEqual({ width: 1201, height: 641 });
    expect(imageSize(await image(1201, 641).png().toBuffer())).toEqual({ width: 1201, height: 641 });
    expect(imageSize(await image(1201, 641).webp().toBuffer())).toEqual({ width: 1201, height: 641 }); // VP8
    expect(imageSize(await image(1201, 641).webp({ lossless: true }).toBuffer())).toEqual({ width: 1201, height: 641 }); // VP8L
    expect(imageSize(await image(1201, 641, true).webp().toBuffer())).toEqual({ width: 1201, height: 641 }); // VP8X
  });

  it('walks past EXIF and ICC segments to the frame header, and gives up when the header is past the bytes read', async () => {
    const jpeg = await image(900, 1600).withMetadata({ orientation: 6 }).withIccProfile('p3').jpeg().toBuffer();
    expect(imageSize(jpeg.subarray(0, HEAD_BYTES))).toEqual({ width: 900, height: 1600 });
    expect(imageSize(jpeg.subarray(0, 40))).toBeUndefined();
    expect(imageSize(new Uint8Array([0x47, 0x49, 0x46, 0x38]))).toBeUndefined();
  });
});

describe('meanLuma', () => {
  const px = (...p: number[][]) => new Uint8ClampedArray(p.flat());
  it('weighs the channels as Rec. 709', () => {
    expect(meanLuma(px([255, 255, 255, 255], [0, 0, 0, 255]))).toBeCloseTo(127.5);
    expect(meanLuma(px([0, 255, 0, 255]))).toBeCloseTo(0.7152 * 255);
  });
});
