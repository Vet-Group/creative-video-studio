import type { Analysis } from '@cvs/core/analysis/breakdown';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { ANALYZE_EXAMPLES } from '@/lib/analyze-examples';
import { AnalysisPanel, AnalysisResult, AnalysisWithSource, type AnalysisRow } from './AnalyzeView';

const analysis: Analysis = {
  durationS: 11.4,
  shotCount: 2,
  format: '商品展示', // a localized label the model returned; the UI maps it to Vietnamese
  hook: 'Clean apparel presentation.',
  summary: 'A model wears a plain white t-shirt in a studio.',
  shots: [
    { index: 1, start: 0, end: 5.2, role: 'mood', prompt: 'Model poses to showcase a plain white t-shirt.' },
    { index: 2, start: 5.2, end: 11.4, role: 'detail', prompt: 'Close-up of the fabric & stitching.' },
  ],
};

test('shows the mapped format, the hook, each shot English prompt and a link that pushes it into Create', () => {
  const html = renderToStaticMarkup(<AnalysisResult analysis={analysis} />);
  expect(html).toContain('Giới thiệu sản phẩm'); // 商品展示 mapped
  expect(html).toContain('Clean apparel presentation.');
  expect(html).toContain('Model poses to showcase a plain white t-shirt.');
  expect(html).toContain(`href="/create?prompt=${encodeURIComponent('Close-up of the fabric & stitching.')}"`);
  expect(html.match(/aria-label="Chép mô tả"/g)).toHaveLength(2); // each shot's prompt can be copied, as on History cards
  expect(html).toContain('Chi tiết'); // the role tag reads in Vietnamese ('detail')
  expect(html).toContain('5.2–11.4s'); // scene times in tenths of a second
  expect(html).toContain(`href="/create?prompt=${encodeURIComponent('Shot 1 (0.0–5.2s): Model poses to showcase a plain white t-shirt.\nShot 2 (5.2–11.4s): Close-up of the fabric & stitching.')}"`); // the whole script
  expect(html).not.toContain('analysis-time'); // no video beside it: the times are plain text
});

test('falls back to the model’s own format text when it is not one we label', () => {
  const html = renderToStaticMarkup(<AnalysisResult analysis={{ ...analysis, format: 'surprise party' }} />);
  expect(html).toContain('Surprise party'); // capitalised as a line start
});

test('a shot with no prompt shows no push-to-Create link, and a blank format falls back to a label', () => {
  const html = renderToStaticMarkup(<AnalysisResult analysis={{ ...analysis, format: '', shots: [{ index: 1, start: 0, end: 2, role: '', prompt: '' }] }} />);
  expect(html).not.toContain('/create?prompt=');
  expect(html).toContain('Video'); // formatLabel('') has no label, so the line shows the fallback
});

test('every read-only Example is a sample clip with a well-formed analysis that renders its Vietnamese display and English prompts', () => {
  expect(ANALYZE_EXAMPLES.length).toBeGreaterThan(0);
  for (const ex of ANALYZE_EXAMPLES) {
    const a = ex.analysis;
    expect(ex.video).toMatch(/^[\w-]+\.mp4$/); // the poster name is derived from it
    expect(a.shots.length).toBe(a.shotCount); // the count matches the shots listed
    expect(a.vi?.shots.length).toBe(a.shots.length); // one Vietnamese line per shot, or the display would fall out of step
    const html = renderToStaticMarkup(<AnalysisWithSource analysis={a} src={`/api/samples/${ex.video}`} preload="none" />);
    expect(html).toContain(`src="/api/samples/${ex.video}"`);
    expect(html).toContain(a.vi!.hook); // Vietnamese for reading
    expect(html).toContain(`href="/create?prompt=${encodeURIComponent(a.shots[0]!.prompt)}"`); // English prompt pushed to Create
    expect(html).toContain('Tua video tới cảnh 1'); // each scene time seeks the video
  }
});

const base: AnalysisRow = { id: 'a1', status: 'succeeded', result: analysis, error: null, createdAt: '2026-11-12T00:00:00Z', sourceAssetId: 'vid-1' };

test('a finished analysis shows its input video beside the result, and omits the player when the source asset is gone', () => {
  const withVideo = renderToStaticMarkup(<AnalysisPanel row={base} onClose={() => undefined} />);
  expect(withVideo).toContain('src="/api/assets/vid-1/content"'); // the input video streams from its asset
  expect(withVideo).toContain('preload="metadata"'); // first-frame poster, no transcode, light history list
  expect(withVideo).toContain('Clean apparel presentation.'); // the result still renders beside it

  const noVideo = renderToStaticMarkup(<AnalysisPanel row={{ ...base, sourceAssetId: null }} onClose={() => undefined} />);
  expect(noVideo).not.toContain('<video');
  expect(noVideo).toContain('Clean apparel presentation.');
});

test('a running analysis shows a status block with the usual wait, and a failed one an alert with retry only when it can be retried', () => {
  const running = renderToStaticMarkup(<AnalysisPanel row={{ ...base, status: 'running', result: null }} onClose={() => undefined} />);
  expect(running).toContain('role="status"');
  expect(running).toContain('1–2 phút');
  const failed = { ...base, status: 'failed' as const, result: null };
  expect(renderToStaticMarkup(<AnalysisPanel row={failed} onClose={() => undefined} />)).not.toContain('Thử lại');
  const retry = renderToStaticMarkup(<AnalysisPanel row={failed} onRetry={() => undefined} onClose={() => undefined} />);
  expect(retry).toContain('role="alert"');
  expect(retry).toContain('Thử lại');
});

test('with a source video each scene has a thumbnail slot that seeks like the time button, and the whole script can be copied', () => {
  const html = renderToStaticMarkup(<AnalysisPanel row={base} onClose={() => undefined} />);
  expect(html.match(/class="analysis-frame"/g)).toHaveLength(2); // a placeholder per scene until its still is cut in the browser
  expect(html).toContain('data-frame="true"');
  expect(html).toContain('Chép kịch bản');
  expect(html).toContain('aria-live="polite"');
  const plain = renderToStaticMarkup(<AnalysisResult analysis={analysis} />);
  expect(plain).not.toContain('analysis-frame'); // no video beside it: no thumbnails
  expect(plain).toContain('Chép kịch bản'); // but the script still copies
  const noVideo = renderToStaticMarkup(<AnalysisPanel row={{ ...base, sourceAssetId: null }} onClose={() => undefined} />);
  expect(noVideo).not.toContain('analysis-frame');
});

test('a thumbnail that is ready is an image button labelled with its scene; one still being cut is a hidden placeholder', () => {
  const html = renderToStaticMarkup(<AnalysisResult analysis={analysis} seek={() => undefined} frames={['data:image/jpeg;base64,AAAA', undefined]} />);
  expect(html).toContain('alt="Khung hình cảnh 1"');
  expect(html).toContain('src="data:image/jpeg;base64,AAAA"');
  expect(html).not.toContain('alt="Khung hình cảnh 2"');
  expect(html.match(/class="analysis-frame"/g)).toHaveLength(2);
  expect(renderToStaticMarkup(<AnalysisResult analysis={analysis} seek={() => undefined} frames={null} />)).not.toContain('analysis-frame'); // a failed cut shows none
});
