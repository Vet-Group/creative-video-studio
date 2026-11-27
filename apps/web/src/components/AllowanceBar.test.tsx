// The allowance bar's forecast line (docs/BILLING.md): the month's end at the pace so far and what it would bill, labelled an estimate.
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { AllowanceBar, freeLeftText } from './AllowanceBar';
import { closeMailText } from './admin/AdminBilling';

const forecast = (html: string) => html.match(/<p class="allowance-forecast"[^>]*>(.*?)<\/p>/)?.[1]?.replaceAll('<!-- -->', '');

test('a forecast under the allowance shows the month-end figure alone, as an estimate', () => {
  const html = renderToStaticMarkup(<AllowanceBar totalUsd="6.0000" freeUsd="20.0000" label="Sales A" forecastUsd="12.0000" />);
  expect(forecast(html)).toBe('Dự báo cuối tháng (ước tính): ~$12.00');
});

test('a forecast past the allowance also says what it would bill the team', () => {
  const html = renderToStaticMarkup(<AllowanceBar totalUsd="10.0000" freeUsd="20.0000" label="Sales A" forecastUsd="31.5000" />);
  expect(forecast(html)).toBe('Dự báo cuối tháng (ước tính): ~$31.50; tính cho team ~$11.50');
});

test('no forecast line without a forecast or for a month with no cost yet', () => {
  expect(renderToStaticMarkup(<AllowanceBar totalUsd="6.0000" freeUsd="20.0000" label="Sales A" />)).not.toContain('allowance-forecast');
  expect(renderToStaticMarkup(<AllowanceBar totalUsd="0.0000" freeUsd="20.0000" label="Sales A" forecastUsd="0.0000" />)).not.toContain('allowance-forecast');
});

test('the line over Run says what the free allowance still holds, that it is used up, or nothing without one', () => {
  expect(freeLeftText({ monthUsd: '7.6000', freeUsd: '20.0000' })).toBe('Team bạn còn $12.40 miễn phí tháng này');
  expect(freeLeftText({ monthUsd: '0.0000', freeUsd: '20.0000' })).toBe('Team bạn còn $20.00 miễn phí tháng này');
  expect(freeLeftText({ monthUsd: '20.0000', freeUsd: '20.0000' })).toBe('Team bạn đã dùng hết $20.00 miễn phí tháng này; phần vượt tính cho team');
  expect(freeLeftText({ monthUsd: '31.5000', freeUsd: '20.0000' })).toBe('Team bạn đã dùng hết $20.00 miễn phí tháng này; phần vượt tính cho team');
  expect(freeLeftText({ monthUsd: '3.0000', freeUsd: '0.0000' })).toBeNull();
});

test('the close notice tells the Admin who was reached, or that the CSV must be sent by hand', () => {
  expect(closeMailText({ sent: 3, failed: [] })).toBe('Đã chốt tháng và gửi bản tóm tắt cùng CSV qua Lark cho 3 người.');
  expect(closeMailText({ sent: 1, failed: ['x'] })).toBe('Đã chốt tháng, nhưng gửi qua Lark chỉ tới 1 người, lỗi 1: hãy tải CSV và gửi cho kế toán.');
  expect(closeMailText({ sent: 0, failed: ['x', 'y'] })).toBe('Đã chốt tháng, nhưng gửi qua Lark không được: hãy tải CSV và gửi cho kế toán.');
  expect(closeMailText('off')).toBe('Đã chốt tháng. Gửi qua Lark đang tắt: hãy tải CSV và gửi cho kế toán.');
});
