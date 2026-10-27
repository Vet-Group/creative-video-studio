// The closed state of the custom controls: roles, names and the chosen value that the e2e specs and screen readers rely on.
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { ModelPicker } from './ModelPicker';
import { Select } from './Select';

test('a closed select is a labelled combobox showing the chosen option, with no list in the page', () => {
  const html = renderToStaticMarkup(
    <Select label="Thời lượng" icon="clock" heading="Chọn thời lượng" value="8" options={[{ value: '5', label: '5 giây' }, { value: '8', label: '8 giây' }]} onChange={() => undefined} />,
  );
  expect(html).toContain('role="combobox"');
  expect(html).toContain('aria-haspopup="listbox"');
  expect(html).toContain('aria-expanded="false"');
  expect(html).toContain('data-value="8"');
  expect(html).toMatch(/<label[^>]*for="[^"]+"[^>]*>Thời lượng<\/label>/);
  expect(html).toContain('8 giây');
  expect(html).not.toContain('5 giây');
  expect(html).not.toContain('role="listbox"');
});

test('a ratio select draws its icon in the chosen shape: tall for 9:16, square for 1:1, wide otherwise', () => {
  const shape = (value: string) => renderToStaticMarkup(<Select label="Tỉ lệ" icon="ratio" heading="Chọn tỉ lệ" value={value} options={[{ value, label: value }]} onChange={() => undefined} />).match(/<path d="([^"]+)"/)![1];
  expect(shape('9:16')).toBe('M4.5 2h7v12h-7z');
  expect(shape('1:1')).toBe('M3 3h10v10H3z');
  expect(shape('16:9')).toBe('M2.5 4h11v8h-11z');
  expect(shape('auto')).toBe('M2.5 4h11v8h-11z');
});

test('the model picker shows the chosen model on its button and keeps the panel closed', () => {
  const models = [
    { id: 'a', label: 'Alpha', isMock: false, supported: true, rate: '80% (8/10)', estimateUsd: '0.8000' },
    { id: 'b', label: 'Beta', isMock: true, supported: false, rate: 'chưa có dữ liệu', estimateUsd: '0.1000' },
  ];
  const html = renderToStaticMarkup(<ModelPicker models={models} value="b" onChange={() => undefined} />);
  expect(html).toContain('aria-haspopup="dialog"');
  expect(html).toContain('aria-expanded="false"');
  expect(html).toContain('Beta');
  expect(html).toContain('MOCK');
  expect(html).not.toContain('Alpha');
  expect(html).not.toContain('role="dialog"');
});
