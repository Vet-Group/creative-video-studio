// The analyze History list states: loading, a load error with retry (not the empty message), the empty invitation, and
// the cards where only a succeeded analysis opens.
import type { Analysis } from '@cvs/core/analysis/breakdown';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, test, vi } from 'vitest';
import { AnalysisHistory, EveryoneChoice, whenSeen } from './AnalysisHistory';
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
  expect(html.match(/<video[^>]*preload="metadata"/g)).toHaveLength(2); // the source video's first frame is the poster…
  expect(html).not.toContain('/content'); // …fetched only once its card scrolls into view: up to 50 rows open no stream before then
  expect(html.match(/<button type="button" class="analysis-card"/g)).toHaveLength(2); // a card per row, each a button to open it
  expect(html.match(/aria-current="true"/g)).toHaveLength(1);
});

test('a failed or running row is not a button and says why it cannot be opened', () => {
  const html = render({ items: [row({ id: 'a2', status: 'failed', result: null, error: 'boom' }), row({ id: 'a3', status: 'running', result: null, sourceAssetId: null })] });
  expect(html).toContain('Không thành công');
  expect(html).toContain('Phân tích không thành công. Hãy thử lại với video khác.'); // the reason, mapped from the raw error
  expect(html).toContain('Đang phân tích…');
  expect(html).toContain('Chưa mở được');
  expect(html).not.toContain('<button type="button" class="analysis-card"'); // no card is a button
  expect(html.match(/<video/g)).toHaveLength(1); // the running row's source asset is gone: a placeholder icon, not a player
});

test('a failed row says the mapped reason and, with onReuse, offers its own video again; not for another member’s row or a deleted video', () => {
  const failed = row({ id: 'a2', status: 'failed', result: null, error: 'could not queue the analysis' });
  const html = render({ items: [failed, row({ id: 'a3', status: 'failed', result: null, sourceAssetId: null }), row({ id: 'a4', status: 'failed', result: null, creatorName: 'Lan' })], onReuse: () => undefined });
  expect(html).toContain('Máy chủ phân tích đang bận');
  expect(html.match(/>Dùng video này lại<\/button>/g)).toHaveLength(1);
  expect(render({ items: [failed] })).not.toContain('Dùng video này lại'); // without onReuse
});

test('a succeeded row leads with its summary, its format a tag beside the length', () => {
  const html = render({ items: [row()] });
  expect(html).toContain('<strong class="analysis-card-title">A model wears a plain white t-shirt in a studio.</strong>');
  expect(html).toContain('<span class="analysis-role">Giới thiệu sản phẩm</span>');
  expect(render({ items: [row({ result: { ...result, summary: '' } })] })).toContain('<strong class="analysis-card-title">Giới thiệu sản phẩm</strong>');
});

test('a finished row, succeeded or failed, has a delete button, and a queued or running one does not', () => {
  const html = render({
    items: [row(), row({ id: 'a2', status: 'failed', result: null }), row({ id: 'a3', status: 'queued', result: null }), row({ id: 'a4', status: 'running', result: null })],
  });
  expect(html.match(/aria-label="Xoá phân tích"/g)).toHaveLength(2);
});

test("another member's analysis names its creator and has no delete button, while the caller's own keeps it", () => {
  const html = render({ items: [row({ id: 'mine' }), row({ id: 'theirs', creatorName: 'Lan' })] });
  expect(html.match(/Người tạo: Lan/g)).toHaveLength(1);
  expect(html.match(/aria-label="Xoá phân tích"/g)).toHaveLength(1);
  expect(render({ items: [row()] })).not.toContain('Người tạo');
});

test('the Admin choice is a labelled checkbox that follows its state', () => {
  const off = renderToStaticMarkup(<EveryoneChoice checked={false} onChange={() => undefined} />);
  expect(off).toContain('Mọi người');
  expect(off).toContain('type="checkbox"');
  expect(off).not.toContain('checked');
  expect(renderToStaticMarkup(<EveryoneChoice checked onChange={() => undefined} />)).toContain('checked=""');
});

afterEach(() => vi.unstubAllGlobals());

test("a card's video is told to load once its card first scrolls into view, and at once where the browser has no IntersectionObserver", () => {
  let fire: (entries: { isIntersecting: boolean }[]) => void = () => undefined;
  const disconnect = vi.fn();
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(cb: typeof fire) {
        fire = cb;
      }
      observe() {}
      disconnect = disconnect;
    },
  );
  const seen = vi.fn();
  const stop = whenSeen({} as Element, seen);
  fire([{ isIntersecting: false }]);
  expect(seen).not.toHaveBeenCalled(); // still off screen: no src yet
  fire([{ isIntersecting: true }]);
  expect(seen).toHaveBeenCalledTimes(1); // CardVideo sets its src now
  expect(disconnect).toHaveBeenCalled(); // watched once
  stop();

  vi.stubGlobal('IntersectionObserver', undefined);
  const now = vi.fn();
  whenSeen({} as Element, now)();
  expect(now).toHaveBeenCalledTimes(1);
});
