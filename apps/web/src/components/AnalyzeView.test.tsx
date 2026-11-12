import type { Analysis } from '@cvs/core/analysis/breakdown';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { ANALYZE_EXAMPLES } from '@/lib/analyze-examples';
import { AnalysisResult, AnalysisWithSource } from './AnalyzeView';

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
});

test('falls back to the model’s own format text when it is not one we label', () => {
  const html = renderToStaticMarkup(<AnalysisResult analysis={{ ...analysis, format: 'surprise party' }} />);
  expect(html).toContain('surprise party');
});

test('a shot with no prompt shows no push-to-Create link, and a blank format falls back to a label', () => {
  const html = renderToStaticMarkup(<AnalysisResult analysis={{ ...analysis, format: '', shots: [{ index: 1, start: 0, end: 2, role: '', prompt: '' }] }} />);
  expect(html).not.toContain('/create?prompt=');
  expect(html).toContain('Video'); // formatLabel('') has no label, so the line shows the fallback
});

test('every read-only Example is well-formed and renders its Vietnamese display with English prompts to push into Create', () => {
  expect(ANALYZE_EXAMPLES.length).toBeGreaterThan(0);
  for (const ex of ANALYZE_EXAMPLES) {
    const a = ex.analysis;
    expect(a.shots.length).toBe(a.shotCount); // the count matches the shots listed
    expect(a.vi?.shots.length).toBe(a.shots.length); // one Vietnamese line per shot, or the display would fall out of step
    const html = renderToStaticMarkup(<AnalysisResult analysis={a} />);
    expect(html).toContain(a.vi!.hook); // Vietnamese for reading
    expect(html).toContain(`href="/create?prompt=${encodeURIComponent(a.shots[0]!.prompt)}"`); // English prompt pushed to Create
  }
});

test('a finished analysis shows its input video beside the result, and omits the player when the source asset is gone', () => {
  const base = { id: 'a1', status: 'succeeded' as const, result: analysis, error: null, createdAt: '2026-11-12T00:00:00Z' };
  const withVideo = renderToStaticMarkup(<AnalysisWithSource row={{ ...base, sourceAssetId: 'vid-1' }} />);
  expect(withVideo).toContain('src="/api/assets/vid-1/content"'); // the input video streams from its asset
  expect(withVideo).toContain('preload="metadata"'); // first-frame poster, no transcode, light history list
  expect(withVideo).toContain('Clean apparel presentation.'); // the result still renders beside it

  const noVideo = renderToStaticMarkup(<AnalysisWithSource row={{ ...base, sourceAssetId: null }} />);
  expect(noVideo).not.toContain('<video');
  expect(noVideo).toContain('Clean apparel presentation.');
});
