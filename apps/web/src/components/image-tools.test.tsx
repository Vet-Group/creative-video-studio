// Upload batching and the audio switch's closed state.
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, test, vi } from 'vitest';
import { AudioSwitch } from './AudioSwitch';
import { uploadImages } from './image-tools';

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

test('the audio switch reads on when available and on, and is off and disabled with a reason when the model cannot make audio', () => {
  const on = renderToStaticMarkup(<AudioSwitch on available onChange={() => undefined} />);
  expect(on).toContain('aria-checked="true"');
  expect(on).toContain('>Bật<');
  expect(on).not.toContain('disabled');
  const fixed = renderToStaticMarkup(<AudioSwitch on available={false} onChange={() => undefined} />);
  expect(fixed).toContain('aria-checked="false"');
  expect(fixed).toContain('disabled');
  expect(fixed).toContain('Mô hình này không tạo được âm thanh');
});
