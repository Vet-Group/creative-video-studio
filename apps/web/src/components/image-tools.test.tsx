// Upload batching, the empty slot's icon, the audio switch's closed state and the refill fallback with its note.
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, test, vi } from 'vitest';
import { decodeOptimizerImage, optimizeImage } from '@/lib/media-optimizer';
import { AudioSwitch } from './AudioSwitch';
import { nearestOption, pastedImages, refillNote, shrinkImage, Slot, uploadImages } from './image-tools';

vi.mock('@/lib/media-optimizer', () => ({ decodeOptimizerImage: vi.fn(), optimizeImage: vi.fn() }));

afterEach(() => vi.unstubAllGlobals());

test('a pick of 7 images goes up as 4 then 3, the most one POST /api/assets takes, and the assets keep their order', async () => {
  const sizes: number[] = [];
  vi.stubGlobal('fetch', async (_path: string, init: RequestInit) => {
    const files = (init.body as FormData).getAll('file') as File[];
    sizes.push(files.length);
    return new Response(JSON.stringify({ assets: files.map((f) => ({ id: f.name, filename: f.name })) }), { status: 201 });
  });
  const files = Array.from({ length: 7 }, (_, i) => new File(['x'], `ref-${i + 1}.png`, { type: 'image/png' }));
  expect((await uploadImages(files)).map((a) => a.id)).toEqual(files.map((f) => f.name));
  expect(sizes).toEqual([4, 3]);
});

test('an empty slot shows a picture by default and the icon it is given, as the plus on the Advanced wide slot', () => {
  const slot = (icon?: 'plus') => renderToStaticMarkup(<Slot label="Ảnh tham chiếu" empty="Tối đa 7 ảnh tham chiếu" inputLabel="Ảnh tham chiếu" images={[]} max={7} busy={false} onAdd={() => undefined} onRemove={() => undefined} icon={icon} />);
  const picture = 'M2 3h12v10H2z', plus = 'd="M8 3v10 M3 8h10"';
  expect(slot()).toContain(picture);
  expect(slot('plus')).toContain(plus);
  expect(slot('plus')).not.toContain(picture);
  expect(slot('plus')).toContain('Tối đa 7 ảnh tham chiếu');
});

test('the audio switch reads on when available and on, is off and disabled with a reason when the model cannot make audio, and on and disabled when it always does', () => {
  const on = renderToStaticMarkup(<AudioSwitch on available onChange={() => undefined} />);
  expect(on).toContain('aria-checked="true"');
  expect(on).toContain('>Bật<');
  expect(on).not.toContain('disabled');
  const fixed = renderToStaticMarkup(<AudioSwitch on available={false} onChange={() => undefined} />);
  expect(fixed).toContain('aria-checked="false"');
  expect(fixed).toContain('disabled');
  expect(fixed).toContain('Mô hình này không tạo được âm thanh');
  const always = renderToStaticMarkup(<AudioSwitch on={false} available always onChange={() => undefined} />);
  expect(always).toContain('aria-checked="true"');
  expect(always).toContain('disabled');
  expect(always).toContain('Mô hình này luôn tạo âm thanh');
});

test('a ratio or resolution the model lacks falls back to the nearest it has, and anything it cannot compare to the first', () => {
  const gpt = ['auto', '1:1', '9:16', '16:9', '3:4', '4:3'];
  expect(nearestOption(gpt, '4:5')).toBe('3:4');
  expect(nearestOption(gpt, '21:9')).toBe('16:9');
  expect(nearestOption(gpt, '9:16')).toBe('9:16');
  expect(nearestOption(['1:1', '16:9'], 'auto')).toBe('1:1');
  expect(nearestOption(['1K', '2K'], '4K')).toBe('2K');
  expect(nearestOption(['2K', '4K'], '1K')).toBe('2K');
  expect(nearestOption(['1K'], 'auto')).toBe('1K');
});

test('a refill says which setting the model lacks and what it chose instead, and nothing when it has both', () => {
  expect(refillNote({ ratio: '4:5', resolution: '1K' }, '3:4', '1K')).toBe('Mẫu dùng tỉ lệ 4:5; mô hình này không có nên đã chọn 3:4.');
  expect(refillNote({ ratio: '4:5', resolution: '4K' }, '3:4', '2K')).toBe('Mẫu dùng tỉ lệ 4:5, độ phân giải 4K; mô hình này không có nên đã chọn 3:4, 2K.');
  expect(refillNote({ ratio: 'auto', resolution: null }, '1:1', '1K')).toBe('Mẫu dùng tỉ lệ Tự động; mô hình này không có nên đã chọn 1:1.');
  expect(refillNote({ ratio: '16:9', resolution: '2K' }, '16:9', '2K')).toBe('');
  expect(refillNote({ ratio: null, resolution: null }, 'auto', '1K')).toBe('');
});

test('a paste hands a slot its image files, but not when words go into a text box', () => {
  const png = new File(['x'], 'shot.png', { type: 'image/png' });
  const txt = new File(['x'], 'notes.txt', { type: 'text/plain' });
  const page = { closest: () => null };
  const box = { closest: (sel: string) => (sel.includes('textarea') ? {} : null) };
  expect(pastedImages(page, { files: [png, txt], types: ['Files'] })).toEqual([png]);
  expect(pastedImages(box, { files: [png], types: ['Files'] })).toEqual([png]); // a screenshot pasted while the prompt box has focus
  expect(pastedImages(box, { files: [png], types: ['Files', 'text/plain'] })).toEqual([]); // words with a picture, into a box: the words win
  expect(pastedImages(page, { files: [txt], types: ['Files'] })).toEqual([]);
  expect(pastedImages(page, null)).toEqual([]);
});

test('a photo over 10 MB is shrunk (scaled down until it fits) and uploaded, and one the browser cannot shrink keeps the refusal', async () => {
  const MB = 1024 * 1024;
  vi.mocked(decodeOptimizerImage).mockResolvedValue({ width: 4000, height: 3000 } as ImageBitmap);
  // Size follows the area: 12 MB at full size, so it fits from the second step (scale 0.7).
  vi.mocked(optimizeImage).mockImplementation(async (_i, w, h, type) => new Blob([new Uint8Array(Math.round(12 * MB * ((w * h) / 12_000_000)))], { type }));
  const big = new File([new Uint8Array(11 * MB)], 'big.png', { type: 'image/png' });
  const small = await shrinkImage(big, 10 * MB);
  expect(small?.name).toBe('big.webp');
  expect(small?.type).toBe('image/webp');
  expect(small!.size).toBeLessThanOrEqual(10 * MB);
  expect((await shrinkImage(new File([new Uint8Array(11 * MB)], 'a.photo.jpg', { type: 'image/jpeg' }), 10 * MB))?.name).toBe('a.photo.jpg');

  let sent: File[] = [];
  vi.stubGlobal('fetch', async (_path: string, init: RequestInit) => {
    sent = (init.body as FormData).getAll('file') as File[];
    return new Response(JSON.stringify({ assets: sent.map((f) => ({ id: f.name, filename: f.name })) }), { status: 201 });
  });
  expect((await uploadImages([big])).map((a) => a.id)).toEqual(['big.webp']);
  expect(sent[0]!.size).toBeLessThanOrEqual(10 * MB);

  vi.mocked(decodeOptimizerImage).mockRejectedValue(new Error('cannot decode'));
  await expect(uploadImages([big])).rejects.toThrow('Ảnh "big.png" quá lớn: tối đa 10 MB.');
  vi.mocked(decodeOptimizerImage).mockResolvedValue({ width: 4000, height: 3000 } as ImageBitmap);
  vi.mocked(optimizeImage).mockImplementation(async (_i, _w, _h, type) => new Blob([new Uint8Array(11 * MB)], { type }));
  await expect(uploadImages([big])).rejects.toThrow('quá lớn');
});
