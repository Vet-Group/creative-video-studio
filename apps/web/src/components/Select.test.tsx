// The closed state of the custom controls: roles, names and the chosen value that the e2e specs and screen readers rely on.
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { lengths, lockedText, ModelPicker, vouched, withCredit } from './ModelPicker';
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

test('a chip, whose label is for screen readers only, names the setting in its hover title; a field keeps the value alone', () => {
  const opts = [{ value: 'minimal', label: 'Tối thiểu' }];
  const props = { label: 'Mức suy luận', icon: 'sliders' as const, heading: 'Chọn', value: 'minimal', options: opts, onChange: () => undefined };
  expect(renderToStaticMarkup(<Select chip {...props} />)).toContain('title="Mức suy luận: Tối thiểu"');
  expect(renderToStaticMarkup(<Select {...props} />)).toContain('title="Tối thiểu"');
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

test('a model whose estimate is over its provider credit is locked like an unsupported one; at or under it, or with no credit known, it stays', () => {
  const m = { id: 'a', label: 'Alpha', isMock: false, supported: true, estimateUsd: '1.0000' };
  expect(withCredit({ ...m, creditUsd: '0.9999' })).toMatchObject({ supported: false, locked: true });
  expect(withCredit({ ...m, creditUsd: '1.0000' })).toEqual({ ...m, creditUsd: '1.0000' });
  expect(withCredit({ ...m, creditUsd: null })).toEqual({ ...m, creditUsd: null });
  expect(withCredit(m)).toEqual(m);
});

test('a locked model shows the balance to an Admin and only an out-of-budget note to a member; clip lengths read in giây', () => {
  const m = { id: 'a', label: 'Alpha', isMock: false, supported: true, estimateUsd: '1.0000', creditUsd: '0.4' };
  expect(lockedText({ ...m, creditShown: true })).toBe('Hết credits: còn $0.40');
  expect(lockedText(m)).toBe('Tạm hết ngân sách, báo Admin');
  expect([lengths([4, 8, 15]), lengths([5]), lengths([])]).toEqual(['4–15 giây', '5 giây', null]);
});

test('the recommended badge waits for enough marks: none sent keeps it, fewer than three hide it, on the button too', () => {
  expect(vouched({ recommended: true })).toBe(true);
  expect(vouched({ recommended: true, marks: 0 })).toBe(false);
  expect(vouched({ recommended: true, marks: 2 })).toBe(false);
  expect(vouched({ recommended: true, marks: 3 })).toBe(true);
  expect(vouched({ recommended: false, marks: 9 })).toBe(false);
  const model = { id: 'a', label: 'Alpha', isMock: false, supported: true, estimateUsd: '0.8000', recommended: true };
  expect(renderToStaticMarkup(<ModelPicker models={[{ ...model, marks: 1 }]} value="a" onChange={() => undefined} />)).not.toContain('Đề xuất');
  expect(renderToStaticMarkup(<ModelPicker models={[{ ...model, marks: 5 }]} value="a" onChange={() => undefined} />)).toContain('Đề xuất');
});
