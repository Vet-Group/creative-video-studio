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

test('a Vertex 403 shows one short sentence with the fix, and Google raw answer only in the tooltip', () => {
  const raw = 'bigquery tables: HTTP 403 { "error": { "code": 403, "message": "Access Denied: Dataset cvs-vertex:billing_export" } }';
  const html = renderToStaticMarkup(<VertexError projectId="cvs-vertex" reason="no_access" message={raw} />);
  const text = html.replace(/<[^>]+>/g, '');
  expect(text).toBe('Chưa có quyền đọc billing export của cvs-vertex: cấp BigQuery Data Viewer và BigQuery Job User cho khóa của app.');
  expect(text).not.toContain('HTTP 403');
  expect(html).toContain('title="bigquery tables: HTTP 403');
});

test('an unknown reason falls back to the generic sentence', () => {
  const text = renderToStaticMarkup(<VertexError projectId="p-1" reason="other" message="boom" />).replace(/<[^>]+>/g, '');
  expect(text).toBe('Không đọc được billing của p-1.');
});
