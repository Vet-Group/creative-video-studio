// The History tab of Media Optimizer: the session's results as cards, newest first, with their sizes and a download link.
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { type OptimizerEntry, OptimizerHistory } from './MediaOptimizer';

const entry = (id: number, name: string, before: number, after: number): OptimizerEntry => ({ id, url: `blob:test/${id}`, name, before, after, width: 4, height: 3, format: 'image/webp' });

test('an empty History says the results are kept for this session only, not in the Library', () => {
  const html = renderToStaticMarkup(<OptimizerHistory entries={[]} />);
  expect(html).toContain('không lưu vào Thư viện');
  expect(html).toContain('Chưa có kết quả nào');
  expect(html).not.toContain('<li');
});

test('each entry shows its preview, size before and after, format and a download link, in the order given', () => {
  const html = renderToStaticMarkup(<OptimizerHistory entries={[entry(2, 'b-optimized.webp', 2048, 1024), entry(1, 'a-optimized.webp', 1024, 2048)]} />);
  expect(html.indexOf('b-optimized.webp')).toBeLessThan(html.indexOf('a-optimized.webp'));
  expect(html).toContain('2.0 KB → 1.0 KB');
  expect(html).toContain('Giảm 50% dung lượng');
  expect(html).toContain('Lớn hơn bản gốc 100%');
  expect(html).toContain('WEBP');
  expect(html).toContain('4 × 3 px');
  expect(html).toContain('href="blob:test/2"');
  expect(html).toContain('download="b-optimized.webp"');
  expect(html).toContain('src="blob:test/1"');
});
