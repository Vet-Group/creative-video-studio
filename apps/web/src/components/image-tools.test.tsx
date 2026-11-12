// Upload batching, the empty slot's icon, the audio switch's closed state and the refill fallback with its note.
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, test, vi } from 'vitest';
import { AudioSwitch } from './AudioSwitch';
import { nearestOption, pastedImages, refillNote, Slot, uploadImages } from './image-tools';

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
