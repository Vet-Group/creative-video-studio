// The provider balances panel's top-up link and the Vertex read error: a neutral button, and one short sentence without Google's raw answer.
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { TopUp, VertexError } from './AdminCosts';

test('the top-up link is a neutral button that opens the provider billing page in a new tab', () => {
  const html = renderToStaticMarkup(<TopUp href="https://fal.ai/dashboard/billing" />);
  expect(html).toContain('class="button"');
  expect(html).toContain('href="https://fal.ai/dashboard/billing"');
  expect(html).toContain('target="_blank"');
  expect(html).toContain('rel="noreferrer"');
  expect(html).not.toContain('error');
});

const sentence = (html: string) => html.match(/<p class="error">([^<]*)<\/p>/)?.[1];

test('a Vertex 403 shows one short sentence with the fix, and Google raw answer folded under a closed Chi tiết', () => {
  const raw = 'bigquery tables: HTTP 403 { "error": { "code": 403, "message": "Access Denied: Dataset cvs-vertex:billing_export" } }';
  const html = renderToStaticMarkup(<VertexError projectId="cvs-vertex" reason="no_access" message={raw} />);
  expect(sentence(html)).toBe('Chưa có quyền đọc billing export của cvs-vertex: cấp BigQuery Data Viewer và BigQuery Job User cho khoá của app.');
  expect(sentence(html)).not.toContain('HTTP 403');
  expect(html).toMatch(/<details class="raw"><summary>Chi tiết<\/summary><pre>bigquery tables: HTTP 403/);
  expect(html).not.toContain('<details class="raw" open');
  expect(html).not.toContain('title=');
});

test('the folded answer is capped at 500 characters', () => {
  const html = renderToStaticMarkup(<VertexError projectId="p-1" reason="failed" message={'x'.repeat(800)} />);
  expect(html).toContain(`<pre>${'x'.repeat(500)}</pre>`);
});

test('an empty error message shows the sentence without an empty Chi tiết block', () => {
  const html = renderToStaticMarkup(<VertexError projectId="p-1" reason="failed" message="" />);
  expect(sentence(html)).toBe('Không đọc được billing của p-1.');
  expect(html).not.toContain('<details');
});

test('an unknown reason falls back to the generic sentence', () => {
  expect(sentence(renderToStaticMarkup(<VertexError projectId="p-1" reason="other" message="boom" />))).toBe('Không đọc được billing của p-1.');
});
