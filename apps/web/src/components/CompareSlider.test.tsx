// The before/after slider shows the result whole and the original clipped at the handle, with a labelled range input to move it.
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { CompareSlider } from './CompareSlider';

test('the slider starts in the middle, layers the original over the result and names its range for screen readers', () => {
  const html = renderToStaticMarkup(<CompareSlider before="/a/person" after="/a/result" beforeAlt="Ảnh gốc" afterAlt="Kết quả" />);
  expect(html).toContain('--at:50%');
  expect(html.indexOf('src="/a/result"')).toBeLessThan(html.indexOf('src="/a/person"')); // the original is drawn on top, clipped by --at
  expect(html).toContain('<input type="range" min="0" max="100" aria-label="So sánh trước và sau" aria-valuetext="Ảnh gốc 50%, kết quả 50%" value="50"/>');
  expect(html).toContain('alt="Ảnh gốc"');
  expect(html).toContain('alt="Kết quả"');
});
