// The provider balances panel's top-up link and the Vertex read error: a neutral button, and one short sentence without Google's raw answer.
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { ByModel, DailySpend, dollars, packText, sameDayChange, TopUp, Usd, VertexError } from './AdminCosts';
import { Budget } from './AdminOverview';

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

test('a negative amount puts the sign before the dollar', () => {
  expect([dollars('-0.1161', 4), dollars(-0.1161, 4), dollars('2.50'), dollars(3, 2)]).toEqual(['-$0.1161', '-$0.1161', '$2.50', '$3.00']);
});

test('an amount shows 2 decimals with the exact 4 decimals and the VND on hover, and a zero can show as a dash', () => {
  const sr = (exact: string) => `<span class="sr-only"> (${exact})</span>`;
  expect(renderToStaticMarkup(<Usd m={{ usd: '9.3086', usdDisplay: '9.31', vnd: null }} />)).toBe(`<span title="$9.3086">$9.31${sr('$9.3086')}</span>`);
  const minus = `-$1.0000 · ${(-25000).toLocaleString('vi-VN')} ₫`;
  expect(renderToStaticMarkup(<Usd m={{ usd: '-1.0000', usdDisplay: '-1.00', vnd: '-25000' }} />)).toBe(`<span title="${minus}">-$1.00${sr(minus)}</span>`);
  expect(renderToStaticMarkup(<Usd m={{ usd: '0.0000', usdDisplay: '0.00', vnd: null }} dashZero />)).toBe('<span class="muted">—</span>');
  expect(renderToStaticMarkup(<Usd m={{ usd: '0.0000', usdDisplay: '0.00', vnd: null }} />)).toBe(`<span title="$0.0000">$0.00${sr('$0.0000')}</span>`);
});

test('the daily chart draws one bar per day scaled to the largest day, lists only the days with spend in its table, and hides when nothing was spent', () => {
  const days = [
    { day: '2026-11-01', usd: '0.0000' },
    { day: '2026-11-02', usd: '4.0000' },
    { day: '2026-11-03', usd: '1.0000' },
  ];
  const html = renderToStaticMarkup(<DailySpend days={days} />);
  expect(html.match(/<li /g)).toHaveLength(3);
  expect(html).toContain('style="height:100%"');
  expect(html).toContain('style="height:25%"');
  expect(html).toContain('title="02/11: $4.0000"');
  expect(html.match(/<tr><td>/g)).toHaveLength(2);
  expect(renderToStaticMarkup(<DailySpend days={[{ day: '2026-11-01', usd: '0.0000' }]} />)).toBe('');
});

test('the model table names the provider, counts jobs or LLM calls, and is left out when the month is empty', () => {
  const html = renderToStaticMarkup(
    <ByModel
      lines={[
        { provider: 'vertex', model: null, label: 'Chênh lệch hóa đơn', jobs: 0, calls: 0, usd: '4.9307', usdDisplay: '4.93' },
        { provider: 'openai', model: 'gpt-6-luna', label: 'gpt-6-luna', jobs: 0, calls: 18, usd: '0.0106', usdDisplay: '0.01' },
      ]}
    />,
  );
  expect(html).toContain('<td>Chênh lệch hóa đơn</td><td>Vertex</td><td class="num">—</td>');
  expect(html).toContain('<td class="num">18 lượt</td><td class="num" title="$0.0106">$0.01</td>');
  const both = renderToStaticMarkup(<ByModel lines={[{ provider: 'fal', model: 'm', label: 'M', jobs: 2, calls: 3, usd: '1.0000', usdDisplay: '1.00' }]} />);
  expect(both).toContain('<td class="num">2 job · 3 lượt</td>');
  expect(renderToStaticMarkup(<ByModel lines={[]} />)).toBe('');
});

test('a budget of $100,000 or more reads as no cap, without a bar; a real cap keeps its bar', () => {
  const none = renderToStaticMarkup(<Budget title="Ngân sách video" used="12.93" cap="100000.0000" />);
  expect(none).toContain('Không giới hạn');
  expect(none).not.toContain('meter');
  const real = renderToStaticMarkup(<Budget title="Ngân sách video" used="50" cap="200" />);
  expect(real).toContain('meter');
  expect(real).toContain('Đã dùng 25%');
});

test('the Seedance 2.0 pack line shows tokens left of the total, the percent, about how many dollars and the expiry day, and says why it is red', () => {
  const pack = { totalTokens: 7_000_000, tokensLeft: 6_891_100, percentLeft: 98.44, usdLeft: 48.2377, expiresAt: '2027-02-01T15:59:59.000Z', expired: false, daysLeft: 87.2, low: false };
  const n = (v: number) => v.toLocaleString('vi-VN');
  expect(packText(pack)).toBe(`Còn ${n(6_891_100)} / ${n(7_000_000)} token (98.4%) · ≈ $48.24 theo giá lẻ · hết hạn 2027-02-01`);
  expect(packText({ ...pack, tokensLeft: 1_000_000, percentLeft: 14.29, usdLeft: 7, low: true })).toBe(`Còn ${n(1_000_000)} / ${n(7_000_000)} token (14.3%) · ≈ $7.00 theo giá lẻ · hết hạn 2027-02-01 (dưới 20%)`);
  expect(packText({ ...pack, daysLeft: 9.2, low: true })).toContain('(còn 10 ngày)');
  expect(packText({ ...pack, daysLeft: -1, expired: true, low: true })).toContain('(đã hết hạn)');
});

test('the same-day comparison sums only the days elapsed, gives the percent change, and has no percent when last month was empty', () => {
  const d = (...v: number[]) => v.map((n) => ({ usd: n.toFixed(4) }));
  expect(sameDayChange(d(1, 2, 9), d(2, 2, 100), 2)).toEqual({ cur: 3, prev: 4, pct: -25 });
  expect(sameDayChange(d(3, 3), d(1, 1), 2).pct).toBe(200);
  expect(sameDayChange(d(1, 2), d(0, 0), 2)).toEqual({ cur: 3, prev: 0, pct: null });
});

test('a budget bar turns amber from 80%, red at the cap, and a zero cap reads as locked; the no-limit sentinel starts at exactly $100,000', () => {
  const level = (used: string, cap: string) => renderToStaticMarkup(<Budget title="T" used={used} cap={cap} />).match(/data-level="(\w+)"/)?.[1];
  expect([level('50', '100'), level('80', '100'), level('100', '100'), level('1', '0')]).toEqual(['ok', 'high', 'full', 'full']);
  expect(renderToStaticMarkup(<Budget title="T" used="1" cap="0" />)).toContain('Đang khoá');
  expect(renderToStaticMarkup(<Budget title="T" used="1" cap="99999" />)).toContain('meter');
  expect(renderToStaticMarkup(<Budget title="T" used="1" cap="100000" />)).toContain('Không giới hạn');
});
