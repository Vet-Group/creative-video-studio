// The Settings dialog: the avatar initials and colour, the sections in order, and the profile card.
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import { avatarColor } from '@/lib/profile';
import { type Account, initials, Settings, supportMail } from './Settings';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => undefined }) }));

const account: Account = {
  email: 'an@vetgroup.net',
  isAdmin: false,
  team: 'Team Ảnh',
  memberSince: '2026-10-31T18:00:00.000Z',
  passkeys: 2,
  twoFactor: false,
  avatarColor: null,
  methods: [{ id: 'a1', provider: 'credential', email: null }],
  googleEnabled: false,
  larkEnabled: false,
  supportEmail: null,
};
const render = (a: Partial<Account> = {}) => renderToStaticMarkup(<Settings open onClose={() => undefined} userName="Nguyễn Văn An" account={{ ...account, ...a }} />);

test('initials take the first and last word, or two letters of one word', () => {
  expect(initials('Nguyễn Văn An')).toBe('NA');
  expect(initials('  ánh  ')).toBe('ÁN');
  expect(initials('')).toBe('?');
});

test('a name always gets the same avatar colour', () => {
  expect(avatarColor('Nguyễn Văn An')).toBe(avatarColor('Nguyễn Văn An'));
  expect(new Set(['An', 'Bình', 'Chi', 'Dũng', 'Hà', 'Lan', 'Minh', 'Quân'].map(avatarColor)).size).toBeGreaterThan(1);
});

test('lists the sections in order with sign-out last, and the profile with team, role and the month joined in Vietnam time', () => {
  const html = render();
  expect([...html.matchAll(/<span id="settings-nav-[a-z]+">([^<]+)<\/span>|class="settings-signout"><svg[^>]*><path[^>]*><\/path><\/svg>([^<]+)</g)].map((m) => m[1] ?? m[2])).toEqual([
    'Hồ sơ', 'Hạn mức', 'Bảo mật', 'Tuỳ chọn', 'Phương thức đăng nhập', 'Hỗ trợ', 'Đăng xuất',
  ]);
  expect(html).toContain('>NA</span>');
  expect(html).toContain('Team Ảnh');
  expect(html).toContain('tháng 11/2026'); // 01:00 on 1 November in Vietnam
  expect(html).toContain('data-role="member">Thành viên</span>');
  expect(render({ isAdmin: true })).toContain('data-role="admin">Admin</span>');
});

test('the profile shows the picked avatar colour, the protection score and a way to each missing check', () => {
  const html = render({ avatarColor: '#4338ca' });
  expect(html).toContain('--avatar:#4338ca');
  expect(html).toContain('aria-label="Đạt 2 trên 3"'); // password and passkeys, no 2FA
  expect(html).toContain('aria-label="Thiết lập Xác thực 2 lớp"');
  expect(html).not.toContain('Thiết lập Passkey');
  expect(render({ methods: [{ id: 'g1', provider: 'google', email: null }], passkeys: 0 })).toContain('aria-label="Đạt 1 trên 2"');
});

test('the support mail names the page and the account in its body', () => {
  const url = new URL(supportMail('help@vetgroup.net', 'an@vetgroup.net', 'https://video.vetgroup.net/try-on'));
  expect([url.protocol, url.pathname]).toEqual(['mailto:', 'help@vetgroup.net']);
  expect(url.searchParams.get('subject')).toBe('Cần hỗ trợ Creative Video Studio');
  expect(url.searchParams.get('body')).toBe('Trang: https://video.vetgroup.net/try-on\nTài khoản: an@vetgroup.net\n\nMô tả vấn đề (kèm ảnh chụp màn hình nếu có):\n');
});
