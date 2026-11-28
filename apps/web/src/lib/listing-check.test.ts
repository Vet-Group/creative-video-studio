import { describe, expect, it } from 'vitest';
import { checkFor, contentBox, measure, whitenBackground, type Measure } from './listing-check';

/** A w × h RGBA picture of `bg` with a `fg` square of side `s` in the middle. */
function picture(w: number, h: number, bg: number[], fg: number[], s: number) {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const inside = Math.abs(x - (w - 1) / 2) < s / 2 && Math.abs(y - (h - 1) / 2) < s / 2;
      d.set([...(inside ? fg : bg), 255], (y * w + x) * 4);
    }
  return d;
}
const px = (d: Uint8ClampedArray, w: number, x: number, y: number) => [...d.slice((y * w + x) * 4, (y * w + x) * 4 + 3)];

describe('whitenBackground', () => {
  it('turns a light grey studio wall pure white and leaves the product', () => {
    const d = picture(40, 40, [244, 244, 241], [30, 60, 90], 16);
    expect(whitenBackground(d, 40, 40)).toBe(true);
    expect(px(d, 40, 0, 0)).toEqual([255, 255, 255]);
    expect(px(d, 40, 39, 20)).toEqual([255, 255, 255]);
    expect(px(d, 40, 20, 20)).toEqual([30, 60, 90]);
  });

  it('keeps a white product on white as it was (the middle would go)', () => {
    const d = picture(40, 40, [246, 246, 246], [250, 250, 250], 30);
    const before = d.slice();
    expect(whitenBackground(d, 40, 40)).toBe(false);
    expect(d).toEqual(before);
  });

  it('does nothing to a wall that only looks white (RGB 208)', () => {
    const d = picture(40, 40, [208, 208, 208], [30, 60, 90], 16);
    expect(whitenBackground(d, 40, 40)).toBe(false);
    expect(px(d, 40, 0, 0)).toEqual([208, 208, 208]);
  });
});

describe('contentBox and measure', () => {
  it('boxes what is not white, with a 1% margin, and gives the product’s own share of the longer side', () => {
    const d = picture(200, 100, [255, 255, 255], [0, 0, 0], 50);
    const box = contentBox(d, 200, 100);
    expect(box.x).toBeGreaterThanOrEqual(70);
    expect(box.width).toBeGreaterThanOrEqual(50);
    expect(box.width).toBeLessThanOrEqual(56);
    expect(contentBox(d, 200, 100, 0)).toEqual({ x: 75, y: 25, width: 50, height: 50 });
    expect(measure(d, 200, 100).fill).toBe(0.5);
    expect(measure(d, 200, 100).edge.every((v) => v === 0)).toBe(true);
  });

  it('finds the product on a light grey wall, which is not white and not the product either', () => {
    const m = measure(picture(200, 100, [208, 208, 205], [30, 60, 90], 50), 200, 100);
    expect(m.fill).toBe(0.5);
    expect(m.edge.every((v) => v === 50)).toBe(true);
  });
});

describe('checkFor', () => {
  const amazonReady: Measure = { width: 2000, height: 2000, edge: Array(400).fill(0), fill: 0.85, alpha: false };
  const jpeg = { type: 'image/jpeg', size: 900_000 };
  const levels = (c: ReturnType<typeof checkFor>) => c.map((x) => x.level);

  it('passes a 2000 px square JPEG on pure white with the product at 85%, and still asks for a look', () => {
    const checks = checkFor('amazon', amazonReady, jpeg);
    expect(levels(checks)).toEqual(['ok', 'ok', 'ok', 'ok', 'ok', 'look']);
    expect(checks[0]!.text).toBe('Nền trắng tinh ở mép ảnh');
  });

  it('fails Amazon on a wall that only looks white, and warns on a small product', () => {
    const checks = checkFor('amazon', { ...amazonReady, edge: Array(400).fill(47), fill: 0.6 }, jpeg);
    expect(checks[0]).toEqual({ level: 'fail', text: 'Nền chưa trắng tinh: 0% mép ảnh đạt, cần 98%' });
    expect(checks.find((c) => c.text.startsWith('Sản phẩm'))).toEqual({ level: 'warn', text: 'Sản phẩm chỉ chiếm khoảng 60% khung, nên từ 85%' });
  });

  it('reads the sides, the ratio, transparency, the format and the size by marketplace', () => {
    const portrait: Measure = { width: 1200, height: 1600, edge: Array(400).fill(30), fill: 0.7, alpha: true };
    expect(checkFor('tiktok', portrait, { type: 'image/png', size: 1_000_000 }).map((c) => c.text)).toEqual(['Cạnh dài 1600 px', 'Tỉ lệ 1:1 hoặc 3:4', 'Sản phẩm chiếm khoảng 70% khung', 'Ảnh có vùng trong suốt: sàn có thể đổi thành nền đen', 'Định dạng PNG', 'Dung lượng dưới 5 MB', 'Tự xem lại: không chữ, logo thừa, hình mờ, viền hay ghép nhiều ảnh']);
    expect(checkFor('shopee', portrait, { type: 'image/webp', size: 3_000_000 }).filter((c) => c.level === 'fail').map((c) => c.text)).toEqual(['Cần ảnh vuông 1:1', 'Ảnh có vùng trong suốt: sàn có thể đổi thành nền đen', 'Định dạng chưa đúng, hãy xuất JPG', 'Dung lượng quá 2 MB']);
    expect(checkFor('amazon', { ...amazonReady, width: 800, height: 800 }, jpeg)[1]).toEqual({ level: 'fail', text: 'Cạnh dài 800 px, cần ít nhất 1000 px' });
    expect(checkFor('shopify', { ...amazonReady, width: 1500, height: 1500, alpha: true }, { type: 'image/webp', size: 100 }).map((c) => c.level)).toEqual(['warn', 'ok', 'ok', 'look']);
  });
});
