// What the login page shows: a social button only when its flag is on, and one message for each error code better-auth leaves in the URL.
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { LoginForm } from './LoginForm';

const render = (props: { googleEnabled?: boolean; larkEnabled?: boolean; error?: string }) =>
  renderToStaticMarkup(<LoginForm googleEnabled={props.googleEnabled ?? false} larkEnabled={props.larkEnabled ?? false} error={props.error} />);

test.each([
  [{}, false, false],
  [{ googleEnabled: true }, true, false],
  [{ larkEnabled: true }, false, true],
  [{ googleEnabled: true, larkEnabled: true }, true, true],
])('shows the social buttons %j as Google %s and Lark %s, after the password form', (props, google, lark) => {
  const html = render(props);
  expect(html.includes('Đăng nhập bằng Google')).toBe(google);
  expect(html.includes('Đăng nhập bằng Lark')).toBe(lark);
  expect(html.includes('Mật khẩu')).toBe(true);
  if (google) expect(html.indexOf('Đăng nhập bằng Google')).toBeGreaterThan(html.indexOf('type="submit"'));
});

test.each([
  ['signup_disabled', 'Email này chưa được cấp quyền. Liên hệ Admin.'],
  ['account_not_linked', 'chưa liên kết với cách đăng nhập vừa dùng'],
  ['BANNED_USER', 'Tài khoản này đã bị khóa. Liên hệ Admin.'],
  ['account_already_linked_to_different_user', 'đã được liên kết với một người dùng khác'],
  ['email_does_not_match', 'không khớp với tài khoản đang đăng nhập'],
  ['unable_to_get_user_info', 'Không lấy được thông tin tài khoản'],
  ['state_mismatch', 'Không đăng nhập được, hãy thử lại sau.'],
])('shows the message for ?error=%s', (code, text) => {
  expect(render({ error: code })).toContain(text);
});

test('shows no error without a code', () => {
  expect(render({})).not.toContain('role="alert"');
});

test('always offers a passkey, also with Google and Lark off, but only once the page can run WebAuthn', () => {
  const html = render({});
  expect(html).toContain('<button type="button" disabled="">Đăng nhập bằng passkey</button>');
  expect(html).toMatch(/autocomplete="username webauthn"/i);
});

test.each([
  ['email', 'type="submit"'],
  ['google', 'Đăng nhập bằng Google'],
  ['lark', 'Đăng nhập bằng Lark'],
  ['passkey', 'Đăng nhập bằng passkey'],
])('marks %s as the method used last, inside its button only', (method, button) => {
  const html = renderToStaticMarkup(<LoginForm googleEnabled larkEnabled lastMethod={method} />);
  expect(html.match(/Lần trước/g)).toHaveLength(1);
  const badge = html.indexOf('<span class="login-last" aria-hidden="true">Lần trước</span>');
  const start = html.lastIndexOf('<button', badge);
  expect(html.slice(start, badge)).toContain(button);
});

test('marks no method without the cookie, and keeps the Caps Lock line empty until a key says it is on', () => {
  const html = render({});
  expect(html).not.toContain('Lần trước');
  expect(html).toContain('<p class="login-hint login-caps" aria-live="polite"></p>');
});
