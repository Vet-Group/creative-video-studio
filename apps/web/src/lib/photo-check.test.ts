import { describe, expect, it } from 'vitest';
import { DARK_LUMA, meanLuma, MIN_SIDE, photoWarnings } from './photo-check';

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
});

describe('meanLuma', () => {
  const px = (...p: number[][]) => new Uint8ClampedArray(p.flat());
  it('weighs the channels as Rec. 709 and leaves out see-through pixels', () => {
    expect(meanLuma(px([255, 255, 255, 255], [0, 0, 0, 255]))).toBeCloseTo(127.5);
    expect(meanLuma(px([0, 255, 0, 255]))).toBeCloseTo(0.7152 * 255);
    expect(meanLuma(px([0, 0, 0, 0], [200, 200, 200, 255]))).toBeCloseTo(200); // a cut-out's empty area is not dark
    expect(meanLuma(px([0, 0, 0, 0]))).toBe(255);
  });
});
