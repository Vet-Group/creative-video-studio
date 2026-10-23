// The sign-in methods page: what is linked, which link buttons it offers, and the reason a failed link left in the URL.
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import { SignInMethods } from './SignInMethods';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => undefined }) }));

const credential = { id: 'a1', provider: 'credential', email: null };
const google = { id: 'a2', provider: 'google', email: 'me@gmail.test' };
const render = (props: Partial<Parameters<typeof SignInMethods>[0]>) =>
  renderToStaticMarkup(<SignInMethods methods={[credential]} googleEnabled={false} larkEnabled={false} {...props} />);

test('lists the linked methods, Google with its email, and offers no unlink for the password', () => {
  const html = render({ methods: [credential, google] });
  expect(html).toContain('Email và mật khẩu');
  expect(html).toContain('Google (me@gmail.test)');
  expect(html.match(/Huỷ liên kết/g)).toHaveLength(2); // the Google button's text and its aria-label
});

test('offers a link button only when the provider is on and not linked yet', () => {
  expect(render({}).includes('Liên kết')).toBe(false);
  const both = render({ googleEnabled: true, larkEnabled: true });
  expect(both).toContain('Liên kết Google');
  expect(both).toContain('Liên kết Lark');
  const googleLinked = render({ methods: [credential, google], googleEnabled: true, larkEnabled: true });
  expect(googleLinked).not.toContain('Liên kết Google');
  expect(googleLinked).toContain('Liên kết Lark');
});

test('shows the reason a failed link left in the URL', () => {
  expect(render({ error: 'account_already_linked_to_different_user' })).toContain('đã được liên kết với một người dùng khác');
  expect(render({ error: 'email_does_not_match' })).toContain('không khớp với tài khoản đang đăng nhập');
  const refused = render({ error: 'unable_to_link_account' });
  expect(refused).toContain('Không liên kết được tài khoản này');
  expect(refused).not.toContain('Không đăng nhập được');
});
