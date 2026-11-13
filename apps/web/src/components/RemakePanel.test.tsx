import type { Analysis } from '@cvs/core/analysis/breakdown';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { RemakePanel, RemakeResult, type RemakeRow, remakeDrafts, remakeEstimate } from './RemakePanel';

const base: RemakeRow = { id: 'r1', analysisId: 'a1', status: 'succeeded', result: null, outputAssetId: null, costUsd: null, createdAt: '2026-11-13T00:00:00Z' };

test('the estimate is each shot billed at its length in whole seconds (2 to 10) at $0.10, as the API counts it against the caps', () => {
  expect(remakeEstimate([{ start: 0, end: 1 }])).toBe('0.40'); // 2 s sent + 2 s made
  expect(remakeEstimate([{ start: 0, end: 2.1 }, { start: 2.1, end: 30 }])).toBe('2.60'); // (3 s + 10 s) twice
});

test('a finished remake shows the joined video with a download, each shot clip, and its cost', () => {
  const html = renderToStaticMarkup(
    <RemakeResult row={{ ...base, outputAssetId: 'out-1', costUsd: '0.295600', result: { shots: [{ index: 1, status: 'succeeded', clipAssetId: 'c1' }, { index: 3, status: 'succeeded', clipAssetId: 'c3' }], compareAssetId: 'cmp' } }} />,
  );
  expect(html).toContain('src="/api/assets/out-1/content"');
  expect(html).toContain('href="/api/assets/out-1/download"');
  expect(html).toContain('href="/api/assets/cmp/content"');
  expect(html).toContain('Xem so sánh trước/sau');
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

test('the form offers the scenes the result list shows, sending each as its first stored shot, and a clip is named by its scene', () => {
  const s = (index: number, start: number, end: number, prompt: string) => ({ index, start, end, role: 'proof', prompt });
  const analysis: Analysis = { durationS: 8, shotCount: 4, format: '', hook: '', summary: '', shots: [s(1, 0, 1.2, 'Pan.'), s(2, 1.2, 2.3, 'Pan.'), s(3, 2.3, 4, 'Spin.'), s(4, 4, 8, 'Spin.')] };
  const html = renderToStaticMarkup(<RemakePanel row={{ id: 'a1', status: 'succeeded', result: analysis, error: null, createdAt: '2026-11-13T00:00:00Z', sourceAssetId: null }} />);
  expect(html.match(/type="checkbox"/g)).toHaveLength(2);
  expect(html).toContain('Cảnh 2<span class="muted">2.3–8.0s</span>');
  expect(html).not.toContain('Cảnh 3');

  const scene = (index: number) => [1, 3].filter((f) => f <= index).length;
  const done = renderToStaticMarkup(<RemakeResult row={{ ...base, status: 'partial', result: { shots: [{ index: 1, status: 'failed' }, { index: 3, status: 'succeeded', clipAssetId: 'c3' }] } }} scene={scene} />);
  expect(done).toContain('Cảnh 1 không tạo được');
  expect(done).toContain('Clip cảnh 2');
});

test('a panel mounted again for the same analysis starts with the draft it saved, and one for another analysis starts empty', () => {
  const analysis: Analysis = { durationS: 12, shotCount: 2, format: '', hook: '', summary: '', shots: [{ index: 1, start: 0, end: 5.2, role: '', prompt: 'p1' }, { index: 2, start: 5.2, end: 12, role: '', prompt: 'p2' }] };
  const panel = (id: string) => renderToStaticMarkup(<RemakePanel row={{ id, status: 'succeeded', result: analysis, error: null, createdAt: '2026-11-13T00:00:00Z', sourceAssetId: null }} />);
  remakeDrafts.set('a-draft', { product: [{ id: 'img-1', filename: 'shirt.png' }], chosen: [2] });
  const again = panel('a-draft');
  expect(again).toContain('shirt.png');
  expect(again.match(/checked=""/g)).toHaveLength(1);
  expect(again).not.toMatch(/<button type="button" class="primary" disabled="">/); // a product and a shot: ready to run
  expect(panel('a-other')).not.toContain('shirt.png');
  remakeDrafts.clear();
});

test('only a remake that is no longer open offers a delete', () => {
  expect(renderToStaticMarkup(<RemakeResult row={base} onDelete={() => {}} />)).toContain('>Xoá</button>');
  expect(renderToStaticMarkup(<RemakeResult row={{ ...base, status: 'queued' }} onDelete={() => {}} />)).not.toContain('Xoá');
  expect(renderToStaticMarkup(<RemakeResult row={base} />)).not.toContain('Xoá');
});
