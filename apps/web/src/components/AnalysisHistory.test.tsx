// The analyze History list states: loading, a load error with retry (not the empty message), the empty invitation, and
// the cards where only a succeeded analysis opens.
import type { Analysis } from '@cvs/core/analysis/breakdown';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { AnalysisHistory } from './AnalysisHistory';
import type { AnalysisRow } from './AnalyzeView';

const result: Analysis = {
  durationS: 11.4,
  shotCount: 1,
  format: '商品展示',
  hook: 'Clean apparel presentation.',
  summary: 'A model wears a plain white t-shirt in a studio.',
  shots: [{ index: 1, start: 0, end: 5.2, role: 'mood', prompt: 'Model poses.' }],
};
const row = (o: Partial<AnalysisRow> = {}): AnalysisRow => ({ id: 'a1', status: 'succeeded', result, error: null, createdAt: '2026-11-12T10:00:00.000Z', sourceAssetId: 'v1', ...o });
const render = (p: Partial<Parameters<typeof AnalysisHistory>[0]> = {}) =>
  renderToStaticMarkup(<AnalysisHistory loading={false} error={false} items={[]} onRetry={() => undefined} onPick={() => undefined} onDelete={() => undefined} {...p} />);

test('while the first load is in flight it says it is loading', () => {
  expect(render({ loading: true })).toContain('Đang tải…');
});

test('a failed load with no rows shows the retry prompt, not the empty message', () => {
  const html = render({ error: true });
  expect(html).toContain('Không tải được lịch sử phân tích');
  expect(html).toContain('Thử lại');
  expect(html).not.toContain('Chưa có phân tích nào');
});

test('an error that arrives after rows are shown keeps the rows, not the retry prompt', () => {
  const html = render({ error: true, items: [row()] });
  expect(html).not.toContain('Không tải được lịch sử phân tích');
  expect(html).toContain('<li');
});

test('no rows and no error shows the empty invitation', () => {
  expect(render()).toContain('Chưa có phân tích nào');
});

test('a succeeded row is a card button with its format, length, shots and hook; the one on view is marked current', () => {
  const html = render({ items: [row(), row({ id: 'a2' })], currentId: 'a2' });
  expect(html).toContain('Giới thiệu sản phẩm');
  expect(html).toContain('11.4 giây · 1 cảnh');
  expect(html).toContain('Clean apparel presentation.');
  expect(html).toContain('/api/assets/v1/content#t=0.1'); // the source video's first frame is the poster
  expect(html.match(/<button type="button" class="analysis-card"/g)).toHaveLength(2); // a card per row, each a button to open it
  expect(html.match(/aria-current="true"/g)).toHaveLength(1);
});

test('a failed or running row is not a button and says why it cannot be opened', () => {
  const html = render({ items: [row({ id: 'a2', status: 'failed', result: null, error: 'boom' }), row({ id: 'a3', status: 'running', result: null, sourceAssetId: null })] });
  expect(html).toContain('Không thành công');
  expect(html).toContain('không có gì để mở');
  expect(html).toContain('Đang phân tích…');
  expect(html).toContain('Chưa mở được');
  expect(html).not.toContain('<button type="button" class="analysis-card"'); // no card is a button
  expect(html.match(/<video/g)).toHaveLength(1); // the running row's source asset is gone: a placeholder icon, not a player
});

test('a finished row, succeeded or failed, has a delete button, and a queued or running one does not', () => {
  const html = render({
    items: [row(), row({ id: 'a2', status: 'failed', result: null }), row({ id: 'a3', status: 'queued', result: null }), row({ id: 'a4', status: 'running', result: null })],
  });
  expect(html.match(/aria-label="Xoá phân tích"/g)).toHaveLength(2);
});
