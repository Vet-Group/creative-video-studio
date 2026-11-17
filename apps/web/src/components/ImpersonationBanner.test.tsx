import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { ImpersonationBanner } from './ImpersonationBanner';

test('the banner names the user the Admin is signed in as, says whose account is billed, and offers the way out', () => {
  const html = renderToStaticMarkup(<ImpersonationBanner name="Lan" />);
  // The billing note is its own span, which a phone hides to keep the banner to one line.
  expect(html).toContain('Bạn đang đăng nhập thay <strong>Lan</strong>.<span class="impersonation-note"> Mọi thao tác được tính cho tài khoản này.</span>');
  expect(html).toContain('role="status"');
  expect(html).toMatch(/<button[^>]*>Thoát<\/button>/);
});
