import type { Analysis } from '@cvs/core/analysis/breakdown';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { RemakePanel, RemakeResult, type RemakeRow, remakeEstimate } from './RemakePanel';

const base: RemakeRow = { id: 'r1', analysisId: 'a1', status: 'succeeded', result: null, outputAssetId: null, costUsd: null, createdAt: '2026-11-13T00:00:00Z' };

test('the estimate is two paid calls per shot, as the API counts it against the caps', () => {
  expect([remakeEstimate(1), remakeEstimate(6)]).toEqual(['0.15', '0.89']);
});

test('a finished remake shows the joined video with a download, each shot clip, and its cost', () => {
  const html = renderToStaticMarkup(
    <RemakeResult row={{ ...base, outputAssetId: 'out-1', costUsd: '0.295600', result: { shots: [{ index: 1, status: 'succeeded', clipAssetId: 'c1' }, { index: 3, status: 'succeeded', clipAssetId: 'c3' }] } }} />,
  );
  expect(html).toContain('src="/api/assets/out-1/content"');
  expect(html).toContain('href="/api/assets/out-1/download"');
  expect(html).toContain('href="/api/assets/c3/content"');
  expect(html).toContain('Clip cảnh 3');
  expect(html).toContain('$0.30');
});

test('a partial remake keeps the clips that were made and says which shot failed; a failed one with no shot says so', () => {
  const partial = renderToStaticMarkup(<RemakeResult row={{ ...base, status: 'partial', costUsd: '0.187600', result: { shots: [{ index: 1, status: 'succeeded', clipAssetId: 'c1' }, { index: 2, status: 'failed' }] } }} />);
  expect(partial).toContain('Xong một phần');
  expect(partial).toContain('Clip cảnh 1');
  expect(partial).toContain('Cảnh 2 không tạo được');
  expect(partial).not.toContain('<video'); // no joined video

  const failed = renderToStaticMarkup(<RemakeResult row={{ ...base, status: 'failed', costUsd: '0.000000' }} />);
  expect(failed).toContain('Không tạo được video');
});

test('an open remake is announced as running and shows no cost yet', () => {
  const html = renderToStaticMarkup(<RemakeResult row={{ ...base, status: 'running' }} />);
  expect(html).toContain('role="status"');
  expect(html).toContain('Đang tạo video…');
  expect(html).not.toContain('$');
});

test('the form offers every shot of the analysis, caps the pick at 6, and cannot run before a product and a shot are chosen', () => {
  const analysis: Analysis = {
    durationS: 12,
    shotCount: 2,
    format: '',
    hook: '',
    summary: '',
    shots: [
      { index: 1, start: 0, end: 5.2, role: '', prompt: 'p1' },
      { index: 2, start: 5.2, end: 12, role: '', prompt: 'p2' },
    ],
  };
  const html = renderToStaticMarkup(<RemakePanel row={{ id: 'a1', status: 'succeeded', result: analysis, error: null, createdAt: '2026-11-13T00:00:00Z', sourceAssetId: null }} />);
  expect(html.match(/type="checkbox"/g)).toHaveLength(2);
  expect(html).toContain('tối đa 6');
  expect(html).toContain('5.2–12.0s');
  expect(html).toMatch(/<button type="button" class="primary" disabled="">Tạo video với sản phẩm<\/button>/);
});
