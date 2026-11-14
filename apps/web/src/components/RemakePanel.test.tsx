import type { Analysis } from '@cvs/core/analysis/breakdown';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { CompareVideoView } from './CompareVideo';
import { RemakePanel, RemakeResult, type RemakeRow, remakeDrafts, remakeEstimate, remakeMinutesLeft } from './RemakePanel';

const base: RemakeRow = { id: 'r1', analysisId: 'a1', productAssetId: 'p1', shots: [], status: 'succeeded', result: null, outputAssetId: null, costUsd: null, createdAt: '2026-11-13T00:00:00Z' };

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

test('initial props pre-tick scenes and fill the product, show the price for them and the note; a saved draft wins over them', () => {
  const analysis: Analysis = { durationS: 12, shotCount: 2, format: '', hook: '', summary: '', shots: [{ index: 1, start: 0, end: 5.2, role: '', prompt: 'p1' }, { index: 2, start: 5.2, end: 12, role: '', prompt: 'p2' }] };
  const panel = (id: string) =>
    renderToStaticMarkup(<RemakePanel row={{ id, status: 'succeeded', result: analysis, error: null, createdAt: '2026-11-13T00:00:00Z', sourceAssetId: null }} initialProduct={[{ id: 'img-2', filename: 'dress.png' }]} initialChosen={[2]} note="AI đã chọn sẵn 1 cảnh." />);
  const html = panel('a-initial');
  expect(html).toContain('dress.png');
  expect(html.match(/checked=""/g)).toHaveLength(1);
  expect(html).toContain(`<span class="run-cost"> · $${remakeEstimate([{ start: 5.2, end: 12 }])}</span>`); // scene 2 only, priced as the API prices it
  expect(html).toContain('AI đã chọn sẵn 1 cảnh.');
  const fixed = renderToStaticMarkup(<RemakePanel row={{ id: 'a-fixed', status: 'succeeded', result: analysis, error: null, createdAt: '2026-11-13T00:00:00Z', sourceAssetId: null }} initialProduct={[{ id: 'img-2', filename: 'dress.png' }]} initialChosen={[2]} productFixed />);
  expect(fixed).not.toContain('dress.png'); // the app's own form holds the product
  expect(fixed).not.toMatch(/<button type="button" class="primary" disabled="">/); // but it still counts: ready to run
  remakeDrafts.set('a-saved', { product: [], chosen: [] });
  expect(panel('a-saved')).not.toContain('dress.png');
  remakeDrafts.clear();
});

test('only a remake that is no longer open offers a delete', () => {
  expect(renderToStaticMarkup(<RemakeResult row={base} onDelete={() => {}} />)).toContain('>Xoá</button>');
  expect(renderToStaticMarkup(<RemakeResult row={{ ...base, status: 'queued' }} onDelete={() => {}} />)).not.toContain('Xoá');
  expect(renderToStaticMarkup(<RemakeResult row={base} />)).not.toContain('Xoá');
});

test('the minutes left count each scene still to make: its billed seconds plus a minute, or 4 when its length is not known, and at least 1', () => {
  const s = (index: number, start: number, end: number) => ({ index, start, end, role: '', prompt: `p${index}` }); // distinct prompts keep them as separate scenes
  const analysis: Analysis = { durationS: 10, shotCount: 3, format: '', hook: '', summary: '', shots: [s(1, 0, 3), s(2, 3, 8), s(3, 8, 10)] }; // billed 3 s, 5 s, 2 s
  const open: RemakeRow = { ...base, status: 'running', shots: [1, 2, 3] };
  expect(remakeMinutesLeft(open, analysis)).toBe(4 + 6 + 3);
  expect(remakeMinutesLeft(open)).toBe(12);
  const first = { ...open, result: { shots: [{ index: 1, status: 'succeeded' as const, clipAssetId: 'c1' }] } };
  expect(remakeMinutesLeft(first, analysis)).toBe(6 + 3);
  expect(remakeMinutesLeft(first)).toBe(8);
  expect(remakeMinutesLeft({ ...open, result: { shots: [1, 2, 3].map((index) => ({ index, status: 'failed' as const })) } }, analysis)).toBe(1);
});

test('an open remake says how many scenes are done of those asked for and about how long is left', () => {
  const open: RemakeRow = { ...base, status: 'running', shots: [1, 3, 5], result: { shots: [{ index: 1, status: 'succeeded', clipAssetId: 'c1' }] } };
  const html = renderToStaticMarkup(<RemakeResult row={open} />);
  expect(html).toContain('Đã xong 1/3 cảnh');
  expect(html).toContain('còn khoảng 8 phút');
  expect(html).not.toContain('việc này mất vài phút');
  expect(renderToStaticMarkup(<RemakeResult row={{ ...base, status: 'queued', shots: [2] }} />)).toContain('Đã xong 0/1 cảnh');
});

test('a finished remake shows the before/after video inline, with the link to open it full size', () => {
  const html = renderToStaticMarkup(<RemakeResult row={{ ...base, outputAssetId: 'out-1', result: { shots: [], compareAssetId: 'cmp' } }} />);
  expect(html).toContain('src="/api/assets/cmp/content"');
  expect(html.match(/<video/g)).toHaveLength(2); // the joined video and the comparison
  expect(html).toContain('preload="metadata"');
  expect(html).toContain('href="/api/assets/cmp/content"');
  expect(renderToStaticMarkup(<RemakeResult row={{ ...base, outputAssetId: 'out-1', result: { shots: [] } }} />).match(/<video/g)).toHaveLength(1); // no comparison made
});

test('a finished remake offers the full-length cut with the source sound beside the scenes-only video, when it was made', () => {
  const html = renderToStaticMarkup(<RemakeResult row={{ ...base, outputAssetId: 'out-1', result: { shots: [], fullAssetId: 'full-1' } }} />);
  expect(html).toContain('href="/api/assets/out-1/download"');
  expect(html).toContain('href="/api/assets/full-1/download"');
  expect(html).toContain('Tải bản đủ dài (có âm thanh gốc)');
  expect(renderToStaticMarkup(<RemakeResult row={{ ...base, outputAssetId: 'out-1', result: { shots: [] } }} />)).not.toContain('bản đủ dài'); // a remake made before it, or whose cut failed
});

test('with a source video each scene gets a decorative thumbnail slot beside its label; without one the picker is text only', () => {
  const analysis: Analysis = { durationS: 12, shotCount: 2, format: '', hook: '', summary: '', shots: [{ index: 1, start: 0, end: 5.2, role: '', prompt: 'p1' }, { index: 2, start: 5.2, end: 12, role: '', prompt: 'p2' }] };
  const panel = (sourceAssetId: string | null) => renderToStaticMarkup(<RemakePanel row={{ id: 'a-thumb', status: 'succeeded', result: analysis, error: null, createdAt: '2026-11-13T00:00:00Z', sourceAssetId }} />);
  const withVideo = panel('src-1');
  expect(withVideo.match(/<span class="analysis-frame" aria-hidden="true">/g)).toHaveLength(2); // still being cut: an empty slot per scene
  expect(withVideo).toContain('type="checkbox"'); // the checkbox and its text label stay
  expect(panel(null)).not.toContain('analysis-frame');
});

test('a clip with its analysis and reference video gets a before/after toggle, with no videos mounted until it opens', () => {
  const analysis: Analysis = { durationS: 12, shotCount: 2, format: '', hook: '', summary: '', shots: [{ index: 1, start: 0, end: 5.2, role: '', prompt: 'p1' }, { index: 2, start: 5.2, end: 12, role: '', prompt: 'p2' }] };
  const row: RemakeRow = { ...base, outputAssetId: 'out-1', result: { shots: [{ index: 2, status: 'succeeded', clipAssetId: 'c2' }, { index: 1, status: 'failed' }], compareAssetId: 'cmp' } };
  const html = renderToStaticMarkup(<RemakeResult row={row} analysis={analysis} sourceAssetId="src-1" />);
  expect(html).toContain('aria-expanded="false">So sánh trước/sau</button>');
  expect(html.match(/aria-expanded="false">So sánh trước\/sau/g)).toHaveLength(1); // the failed shot has none
  expect(html).not.toContain('type="range"'); // closed: no slider and no source of the scene
  expect(html).not.toContain('#t=');
  expect(html).not.toContain('src="/api/assets/c2/content"');
  expect(html).toContain('href="/api/assets/c2/content"'); // the clip link stays
  expect(html).toContain('href="/api/assets/cmp/content"'); // so does the side-by-side
  expect(renderToStaticMarkup(<RemakeResult row={row} analysis={analysis} />)).not.toContain('So sánh trước/sau</button>'); // no reference video
  expect(renderToStaticMarkup(<RemakeResult row={row} sourceAssetId="src-1" />)).not.toContain('So sánh trước/sau</button>'); // no scene timing
});

test('the opened compare view seeks the original to its scene start and offers one slider', () => {
  const html = renderToStaticMarkup(<CompareVideoView before="/api/assets/src-1/content" after="/api/assets/c2/content" start={5.2} end={12} />);
  expect(html).toContain('src="/api/assets/src-1/content#t=5.2"');
  expect(html).toContain('src="/api/assets/c2/content"');
  expect(html).toContain('<input type="range" min="0" max="100" aria-label="So sánh trước và sau"');
  expect(html).toContain('Phát so sánh');
  expect(html).not.toContain('class="error"');
});
