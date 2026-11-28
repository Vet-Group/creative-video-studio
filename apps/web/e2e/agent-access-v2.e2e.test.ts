// Settings > "Connect AI", the three setup steps and the row tools (components/AgentAccess.tsx): the tool choice survives a reload, Claude Code signs
// in with a command that holds no key, a script takes the key way with a curl example, step 3 waits for the first call and reports it, and a row's
// check and recent-activity panel (with its second page) answer for that key only. Each state is checked at 390, 820 and 1280 px in both themes
// for horizontal scroll, 44 px taps and serious axe problems (agent-states.test.ts). CVS_E2E_SHOTS=<folder> keeps the screenshots there.
import { expect, test } from '@playwright/test';
import { checkState } from './agent-states.test';
import { openSettings, signIn } from './support.test';

test('agent access v2: three steps from tool to first call, then a row check and its activity log', async ({ page, request, context }) => {
  test.setTimeout(300_000);
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn(page, 'agentv2');
  const open = async () => {
    const settings = await openSettings(page);
    await settings.getByRole('button', { name: 'Kết nối AI' }).click();
    return settings.locator('.agent-access');
  };
  let section = await open();
  const tools = section.getByRole('group', { name: 'Công cụ AI' });
  await expect(section.locator('.agent-step')).toHaveCount(3);
  await expect(tools.getByRole('button', { name: 'Claude Code' })).toHaveAttribute('aria-pressed', 'true');

  // Step 1 remembers the tool.
  await tools.getByRole('button', { name: 'OpenMausBot' }).click();
  await expect(section.locator('.agent-snippet')).toContainText('"mcpServers"');
  await expect(section.locator('.agent-snippet')).not.toContainText('headers');
  await page.reload();
  section = await open();
  await expect(section.getByRole('group', { name: 'Công cụ AI' }).getByRole('button', { name: 'OpenMausBot' })).toHaveAttribute('aria-pressed', 'true');

  // Step 2, sign-in way: a command with no key; copying it starts step 3's wait.
  await section.getByRole('group', { name: 'Công cụ AI' }).getByRole('button', { name: 'Claude Code' }).click();
  const command = `claude mcp add --scope user --transport http cvs ${new URL(page.url()).origin}/api/mcp`;
  await expect(section.locator('.agent-snippet')).toHaveText(command);
  await expect(section.locator('.agent-then')).toContainText('Rồi gõ /mcp → cvs → Authenticate');
  await checkState(page, section, 'v2-signin');
  await section.getByRole('button', { name: 'Sao chép lệnh' }).click();
  await expect(section.locator('.agent-copied')).toHaveText('Đã sao chép.');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(command);
  await expect(section.locator('.agent-probe')).toContainText('Đang chờ lần gọi đầu tiên…');

  // The key way behind "Dùng khoá truy cập", and back.
  await section.getByRole('button', { name: 'Dùng khoá truy cập' }).click();
  await expect(section.getByLabel('Tên khoá')).toBeVisible();
  await section.getByRole('button', { name: 'Quay lại cách đăng nhập' }).click();
  await expect(section.getByLabel('Tên khoá')).toHaveCount(0);

  // A script: the key form at once, the key once with a curl example, then step 3 sees the first call.
  await section.getByRole('group', { name: 'Công cụ AI' }).getByRole('button', { name: 'Script (REST)' }).click();
  await expect(section.locator('.agent-probe')).toHaveText('Tạo khoá ở bước 2, rồi quay lại đây.');
  await section.getByLabel('Tên khoá').fill('Script v2');
  await section.getByLabel('Hạn dùng').selectOption('never');
  await section.getByRole('button', { name: 'Tạo khoá' }).click();
  const secret = section.getByLabel('Khoá truy cập', { exact: true });
  const token = await secret.inputValue();
  expect(token).toMatch(/^cvs_pat_[A-Za-z0-9]{12}_[A-Za-z0-9_-]{43}$/);
  await expect(section.locator('.agent-snippet')).toContainText(`curl -H "Authorization: Bearer ${token}"`);
  await expect(section.locator('.agent-probe')).toContainText('Đang chờ lần gọi đầu tiên…');
  const headers = { authorization: `Bearer ${token}` };
  expect((await request.get('/api/me/limits', { headers })).status()).toBe(200);
  await expect(section.locator('.agent-probe')).toContainText(/Đã kết nối lúc \d{2}:\d{2}\./, { timeout: 15_000 });
  await expect(section.locator('.agent-step[data-done]')).toHaveCount(3);
  await checkState(page, section, 'v2-key-shown', section.locator('.agent-once'));
  await section.getByRole('button', { name: 'Tôi đã lưu khoá' }).click();
  await expect(secret).toHaveCount(0);
  expect(await page.content()).not.toContain(token);

  // 21 refusals (a Bearer is never let into these routes), so the log needs a second page.
  for (let i = 0; i < 21; i++) expect((await request.get('/api/agent-access/tokens', { headers })).status()).toBe(403);

  const row = section.getByRole('listitem').filter({ hasText: 'Script v2' });
  await row.getByRole('button', { name: 'Kiểm tra kết nối Script v2' }).click();
  await expect(row.locator('.agent-check')).toContainText('Kết nối tốt. Dùng lần cuối');
  await expect(row.locator('.agent-check')).toHaveAttribute('data-ok', 'true');
  const toggle = row.getByRole('button', { name: 'Hoạt động gần đây' });
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  const log = row.getByRole('region', { name: 'Hoạt động gần đây của Script v2' });
  await expect(log.locator('.agent-log-row')).toHaveCount(20);
  await expect(log.locator('.agent-log-row').first()).toContainText('Bị chặn: không được phép');
  await expect(log.locator('.agent-log-row').first()).toContainText('GET /api/agent-access/tokens');
  await checkState(page, section, 'v2-activity-open', log);
  await log.getByRole('button', { name: 'Xem thêm' }).click();
  await expect(log.locator('.agent-log-row')).toHaveCount(22);
  await expect(log.locator('.agent-log-row').last()).toContainText('Tạo khoá');
  await expect(log.getByRole('button', { name: 'Xem thêm' })).toHaveCount(0);
  expect(await log.textContent()).not.toContain(token);
  await toggle.click();
  await expect(log).toBeHidden();

  // Revoked: the check says so.
  await row.getByRole('button', { name: 'Thu hồi khoá Script v2' }).click();
  await page.getByRole('dialog', { name: 'Thu hồi khoá “Script v2”?' }).getByRole('button', { name: 'Thu hồi' }).click();
  await expect(row).toContainText('Đã thu hồi');
  await row.getByRole('button', { name: 'Kiểm tra kết nối Script v2' }).click();
  await expect(row.locator('.agent-check')).toHaveText('Đã thu hồi: AI không dùng được nữa.');
});
