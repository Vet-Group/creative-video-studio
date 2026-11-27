import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { appBySlug, RECOLOR_COLORS } from '@/lib/apps';
import { JobsProvider } from './jobs';
import { EDIT_KINDS, VideoEditApp } from './VideoEditApp';

const render = (remake = false) =>
  renderToStaticMarkup(
    <JobsProvider userId="u1">
      <VideoEditApp app={appBySlug('video-edit')!} remake={remake} />
    </JobsProvider>,
  );

test('the kinds of edit are the quick colour, the quick backdrop and the own words, in that order; no added text', () => {
  expect(EDIT_KINDS.map((k) => [k.id, k.label])).toEqual([
    ['color', 'Đổi màu áo'],
    ['background', 'Đổi nền'],
    ['own', 'Tự mô tả'],
  ]);
});

test('the form has the clip slot, the kinds with the colour first and its swatches unpicked, and no prompt box, ratio, length or model control', () => {
  const html = render();
  expect(html).toContain('Video cần sửa');
  expect(html).toContain('Tệp video cần sửa');
  expect(html.match(/role="radiogroup"/g)).toHaveLength(2); // the kind, then the colour
  expect(html.match(/type="radio"/g)).toHaveLength(EDIT_KINDS.length + RECOLOR_COLORS.length);
  expect(html.match(/checked=""/g)).toHaveLength(1);
  expect(html).toMatch(/value="color"[^>]*checked=""|checked=""[^>]*value="color"/);
  for (const c of RECOLOR_COLORS) expect(html).toContain(`value="${c.hex}"`);
  expect(html).toContain('Video kết quả dài bằng video gốc và giữ âm thanh gốc.');
  expect(html).not.toMatch(/<textarea|type="range"|role="combobox"|<select/);
  expect(html).toContain('Đang tải danh sách mô hình...'); // the models load in an effect, which a static render does not run
});

test("the form points to Smart Remake for the member's own product only while Smart Remake is on", () => {
  const hint = 'Muốn đặt đúng sản phẩm của bạn, kể cả hình in, vào video? Dùng <a href="/apps/smart-remake">Smart Remake</a>.';
  expect(render(true)).toContain(hint);
  expect(render()).not.toContain('/apps/smart-remake');
});
