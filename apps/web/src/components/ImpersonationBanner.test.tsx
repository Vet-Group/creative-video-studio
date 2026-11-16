import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { ImpersonationBanner } from './ImpersonationBanner';

test('the banner names the user the Admin is signed in as, says whose account is billed, and offers the way out', () => {
  const html = renderToStaticMarkup(<ImpersonationBanner name="Lan" />);
  expect(html).toContain('Bạn đang đăng nhập thay <strong>Lan</strong>. Mọi thao tác được tính cho tài khoản này.');
  expect(html).toContain('role="status"');
  expect(html).toMatch(/<button[^>]*>Thoát<\/button>/);
});
