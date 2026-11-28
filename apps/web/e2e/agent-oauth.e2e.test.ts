// OAuth sign-in for MCP clients (lib/oauth.ts, app/(app)/oauth/authorize) end to end, as Claude Code or OpenMausBot does it: a public client registers,
// a signed-out Admin goes through the login and back to the consent page with the full query, sees the client's name and return host, denies once,
// then allows; the client exchanges the code (PKCE) and calls MCP whoami; Disconnect in Settings ends it (401). A member is sent back with
// access_denied, and an unregistered redirect gets an error page with no navigation away. The consent page and the Settings list are checked at
// 390, 820 and 1280 px in both themes for sideways scroll, 44 px taps and serious axe problems. CVS_E2E_SHOTS=<folder> keeps the screenshots there.
import { createHash, randomBytes } from 'node:crypto';
import AxeBuilder from '@axe-core/playwright';
import { type APIRequestContext, expect, type Locator, type Page, test } from '@playwright/test';
import { loginReady, newAddress, openSettings, signIn } from './support.test';
import { PASSWORD, USERS } from './users';

const WIDTHS = [390, 820, 1280] as const;
const SCHEMES = ['light', 'dark'] as const;
const PORT = 47999;
const REDIRECT = `http://127.0.0.1:${PORT}/mcp-oauth/callback`;

/** Every width and theme of one state: no sideways scroll, every visible control in `root` at least 44 px each way, no serious axe problem in it. */
async function checkState(page: Page, root: Locator, scope: string, state: string) {
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 1200 });
    for (const scheme of SCHEMES) {
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
      await expect(root).toBeVisible();
      const overflow = await page.evaluate(() =>
        [document.documentElement, ...document.querySelectorAll('.settings-panel, .agent-access, .oauth-consent')].filter((el) => el.scrollWidth > el.clientWidth + 1).map((el) => el.className || el.tagName),
      );
      expect.soft(overflow, `${state} ${width} ${scheme}: horizontal scroll`).toEqual([]);
      const small = await root.locator('button, input:not([type=hidden]), select, a[href]').evaluateAll((els) =>
        els
          .map((el) => ({ el, box: el.getBoundingClientRect() }))
          .filter(({ box }) => box.width > 0 && box.height > 0)
          .filter(({ box }) => box.height < 44 || box.width < 44)
          .map(({ el, box }) => `${el.tagName} ${(el.textContent || el.getAttribute('aria-label') || '').trim()} ${Math.round(box.width)}x${Math.round(box.height)}`),
      );
      expect.soft(small, `${state} ${width} ${scheme}: taps under 44 px`).toEqual([]);
      const axe = (await new AxeBuilder({ page }).include(scope).analyze()).violations
        .filter((v) => v.impact === 'serious' || v.impact === 'critical')
        .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(' | ')}`);
      expect.soft(axe, `${state} ${width} ${scheme}: axe`).toEqual([]);
      const dir = process.env.CVS_E2E_SHOTS;
      await page.screenshot({ path: dir ? `${dir}/oauth-${state}-${width}-${scheme}.png` : test.info().outputPath(`${state}-${width}-${scheme}.png`) });
    }
  }
  await page.setViewportSize({ width: 1280, height: 900 });
}

let ip = 0;
/** A public client registered as an MCP client does (RFC 7591), from an address of its own so the hourly limit is not shared with other runs. */
async function register(request: APIRequestContext, name: string, redirect = REDIRECT) {
  const res = await request.post('/api/oauth/register', { headers: { 'cf-connecting-ip': `192.0.2.${++ip}` }, data: { client_name: name, redirect_uris: [redirect] } });
  expect(res.status()).toBe(201);
  return ((await res.json()) as { client_id: string }).client_id;
}
function authorizeUrl(clientId: string, challenge: string, state: string, redirect = REDIRECT) {
  const q = new URLSearchParams({ response_type: 'code', client_id: clientId, redirect_uri: redirect, state, code_challenge: challenge, code_challenge_method: 'S256' });
  return `/oauth/authorize?${q}`;
}
/** Answers the client's loopback callback in place of the client, and resolves to the URL the browser was sent to. */
async function callback(page: Page): Promise<() => Promise<URL>> {
  let hit: (url: URL) => void;
  const reached = new Promise<URL>((resolve) => (hit = resolve));
  await page.route(`http://127.0.0.1:${PORT}/**`, (route) => {
    hit(new URL(route.request().url()));
    return route.fulfill({ status: 200, contentType: 'text/plain', body: 'Signed in. You can close this tab.' });
  });
  return () => reached;
}
async function whoami(request: APIRequestContext, token: string) {
  return request.post('/api/mcp', {
    headers: { authorization: `Bearer ${token}`, accept: 'application/json, text/event-stream', 'mcp-protocol-version': '2025-06-18' },
    data: { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'whoami', arguments: {} } },
  });
}

test('agent oauth: a signed-out Admin logs in, sees the client and its return host, denies, then allows; the client calls whoami until Disconnect', async ({ page, browser, request }) => {
  test.setTimeout(300_000);
  const name = `E2E OAuth client ${randomBytes(3).toString('hex')}`;
  const clientId = await register(request, name);
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');

  // Signed out: the login, then back to the consent page with every parameter.
  const deniedUrl = authorizeUrl(clientId, challenge, 'state-deny');
  await newAddress(page);
  await page.goto(deniedUrl);
  await expect(page).toHaveURL(/\/login\?next=/);
  await loginReady(page);
  await page.getByLabel('Email').fill(USERS.agentoauth.email);
  await page.getByLabel('Mật khẩu').fill(PASSWORD);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await expect.poll(() => { const u = new URL(page.url()); return u.pathname + u.search; }).toBe(deniedUrl);

  const card = page.locator('.oauth-consent');
  await expect(card.getByRole('heading', { name: 'Cho phép ứng dụng dùng CVS thay bạn?' })).toBeVisible();
  await expect(card.locator('.oauth-facts dd').first()).toHaveText(name);
  await expect(card.locator('.oauth-facts dd').nth(1)).toContainText(`127.0.0.1:${PORT}`);
  await expect(card).toContainText('kể cả quyền Admin');
  // register() sends from 192.0.2.x and this browser from 10.x.x.x: the page warns that the app was registered on another machine.
  await expect(card.getByRole('alert').filter({ hasText: 'App này được đăng ký từ một máy khác.' })).toBeVisible();
  await checkState(page, card, '.oauth-consent', 'consent');

  const origin = new URL(page.url()).origin;
  const reached = await callback(page);
  await card.getByRole('button', { name: 'Từ chối' }).click();
  const denied = await reached();
  expect(Object.fromEntries(denied.searchParams)).toEqual({ error: 'access_denied', state: 'state-deny', iss: origin });
  expect(denied.searchParams.has('code')).toBe(false);

  // Allow: the code comes back with the state and the issuer.
  await page.unroute(`http://127.0.0.1:${PORT}/**`);
  const allowedUrl = authorizeUrl(clientId, challenge, 'state-allow');
  await page.goto(allowedUrl);
  const back = await callback(page);
  await page.locator('.oauth-consent').getByRole('button', { name: 'Cho phép' }).click();
  const allowed = await back();
  expect([allowed.searchParams.get('state'), allowed.searchParams.get('iss')]).toEqual(['state-allow', origin]);
  const code = allowed.searchParams.get('code')!;
  expect(code).toMatch(/^cvs_oac_/);

  // The client: code + verifier -> tokens -> MCP whoami.
  const exchanged = await request.post('/api/oauth/token', { form: { grant_type: 'authorization_code', code, client_id: clientId, redirect_uri: REDIRECT, code_verifier: verifier } });
  expect(exchanged.status()).toBe(200);
  const pair = (await exchanged.json()) as { access_token: string; refresh_token: string };
  expect(pair.access_token).toMatch(/^cvs_oat_/);
  const who = await whoami(request, pair.access_token);
  expect(who.status()).toBe(200);
  const text = await who.text();
  const data = JSON.parse(text.split('\n').filter((l) => l.startsWith('data: ')).at(-1)?.slice(6) ?? text) as { result: { structuredContent: Record<string, any> } };
  expect(data.result.structuredContent).toMatchObject({ user: { email: USERS.agentoauth.email }, connection: { kind: 'oauth' } });

  // Settings lists the app; Disconnect ends it at once.
  await page.goto('/create');
  const settings = await openSettings(page);
  await settings.getByRole('button', { name: 'Kết nối AI' }).click();
  const section = settings.locator('.agent-access');
  await expect(section.getByText('Cách 1: Đăng nhập (khuyên dùng)')).toBeVisible();
  await expect(section.locator('.agent-snippet').first()).toContainText('claude mcp add --scope user --transport http cvs');
  const row = section.getByRole('listitem').filter({ hasText: name });
  await expect(row).toContainText('Không hết hạn khi còn dùng');
  await checkState(page, section, '.settings', 'connected');
  await row.getByRole('button', { name: `Ngắt kết nối ${name}` }).click();
  const confirm = page.getByRole('dialog', { name: `Ngắt kết nối “${name}”?` });
  await confirm.getByRole('button', { name: 'Ngắt kết nối' }).click();
  await expect(row).toContainText('Đã thu hồi');
  expect((await whoami(request, pair.access_token)).status()).toBe(401);
  expect((await request.post('/api/oauth/token', { form: { grant_type: 'refresh_token', refresh_token: pair.refresh_token, client_id: clientId } })).status()).toBe(400);

  // A member is sent back with access_denied; an unregistered redirect gets an error page and no navigation away.
  const memberContext = await browser.newContext();
  const member = await memberContext.newPage();
  await signIn(member, 'agentmem');
  const memberBack = await callback(member);
  await member.goto(authorizeUrl(clientId, challenge, 'state-member')).catch(() => undefined);
  expect(Object.fromEntries((await memberBack()).searchParams)).toMatchObject({ error: 'access_denied', state: 'state-member' });
  await memberContext.close();

  const bad = authorizeUrl(clientId, challenge, 'state-bad', `http://127.0.0.1:${PORT}/elsewhere`);
  await page.goto(bad);
  await expect(page.getByRole('heading', { name: 'Không mở được yêu cầu kết nối' })).toBeVisible();
  expect(new URL(page.url()).pathname).toBe('/oauth/authorize');
});
