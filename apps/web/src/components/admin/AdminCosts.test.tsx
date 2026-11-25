// The Costs pages' parts: the provider balances panel's top-up link, the Vertex read error, amounts, the daily chart, the breakdown table and the budgets.
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { axisTicks, Breakdown, costChange, DailyChart, dollars, modelUnits, packText, shareText, TopUp, Usd, VertexError } from './AdminCosts';
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

test('the daily chart draws one focusable bar per day on a $ axis, with its tooltip, the pace line, a table of the days with spend, and flat bars when nothing was spent', () => {
  const days = [
    { day: '2026-11-01', usd: '0.0000' },
    { day: '2026-11-02', usd: '4.0000' },
    { day: '2026-11-03', usd: '1.0000' },
  ];
  const html = renderToStaticMarkup(<DailyChart days={days} pace={2} />);
  expect(html.match(/<button /g)).toHaveLength(3);
  // The axis runs 0, 1, 2, 3, 4: the largest day is the full height, the pace line sits at half.
  expect([...html.matchAll(/<span style="bottom:([\d.]+)%">\$([\d.]+)<\/span>/g)].map((m) => [m[1], m[2]])).toEqual([['0', '0'], ['25', '1'], ['50', '2'], ['75', '3'], ['100', '4']]);
  expect(html).toContain('style="--h:100%"');
  expect(html).toContain('style="--h:25%"');
  expect(html).toContain('<p class="day-pace" style="bottom:50%"><span>Mức đều để vừa hạn mức video: $2.00/ngày</span></p>');
  // One tab stop, on the last day with spend; each bar reads its full date and amount.
  expect(html.match(/tabindex="0"/g)).toHaveLength(1);
  expect(html).toContain('tabindex="0" aria-label="03/11/2026: $1.0000"');
  expect(html).toContain('<span class="day-tip" aria-hidden="true">02/11: $4.00</span>');
  expect(html.match(/<tr><td>/g)).toHaveLength(2);
  const none = renderToStaticMarkup(<DailyChart days={[{ day: '2026-11-01', usd: '0.0000' }]} pace={null} />);
  expect(none).toContain('style="--h:0%"');
  expect(none).toContain('$1</span>');
});

test('the date labels thin out to about eight, and every other one is marked to hide on a phone', () => {
  const days = Array.from({ length: 30 }, (_, i) => ({ day: `2026-11-${String(i + 1).padStart(2, '0')}`, usd: '1.0000' }));
  const html = renderToStaticMarkup(<DailyChart days={days} pace={null} />);
  const labels = [...html.matchAll(/<span style="grid-column:(\d+)"( data-minor="true")?>(\d\d\/\d\d)<\/span>/g)].map((m) => [m[3], !!m[2]]);
  expect(labels).toEqual([['01/11', false], ['05/11', true], ['09/11', false], ['13/11', true], ['17/11', false], ['21/11', true], ['25/11', false], ['29/11', true]]);
  expect(html).not.toContain('day-pace');
});

test('the axis steps are 1, 2, 2.5 or 5 times a power of ten and reach the largest value', () => {
  expect(axisTicks(4)).toEqual([0, 1, 2, 3, 4]);
  expect(axisTicks(4.5)).toEqual([0, 2, 4, 6]);
  expect(axisTicks(100)).toEqual([0, 25, 50, 75, 100]);
  expect(axisTicks(0.0016).at(-1)).toBeCloseTo(0.002);
  expect(axisTicks(0)).toEqual([0, 1]);
});

test('the change against the period before says up or down in words, with the arrow beside it', () => {
  const prev = { usd: '100.0000', usdDisplay: '100.00', label: 'Tháng 10/2026' };
  expect(costChange('112.4000', prev)).toEqual({ arrow: '↑', text: 'Tăng 12% so với Tháng 10/2026 ($100.00)' });
  expect(costChange('75.0000', prev)).toEqual({ arrow: '↓', text: 'Giảm 25% so với Tháng 10/2026 ($100.00)' });
  expect(costChange('100.2000', prev)).toEqual({ arrow: '→', text: 'Không đổi so với Tháng 10/2026 ($100.00)' });
  expect(costChange('5.0000', { ...prev, usd: '0.0000', usdDisplay: '0.00' })).toEqual({ arrow: '', text: 'Tháng 10/2026 chưa có chi phí để so sánh' });
});

test('a breakdown sorts by USD first with aria-sort, draws each line share of the total, keeps the email in a title and names the line on its button', () => {
  const line = (id: string, usd: string, email: string) => ({ id, name: id.toUpperCase(), email, usd, usdDisplay: usd.slice(0, -2), vnd: null });
  const html = renderToStaticMarkup(
    <Breakdown label="Người dùng" lines={[line('b', '1.0000', 'b@x.test'), line('a', '3.0000', 'a@x.test'), line('c', '0.0010', 'c@x.test')]} name={(l) => l.name} title={(l) => l.email} columns={[]} total="4.0010" jobs={() => null} />,
  );
  expect(html).toContain('<th scope="col" class="num" aria-sort="descending"><button type="button" class="sort">USD<span aria-hidden="true">↓</span></button></th>');
  expect(html.match(/aria-sort=/g)).toHaveLength(1);
  expect([...html.matchAll(/<span aria-hidden="true">▸<\/span> (\w)/g)].map((m) => m[1])).toEqual(['A', 'B', 'C']);
  expect(html).toContain('title="a@x.test"');
  expect(html).not.toContain('who');
  expect(html).toMatch(/<span style="width:74\.98\d*%"><\/span><\/span><span class="share-pct">75%<\/span>/);
  expect(html).toContain('&lt;1%');
});

test('a model line counts its jobs as lượt tạo and its LLM calls as lượt gọi', () => {
  expect([modelUnits({ jobs: 2, calls: 0 }), modelUnits({ jobs: 0, calls: 18 }), modelUnits({ jobs: 2, calls: 3 }), modelUnits({ jobs: 0, calls: 0 })]).toEqual([
    '2 lượt tạo',
    '18 lượt gọi',
    '2 lượt tạo · 3 lượt gọi',
    '—',
  ]);
  expect([shareText(0), shareText(0.4), shareText(12.5)]).toEqual(['0%', '<1%', '13%']);
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

test('a budget bar turns amber from 80%, red at the cap, and a zero cap reads as locked; the no-limit sentinel starts at exactly $100,000', () => {
  const level = (used: string, cap: string) => renderToStaticMarkup(<Budget title="T" used={used} cap={cap} />).match(/data-level="(\w+)"/)?.[1];
  expect([level('50', '100'), level('80', '100'), level('100', '100'), level('1', '0')]).toEqual(['ok', 'high', 'full', 'full']);
  expect(renderToStaticMarkup(<Budget title="T" used="1" cap="0" />)).toContain('Đang khoá');
  expect(renderToStaticMarkup(<Budget title="T" used="1" cap="99999" />)).toContain('meter');
  expect(renderToStaticMarkup(<Budget title="T" used="1" cap="100000" />)).toContain('Không giới hạn');
});
