import { describe, expect, it, vi } from 'vitest';
import { decodeOptimizerImage, imageFileReason, imageSignatureReason, imageSizeReason, MAX_IMAGE_BYTES, optimizeImage, outputSizeText, resizedDimensions } from './media-optimizer';

describe('local image optimizer', () => {
  it('rejects oversized header dimensions before invoking the browser decoder', async () => {
    const bytes = new Uint8Array(33);
    bytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
    const v = new DataView(bytes.buffer);
    v.setUint32(8, 13); bytes.set([73, 72, 68, 82], 12);
    v.setUint32(16, 8000); v.setUint32(20, 8000);
    const decoder = vi.fn(); vi.stubGlobal('createImageBitmap', decoder);
    try {
      await expect(decodeOptimizerImage(new File([bytes], 'large.png', { type: 'image/png' }))).rejects.toThrow('16 triệu');
      await expect(decodeOptimizerImage(new File([bytes.slice(0, 24)], 'truncated.png', { type: 'image/png' }))).rejects.toThrow('kích thước');
      expect(decoder).not.toHaveBeenCalled();
    } finally { vi.unstubAllGlobals(); }
  });
  it('accepts supported nonempty images and rejects video, SVG and oversized files', () => {
    for (const type of ['image/png', 'image/jpeg', 'image/webp']) expect(imageFileReason({ type, size: 1 })).toBeUndefined();
    for (const type of ['video/mp4', 'video/webm', 'image/svg+xml', '']) expect(imageFileReason({ type, size: 1 })).toBeTruthy();
    for (const size of [0, MAX_IMAGE_BYTES + 1]) expect(imageFileReason({ type: 'image/png', size })).toBeTruthy();
  });
  it('checks file signatures independently of MIME and extension', async () => {
    for (const [type, bytes] of [
      ['image/png', [137, 80, 78, 71, 13, 10, 26, 10]],
      ['image/jpeg', [255, 216, 255, 224]],
      ['image/webp', [82, 73, 70, 70, 0, 0, 0, 0, 87, 69, 66, 80]],
    ] as const) expect(await imageSignatureReason(new File([new Uint8Array(bytes)], 'image', { type }))).toBeUndefined();
    expect(await imageSignatureReason(new File(['not an image'], 'fake.png', { type: 'image/png' }))).toBeTruthy();
    expect(await imageSignatureReason(new File([], 'empty.jpg', { type: 'image/jpeg' }))).toBeTruthy();
  });
  it('caps decoded pixels and output dimensions before allocating a canvas', async () => {
    expect(imageSizeReason(4000, 4000)).toBeUndefined();
    for (const [w, h] of [[8000, 8000], [8001, 1], [0, 1], [1.5, 2], [NaN, 1], [1, Infinity]] as const) expect(imageSizeReason(w, h)).toBeTruthy();
    await expect(optimizeImage({} as CanvasImageSource, 8000, 8000, 'image/png')).rejects.toThrow();
  });
  it('preserves original aspect ratio from either side, rounding to whole pixels', () => {
    expect(resizedDimensions(1200, 800, 'width', 600)).toEqual({ width: 600, height: 400 });
    expect(resizedDimensions(1200, 800, 'height', 200)).toEqual({ width: 300, height: 200 });
    expect(resizedDimensions(8000, 1, 'width', 1)).toEqual({ width: 1, height: 1 });
  });
  it('does not label a larger output as compression savings', () => {
    expect(outputSizeText(100, 50)).toBe('Giảm 50% dung lượng');
    expect(outputSizeText(100, 150)).toBe('Lớn hơn bản gốc 50%');
    expect(outputSizeText(100, 100)).toBe('Dung lượng không đổi');
  });
  it('encodes at the requested size and format, flattens JPEG and releases the canvas', async () => {
    const ctx = { fillStyle: '', fillRect: vi.fn(), drawImage: vi.fn() };
    const blob = new Blob(['output'], { type: 'image/jpeg' });
    const canvas = { width: 0, height: 0, getContext: () => ctx, toBlob: vi.fn((done: (b: Blob) => void) => done(blob)) };
    vi.stubGlobal('document', { createElement: () => canvas });
    try {
      expect(await optimizeImage({} as CanvasImageSource, 600, 400, 'image/jpeg')).toBe(blob);
      expect(ctx.fillRect).toHaveBeenCalledWith(0, 0, 600, 400);
      expect(ctx.drawImage).toHaveBeenCalledWith({}, 0, 0, 600, 400);
      expect(canvas.toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/jpeg', 0.82);
      expect(canvas.width).toBe(0);
      canvas.toBlob.mockImplementation((done) => done(new Blob(['fallback'], { type: 'image/png' })));
      await expect(optimizeImage({} as CanvasImageSource, 600, 400, 'image/webp')).rejects.toThrow('định dạng');
      expect(canvas.height).toBe(0);
    } finally { vi.unstubAllGlobals(); }
  });
});
