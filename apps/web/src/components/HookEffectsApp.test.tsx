import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, expect, test, vi } from 'vitest';
import { appBySlug, HOOK_EFFECTS } from '@/lib/apps';
import { inSeason } from '@/lib/prompt-starters';
import { EffectPicker, HookEffectsApp } from './HookEffectsApp';
import { JobsProvider } from './jobs';

const samples = vi.hoisted(() => ({ have: new Set<string>() }));
vi.mock('@/lib/use-samples', async (orig) => ({ ...(await orig<typeof import('@/lib/use-samples')>()), useSamples: () => samples.have }));
beforeEach(() => {
  samples.have = new Set();
});

const labels = ['Phồng rồi bóp', 'Tan chảy thành sản phẩm', 'Rơi vào khung', 'Hộp bung mở'];
const summer = inSeason(HOOK_EFFECTS, new Date('2026-06-01T12:00:00+07:00'));

test('the picker is a radiogroup of the four effects with the first checked, and a tile with no sample shows its label alone', () => {
  const html = renderToStaticMarkup(<EffectPicker effects={summer} value="squish" onChange={() => {}} />);
  expect(html).toContain('role="radiogroup"');
  expect(html.match(/type="radio"/g)).toHaveLength(4);
  for (const label of labels) expect(html).toContain(`>${label}</span>`);
  expect(html.match(/checked=""/g)).toHaveLength(1);
  expect(html).toMatch(/value="squish"[^>]*checked=""|checked=""[^>]*value="squish"/);
  expect(html).not.toContain('<video');
  expect(html).not.toContain('<img');
});

test('the chosen tile plays its loop and the others show only their still', () => {
  samples.have = new Set(['hook-effect-squish.mp4', 'hook-effect-squish.jpg', 'hook-effect-melt.mp4', 'hook-effect-melt.jpg', 'hook-effect-drop.jpg']);
  const html = renderToStaticMarkup(<EffectPicker effects={summer} value="melt" onChange={() => {}} />);
  expect(html.match(/<video/g)).toHaveLength(1);
  expect(html).toContain('/api/samples/hook-effect-melt.mp4');
  expect(html).not.toContain('hook-effect-squish.mp4');
  expect(html).toContain('/api/samples/hook-effect-squish.jpg');
  expect(html).toContain('/api/samples/hook-effect-drop.jpg');
});

test('from 15 November to 31 December the two Christmas tiles lead the picker', () => {
  const html = renderToStaticMarkup(<EffectPicker effects={inSeason(HOOK_EFFECTS, new Date('2026-12-01T12:00:00+07:00'))} value="snow-globe" onChange={() => {}} />);
  expect([...html.matchAll(/value="([a-z-]+)"/g)].map((m) => m[1])).toEqual(['snow-globe', 'gift-unwrap', 'squish', 'melt', 'drop', 'box-burst']);
  for (const label of ['Quả cầu tuyết', 'Hộp quà Giáng sinh', ...labels]) expect(html).toContain(`>${label}</span>`);
});

test('the form has the product slot, the picker and the three notes, and no prompt, ratio, length, audio or model control', () => {
  const html = renderToStaticMarkup(
    <JobsProvider userId="u1">
      <HookEffectsApp app={appBySlug('hook-effects')!} />
    </JobsProvider>,
  );
  expect(html).toContain('Ảnh sản phẩm');
  expect(html.match(/type="radio"/g)).toHaveLength(inSeason(HOOK_EFFECTS).length);
  expect(html).toContain('Ảnh không đúng khung dọc sẽ được thêm viền cùng màu nền, sản phẩm không bị cắt.');
  expect(html).toContain('Chữ nhỏ trên sản phẩm có thể bị nhoè hoặc méo trong lúc hiệu ứng chạy.');
  expect(html).toContain('Clip có sẵn âm thanh do mô hình tự tạo, có thể có tiếng nói; tắt tiếng khi ghép nếu không cần.');
  expect(html).not.toMatch(/<textarea|type="range"|role="combobox"|<select/);
  expect(html).toContain('Đang tải danh sách mô hình...'); // the models load in an effect, which a static render does not run
});
