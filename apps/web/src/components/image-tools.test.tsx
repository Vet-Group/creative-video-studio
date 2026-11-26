// Upload batching, the empty slot's icon, the audio switch's closed state, the refill fallback with its note and the Examples filter by product type.
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, test, vi } from 'vitest';
import type { Clip } from '@/lib/api';
import { decodeOptimizerImage, optimizeImage } from '@/lib/media-optimizer';
import { AudioSwitch } from './AudioSwitch';
import { garmentCap } from '@/lib/try-on-stock';
import { type ImageModel, nearestOption, pastedImages, ProductTypeFilter, refillNote, shownType, shrinkImage, Slot, uploadImages, useImageChoice } from './image-tools';

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

test("with no model picked, Try On's garments count too: 13 go to Nano Banana 2.1 even past its image limit, not to the first 5-garment model, which stays pickable", () => {
  const model = (id: string, maxImages: number, recommended = false) =>
    ({ id, label: id, provider: 'fal', isMock: false, ratios: ['auto'], resolutions: ['1K'], prices: { '1K': '0.0400' }, maxImages, maxPromptChars: 5000, textToImage: false, thinking: [], thinkingPrices: {}, score: 0, recommended, isNew: false, creditUsd: null, creditShown: false, total: 0 }) satisfies ImageModel;
  const models = [model('fashn', 16, true), model('nano-banana-pro', 14), model('nano-banana-2.1', 14)];
  function Probe({ images, garments }: { images: number; garments: number }) {
    const { chosen, options } = useImageChoice(models, images, '', (m) => garmentCap(m.id) >= garments);
    return <p data-chosen={chosen?.id} data-supported={options.filter((o) => o.supported).map((o) => o.id).join(' ')} />;
  }
  const html = (images: number, garments: number) => renderToStaticMarkup(<Probe images={images} garments={garments} />);
  expect(html(3, 2)).toContain('data-chosen="fashn" data-supported="fashn nano-banana-pro nano-banana-2.1"'); // the recommended one while it takes them
  expect(html(14, 13)).toContain('data-chosen="nano-banana-2.1" data-supported="fashn nano-banana-pro nano-banana-2.1"'); // a pick of another says why it cannot run
  expect(html(15, 13)).toContain('data-chosen="nano-banana-2.1" data-supported="fashn"'); // the background is the one too many: the form says so, on this model
});

test('a counted slot shows "3/13" and says "3 trên 13 ảnh trang phục" to a screen reader, as the slot group description', () => {
  const images = [1, 2, 3].map((n) => ({ id: `g${n}`, filename: `g${n}.png` }));
  const html = renderToStaticMarkup(<Slot label="Trang phục" empty="Thêm 1 đến 13 ảnh trang phục" inputLabel="Ảnh trang phục" images={images} max={13} count busy={false} onAdd={() => undefined} onRemove={() => undefined} />);
  expect(html).toContain('<span aria-hidden="true">3/13</span>');
  const id = /<span id="([^"]+)" class="sr-only">3 trên 13 ảnh trang phục<\/span>/.exec(html)?.[1];
  expect(id).toBeDefined();
  expect(html).toContain(`role="group" aria-labelledby=`);
  expect(html).toContain(`aria-describedby="${id}"`);
});

test('an empty counted slot shows no count, unless it counts always, as Image Generation\'s strip, which shows "0/14"', () => {
  const html = (count: true | 'always') => renderToStaticMarkup(<Slot label="Ảnh tham chiếu" empty="Tối đa 14 ảnh tham chiếu" inputLabel="Ảnh tham chiếu" images={[]} max={14} count={count} busy={false} onAdd={() => undefined} onRemove={() => undefined} />);
  expect(html(true)).not.toContain('slot-count');
  expect(html('always')).toContain('<span aria-hidden="true">0/14</span>');
  expect(html('always')).toContain('0 trên 14 ảnh tham chiếu');
});

test('an empty slot shows a picture by default and the icon it is given, as the plus on the Advanced wide slot', () => {
  const slot = (icon?: 'plus') => renderToStaticMarkup(<Slot label="Ảnh tham chiếu" empty="Tối đa 7 ảnh tham chiếu" inputLabel="Ảnh tham chiếu" images={[]} max={7} busy={false} onAdd={() => undefined} onRemove={() => undefined} icon={icon} />);
  const picture = 'M2 3h12v10H2z', plus = 'd="M8 3v10 M3 8h10"';
  expect(slot()).toContain(picture);
  expect(slot('plus')).toContain(plus);
  expect(slot('plus')).not.toContain(picture);
  expect(slot('plus')).toContain('Tối đa 7 ảnh tham chiếu');
});

test('a slot that takes a pick offers the shelf link beside the uploaded photos, except a model or background slot, a slot with no pick and a full multi-photo slot', () => {
  const html = (label: string, over: { onPick?: () => void; images?: { id: string; filename: string }[]; max?: number } = {}) =>
    renderToStaticMarkup(<Slot label={label} empty="Thêm ảnh" inputLabel={label} images={over.images ?? []} max={over.max ?? 4} busy={false} onAdd={() => undefined} onRemove={() => undefined} onPick={'onPick' in over ? over.onPick : () => undefined} />);
  expect(html('Trang phục')).toContain(`aria-label="Từ kệ sản phẩm cho Trang phục"`);
  expect(html('Ảnh tham chiếu (tuỳ chọn)')).toContain(`aria-label="Từ kệ sản phẩm cho Ảnh tham chiếu (tuỳ chọn)"`);
  expect(html('Người mẫu')).not.toContain('Từ kệ sản phẩm');
  expect(html('Bối cảnh (tuỳ chọn)')).not.toContain('Từ kệ sản phẩm');
  expect(html('Trang phục', { onPick: undefined })).not.toContain('Từ kệ sản phẩm');
  const full = [{ id: 'a', filename: 'a.png' }, { id: 'b', filename: 'b.png' }];
  expect(html('Trang phục', { images: full, max: 2 })).not.toContain('Từ kệ sản phẩm');
  expect(html('Nhân vật', { images: [full[0]!], max: 1 })).toContain('Từ kệ sản phẩm cho Nhân vật'); // a one-photo slot swaps its photo
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

test('a refill leaves one note: the setting the model lacks, then what could not come back and why', () => {
  expect(refillNote({ ratio: '16:9', resolution: '2K' }, '16:9', '2K', { lost: 1 }, 2)).toBe('Đã điền lại 2 ảnh và phần còn lại. Không dùng lại được: 1 ảnh đầu vào (đã bị xoá).');
  expect(refillNote({ ratio: '4:5', resolution: null }, '3:4', '1K', { lost: 1 }, 1)).toBe(
    'Mẫu dùng tỉ lệ 4:5; mô hình này không có nên đã chọn 3:4. Đã điền lại 1 ảnh và phần còn lại. Không dùng lại được: 1 ảnh đầu vào (đã bị xoá).',
  );
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

const tagged = (id: string, productType: string | null) => ({ id, productType }) as Clip;

test('the Examples filter lists All and only the product types the tab carries, in their order, the chosen one pressed', () => {
  const items = [tagged('a', 'mug'), tagged('b', null), tagged('c', 'tshirt'), tagged('d', 'mug')];
  const html = renderToStaticMarkup(<ProductTypeFilter items={items} value="mug" onChange={() => undefined} />);
  expect(html).toContain('role="group" aria-label="Lọc theo loại hàng"');
  expect([...html.matchAll(/aria-pressed="(true|false)">([^<]*)</g)].map((m) => [m[2], m[1]])).toEqual([['Tất cả', 'false'], ['Áo thun', 'false'], ['Cốc', 'true']]);
  expect(renderToStaticMarkup(<ProductTypeFilter items={[tagged('b', null)]} value="" onChange={() => undefined} />)).toBe(''); // no tagged example: no filter
});

test('a chosen product type no example carries any more falls back to all', () => {
  const items = [tagged('a', 'mug')];
  expect(shownType(items, 'mug')).toBe('mug');
  expect(shownType(items, 'cap')).toBe('');
  expect(shownType(items, '')).toBe('');
});
