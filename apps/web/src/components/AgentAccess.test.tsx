// Settings > "Connect AI": the token list in each state (loading, error, empty, rows, a paused row), the token shown once with its setup text and copy
// note, the entry that only an Admin sees, the three setup steps, and each row's check line and activity panel.
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import type { ActivityItem } from '@/lib/agent-activity';
import { ActivityLog, AgentAccess, type AgentToken, CheckLine, ConnectCheck, ShowOnce, SignInSetup, signInSnippet, snippet, type TokenCheck, TokenList } from './AgentAccess';
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
  expect(html).toContain('Dán vào Claude Code');
  expect(html).toContain(`--header &quot;Authorization: Bearer ${SECRET}&quot;`);
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

test('the setup reads as three steps: pick the tool, connect by signing in first, then check', () => {
  const html = renderToStaticMarkup(<AgentAccess />);
  expect(html.match(/class="agent-step"/g)).toHaveLength(3);
  for (const [n, title] of [[1, 'Chọn công cụ'], [2, 'Kết nối'], [3, 'Kiểm tra']] as const) expect(html).toContain(`<span class="sr-only">Bước ${n}: </span>${title}</h4>`);
  expect(html).toContain('role="group" aria-label="Công cụ AI"');
  expect(html).toContain('aria-pressed="true">Claude Code</button>');
  expect(html).toContain('aria-pressed="false">OpenMausBot</button>');
  expect(html).toContain('aria-pressed="false">Script (REST)</button>');
  expect(html).toContain('Khuyên dùng');
  expect(html).toContain('claude mcp add --scope user --transport http cvs /api/mcp');
  expect(html).not.toContain('Bearer');
  expect(html).toContain('Dùng khoá truy cập</button>');
  expect(html).not.toContain('Tên khoá'); // the key form waits behind the key-way button
  expect(html).toContain('Sau khi bấm Cho phép, bấm Kiểm tra.');
  expect(html).toContain('Khoá và kết nối');
});

test('OpenMausBot signs in with an mcpServers entry and its own button, and the key way stays one tap away', () => {
  const html = renderToStaticMarkup(<SignInSetup kind="mausbot" origin="https://cvs.example" note="" onCopy={noop} onUseKey={noop} />);
  expect(html).toContain('&quot;url&quot;: &quot;https://cvs.example/api/mcp&quot;');
  expect(html).not.toContain('headers');
  expect(html).toContain('Rồi bấm <b>Đăng nhập</b> ở thẻ cvs');
  expect(html).toContain('Sao chép cấu hình</button>');
  expect(html).toContain('Dùng khoá truy cập</button>');
  const claude = renderToStaticMarkup(<SignInSetup kind="claude" origin="https://cvs.example" note="" onCopy={noop} onUseKey={noop} />);
  expect(claude).toContain('Rồi gõ <kbd translate="no">/mcp</kbd> → <b>cvs</b> → <b>Authenticate</b>');
});

test('a script gets the key with a curl example', () => {
  const html = renderToStaticMarkup(<ShowOnce created={{ name: 'Báo cáo', token: SECRET, origin: 'https://cvs.example' }} kind="rest" note="" onCopy={noop} onClose={noop} />);
  expect(html).toContain('Dán vào Script (REST)');
  expect(html).toContain(`curl -H &quot;Authorization: Bearer ${SECRET}&quot; https://cvs.example/api/me/limits`);
});

test('step 3 asks for a key first on the key way, and offers the check on the sign-in way', () => {
  const none = renderToStaticMarkup(<ConnectCheck keyId={null} oauth={false} arm={0} onConnected={noop} tool="rest" />);
  expect(none).toContain('Tạo khoá ở bước 2, rồi quay lại đây.');
  expect(none).not.toContain('<button');
  const oauth = renderToStaticMarkup(<ConnectCheck keyId={null} oauth arm={0} onConnected={noop} tool="claude" />);
  expect(oauth).toContain('role="status"');
  expect(oauth).toContain('Kiểm tra</button>');
  const key = renderToStaticMarkup(<ConnectCheck keyId="abcdefghijkl" oauth={false} arm={0} onConnected={noop} tool="rest" />);
  expect(key).toContain('Bấm Kiểm tra sau khi dán khoá vào công cụ.');
});

test('each row offers a check and its recent activity next to the revoke, the panel closed until opened', () => {
  const html = list([token()]);
  expect(html).toContain('aria-label="Kiểm tra kết nối Claude Code văn phòng"');
  expect(html).toMatch(/aria-expanded="false" aria-controls="[^"]+">.*Hoạt động gần đây/);
  expect(html).toMatch(/class="agent-log" hidden="" role="region" aria-label="Hoạt động gần đây của Claude Code văn phòng"><\/div>/);
  const revoked = list([token({ status: 'revoked' })]);
  expect(revoked).toContain('Kiểm tra kết nối');
  expect(revoked).toContain('Hoạt động gần đây');
});

test('the check line says OK with the last use, ready when unused, or why it cannot be used', () => {
  const check = (o: Partial<TokenCheck>): TokenCheck => ({ id: 'a', ok: true, status: 'active', reason: null, lastUsedAt: null, lastUsedIp: null, monthSpendUsd: '0', ...o });
  const line = (c: TokenCheck | 'busy' | 'failed') => renderToStaticMarkup(<CheckLine check={c} />);
  const used = line(check({ lastUsedAt: '2026-11-28T04:05:00.000Z', lastUsedIp: '203.0.113.9' }));
  expect(used).toContain('data-ok="true" role="status"');
  expect(used).toContain('Kết nối tốt. Dùng lần cuối 11:05 28/11/2026 từ 203.0.113.9.');
  expect(line(check({}))).toContain('Sẵn sàng, nhưng AI chưa gọi lần nào.');
  expect(line(check({ ok: false, status: 'paused', reason: 'not_admin' }))).toContain('Tạm dừng: chủ khoá không còn là Admin.');
  expect(line(check({ ok: false, reason: 'agent_api_off' }))).toContain('Kết nối AI đang tạm tắt cho cả hệ thống.');
  expect(line(check({ ok: false, status: 'revoked', reason: 'revoked' }))).toContain('data-ok="false"');
  expect(line('busy')).toContain('Đang kiểm tra…');
  expect(line('failed')).toContain('Không kiểm tra được. Hãy thử lại.');
});

test('the activity panel lists time, label and method with path, marks refusals, and pages with Xem thêm', () => {
  const item = (o: Partial<ActivityItem>): ActivityItem => ({ id: '1', at: '2026-11-28T04:05:00.000Z', action: 'agent.request', label: 'Tạo ảnh hoặc video', method: 'POST', path: '/api/jobs', ok: true, ...o });
  const log = (items: ActivityItem[] | null, next: string | null = null, failed = false) =>
    renderToStaticMarkup(<ActivityLog items={items} next={next} busy={false} failed={failed} onMore={noop} onRetry={noop} />);
  const html = log(
    [item({}), item({ id: '2', action: 'agent.refused', label: 'Bị chặn: không được phép', ok: false }), item({ id: '3', action: 'agent.tool', label: 'Gọi công cụ whoami', method: null, path: null })],
    '3',
  );
  expect(html).toContain('<span class="agent-log-label">Tạo ảnh hoặc video</span><span class="agent-log-meta"><time dateTime="2026-11-28T04:05:00.000Z">11:05 28/11/2026</time><code class="agent-log-path" translate="no">POST /api/jobs</code></span>');
  expect(html).toContain('data-ok="false"><span class="agent-log-label">Bị chặn: không được phép</span>');
  expect(html).toContain('<span class="agent-log-label">Gọi công cụ whoami</span><span class="agent-log-meta"><time dateTime="2026-11-28T04:05:00.000Z">11:05 28/11/2026</time></span></li>');
  expect(html).toContain('>Xem thêm</button>');
  expect(log([item({})])).not.toContain('Xem thêm');
  expect(log([])).toContain('Chưa có hoạt động nào.');
  expect(log(null)).toContain('Đang tải hoạt động…');
  expect(log(null, null, true)).toContain('Không tải được hoạt động.');
});
