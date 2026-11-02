// The Settings dialog: the avatar initials and colour, the sections in order, and the profile card.
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import { type Account, avatarColor, initials, Settings } from './Settings';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => undefined }) }));

const account: Account = {
  email: 'an@vetgroup.net',
  isAdmin: false,
  team: 'Team Ảnh',
  memberSince: '2026-10-31T18:00:00.000Z',
  passkeys: 2,
  twoFactor: false,
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
  expect([...html.matchAll(/<button type="button"(?: aria-current="true")?(?: class="settings-signout")?><svg[^>]*><path[^>]*><\/path><\/svg>([^<]+)<\/button>/g)].map((m) => m[1])).toEqual([
    'Hồ sơ', 'Hạn mức', 'Bảo mật', 'Tài khoản liên kết', 'Hỗ trợ', 'Đăng xuất',
  ]);
  expect(html).toContain('>NA</span>');
  expect(html).toContain('Team Ảnh');
  expect(html).toContain('tháng 11/2026'); // 01:00 on 1 November in Vietnam
  expect(html).toContain('data-role="member">Thành viên</span>');
  expect(render({ isAdmin: true })).toContain('data-role="admin">Admin</span>');
});
