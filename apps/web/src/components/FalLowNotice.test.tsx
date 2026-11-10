import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { FalLowText } from './FalLowNotice';

test('the low fal notice gives the balance, the threshold and a link to fal billing in a new tab', () => {
  const html = renderToStaticMarkup(<FalLowText balance={4.256} warningUsd={10} billingUrl="https://fal.ai/dashboard/billing" />);
  expect(html).toContain('Số dư fal còn $4.26, dưới ngưỡng cảnh báo $10.');
  expect(html).toContain('role="status"');
  expect(html).toContain('<a href="https://fal.ai/dashboard/billing" target="_blank" rel="noopener noreferrer">Nạp tiền trên fal</a>');
});
