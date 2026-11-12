// The analyze History list states: loading, a load error with retry (not the empty message), the empty invitation, and
// the rows where only a succeeded analysis opens.
import type { Analysis } from '@cvs/core/analysis/breakdown';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { AnalysisHistory } from './AnalysisHistory';
import type { AnalysisRow } from './AnalyzeView';

const result: Analysis = {
  durationS: 11.4,
  shotCount: 2,
  format: '商品展示',
  hook: 'Clean apparel presentation.',
  summary: 'A model wears a plain white t-shirt in a studio.',
  shots: [{ index: 1, start: 0, end: 5.2, role: 'mood', prompt: 'Model poses.' }],
};
const row = (o: Partial<AnalysisRow> = {}): AnalysisRow => ({ id: 'a1', status: 'succeeded', result, error: null, createdAt: '2026-11-12T10:00:00.000Z', sourceAssetId: 'v1', ...o });
const render = (p: Partial<Parameters<typeof AnalysisHistory>[0]> = {}) =>
  renderToStaticMarkup(<AnalysisHistory loading={false} error={false} items={[]} onRetry={() => undefined} onPick={() => undefined} {...p} />);

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

test('a succeeded row opens; a failed one is disabled and labelled Không thành công', () => {
  const html = render({ items: [row(), row({ id: 'a2', status: 'failed', result: null, error: 'boom' })] });
  expect(html).toContain('Không thành công');
  expect((html.match(/<button[^>]*\sdisabled/g) ?? []).length).toBe(1); // only the failed row is disabled
});
