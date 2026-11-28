// Settings > "Connect AI": the token list in each state (loading, error, empty, rows, a paused row), the token shown once with its setup text and copy
// note, and the entry that only an Admin sees.
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import { type AgentToken, ShowOnce, signInSnippet, snippet, TokenList } from './AgentAccess';
import { type Account, Settings } from './Settings';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => undefined }) }));

const noop = () => undefined;
const list = (tokens: AgentToken[] | null | 'failed', all = false) => renderToStaticMarkup(<TokenList tokens={tokens} all={all} onRetry={noop} onRevoke={noop} />);
const token = (o: Partial<AgentToken> = {}): AgentToken => ({
  id: 'abcdefghijkl',
  name: 'Claude Code văn phòng',
  kind: 'pat',
  owner: { id: 'u1', name: 'Lan', email: 'lan@vetgroup.net' },
  mine: true,
  createdAt: '2026-11-28T03:00:00.000Z',
  expiresAt: '2026-12-28T03:00:00.000Z',
  lastUsedAt: null,
  lastUsedIp: null,
  status: 'active',
  paused: false,
  monthSpendUsd: '4.5000',
  ...o,
});
const SECRET = `cvs_pat_abcdefghijkl_${'x'.repeat(43)}`;

test('the list says it is loading, offers a retry on failure, and explains an empty list', () => {
  expect(list(null)).toContain('role="status">Đang tải kết nối...</p>');
  const failed = list('failed');
  expect(failed).toContain('role="alert"');
  expect(failed).toContain('Không tải được danh sách khoá.');
  expect(failed).toContain('>Thử lại</button>');
  expect(list([])).toContain('Chưa có kết nối nào.');
  expect(list([], true)).toContain('Chưa ai tạo khoá nào.');
});

test('a row shows its dates, last use, spend this month with no cap, and its actions; the owner only in the everyone view', () => {
  const html = list([token({ lastUsedAt: '2026-11-28T04:05:00.000Z', lastUsedIp: '203.0.113.9' })]);
  expect(html).toContain('<strong>Claude Code văn phòng</strong>');
  expect(html).toContain('Tạo 28/11/2026 · Hết hạn 28/12/2026');
  expect(html).toContain('Dùng lần cuối 11:05 28/11/2026 từ 203.0.113.9');
  expect(html).toContain('<span>Đã chi tháng này</span><strong>$4.50</strong>');
  expect(html).not.toContain('role="meter"');
  expect(html).toContain('data-on="true" data-status="active">Đang dùng</span>');
  expect(html).toContain('aria-label="Thu hồi khoá Claude Code văn phòng"');
  expect(html).not.toContain('hạn mức');
  expect(html).not.toContain('Của Lan');
  expect(list([token({ mine: false })], true)).toContain('Của Lan');
  expect(list([token()], true)).toContain('Của bạn');
});

test('a token with no expiry says it never expires and stays active', () => {
  const html = list([token({ expiresAt: null })]);
  expect(html).toContain('Tạo 28/11/2026 · Không hết hạn');
  expect(html).toContain('data-status="active">Đang dùng</span>');
});

test("a paused row says why; a revoked or expired one has no actions", () => {
  const paused = list([token({ status: 'paused', paused: true })]);
  expect(paused).toContain('Tạm dừng</span>');
  expect(paused).toContain('Đang tạm dừng: chủ khoá không còn là Admin.');
  expect(paused).toContain('Thu hồi');
  for (const status of ['revoked', 'expired'] as const) {
    const html = list([token({ status })]);
    expect(html).not.toContain('Thu hồi khoá');
  }
  expect(list([token({ status: 'expired' })])).toContain('Đã hết hạn 28/12/2026');
});

test('the token is shown once with a warning, a copy note, and the setup text of the first tool', () => {
  const render = (note: string) => renderToStaticMarkup(<ShowOnce created={{ name: 'Claude Code', token: SECRET, origin: 'https://video.vetgroup.net' }} note={note} onCopy={noop} onClose={noop} />);
  const html = render('');
  expect(html).toContain('Khoá chỉ hiện một lần. Đóng mục này là mất.');
  expect(html).toMatch(new RegExp(`<input [^>]*readOnly=""[^>]*value="${SECRET}"`, 'i'));
  expect(html).toContain('aria-live="polite"></p>');
  expect(html).toContain('aria-pressed="true">Claude Code</button>');
  expect(html).toContain('Kiểm tra: hỏi AI “gọi whoami của cvs”.');
  expect(html).not.toContain('bản cập nhật tới');
  expect(html).toContain('>Tôi đã lưu khoá</button>');
  expect(render('Đã sao chép.')).toContain('aria-live="polite">Đã sao chép.</p>');
});

test('each setup text carries the token and the host', () => {
  const origin = 'https://video.vetgroup.net';
  expect(snippet('claude', origin, SECRET)).toBe(`claude mcp add --scope user --transport http cvs ${origin}/api/mcp --header "Authorization: Bearer ${SECRET}"`);
  expect(JSON.parse(snippet('mausbot', origin, SECRET))).toEqual({ mcpServers: { cvs: { type: 'http', url: `${origin}/api/mcp`, headers: { Authorization: `Bearer ${SECRET}` }, enabled: true } } });
  expect(snippet('rest', origin, SECRET)).toBe(`curl -H "Authorization: Bearer ${SECRET}" ${origin}/api/me/limits`);
});

test('only an Admin sees the Kết nối AI entry in Settings', () => {
  const account: Account = {
    email: 'an@vetgroup.net',
    isAdmin: false,
    team: null,
    memberSince: '2026-10-31T18:00:00.000Z',
    passkeys: 0,
    twoFactor: false,
    avatarColor: null,
    methods: [],
    googleEnabled: false,
    larkEnabled: false,
    supportEmail: null,
    company: true,
  };
  const render = (isAdmin: boolean) => renderToStaticMarkup(<Settings open onClose={noop} userName="An" account={{ ...account, isAdmin }} />);
  expect(render(false)).not.toContain('Kết nối AI');
  expect(render(true)).toContain('<span id="settings-nav-agents">Kết nối AI</span>');
});

test('an app that signed in (OAuth) shows its client, no expiry while used, and "Ngắt kết nối" in place of "Thu hồi"', () => {
  const html = list([token({ kind: 'oauth', name: 'OpenMausBot', clientName: 'OpenMausBot', expiresAt: null })]);
  expect(html).toContain('Ứng dụng đã đăng nhập');
  expect(html).toContain('Không hết hạn khi còn dùng');
  expect(html).toContain('aria-label="Ngắt kết nối OpenMausBot"');
  expect(html).not.toContain('Thu hồi khoá');
});

test('the sign-in setup text carries no token: Claude Code adds the server, OpenMausBot gets an mcpServers entry without headers', () => {
  expect(signInSnippet('claude', 'https://cvs.example')).toBe('claude mcp add --scope user --transport http cvs https://cvs.example/api/mcp');
  expect(JSON.parse(signInSnippet('mausbot', 'https://cvs.example'))).toEqual({ mcpServers: { cvs: { type: 'http', url: 'https://cvs.example/api/mcp', enabled: true } } });
});
