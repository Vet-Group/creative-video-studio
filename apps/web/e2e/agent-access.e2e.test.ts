// Settings > "Kết nối AI" (components/AgentAccess.tsx): an Admin makes a token, copies it, closes the panel (the secret is gone from the page), the
// token opens the API, and a revoke with its confirm shuts it at once; a member sees no entry. Each state is checked at 390, 820 and 1280 px in both
// themes for page-wide horizontal scroll, 44 px taps and serious axe problems. CVS_E2E_SHOTS=<folder> keeps the screenshots there.
import AxeBuilder from '@axe-core/playwright';
import { expect, type Locator, type Page, test } from '@playwright/test';
import { openSettings, signIn } from './support.test';

const WIDTHS = [390, 820, 1280] as const;
const SCHEMES = ['light', 'dark'] as const;

/** Every width and theme of one state: no sideways scroll, every visible control in the section at least 44 px each way, no serious axe problem. */
async function checkState(page: Page, section: Locator, state: string, shown?: Locator) {
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 1400 }); // tall, so the screenshot shows most of the section
    for (const scheme of SCHEMES) {
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
      await expect(section).toBeVisible();
      const overflow = await page.evaluate(() =>
        [document.documentElement, ...document.querySelectorAll('.settings-panel, .agent-access')].filter((el) => el.scrollWidth > el.clientWidth + 1).map((el) => el.className || el.tagName),
      );
      expect.soft(overflow, `${state} ${width} ${scheme}: horizontal scroll`).toEqual([]);
      const small = await section.locator('button, input, select, a[href]').evaluateAll((els) =>
        els
          .map((el) => ({ el, box: el.getBoundingClientRect() }))
          .filter(({ box }) => box.width > 0 && box.height > 0)
          .filter(({ box }) => box.height < 44 || box.width < 44)
          .map(({ el, box }) => `${el.tagName} ${(el.textContent || el.getAttribute('aria-label') || '').trim()} ${Math.round(box.width)}x${Math.round(box.height)}`),
      );
      expect.soft(small, `${state} ${width} ${scheme}: taps under 44 px`).toEqual([]);
      const axe = (await new AxeBuilder({ page }).include('.settings').analyze()).violations
        .filter((v) => v.impact === 'serious' || v.impact === 'critical')
        .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(' | ')}`);
      expect.soft(axe, `${state} ${width} ${scheme}: axe`).toEqual([]);
      await shown?.scrollIntoViewIfNeeded(); // the dialog scrolls inside: bring the part this state is about into the screenshot
      const dir = process.env.CVS_E2E_SHOTS;
      await page.screenshot({ path: dir ? `${dir}/${state}-${width}-${scheme}.png` : test.info().outputPath(`${state}-${width}-${scheme}.png`) });
    }
  }
  await page.setViewportSize({ width: 1280, height: 900 });
}

test('agent access: an Admin creates, copies, closes and revokes a token, which opens the API until the revoke; a member sees no entry', async ({ page, browser, request, context }) => {
  test.setTimeout(240_000);
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn(page, 'agentui');
  const settings = await openSettings(page);
  await settings.getByRole('button', { name: 'Kết nối AI' }).click();
  const section = settings.locator('.agent-access');
  await expect(section.getByText('Chưa có kết nối nào.')).toBeVisible();
  await checkState(page, section, 'empty');

  await section.getByLabel('Tên khoá').fill('Claude Code e2e');
  await section.getByRole('button', { name: 'Tạo khoá' }).click();
  const secret = section.getByLabel('Khoá truy cập', { exact: true });
  await expect(secret).toBeVisible();
  const token = await secret.inputValue();
  expect(token).toMatch(/^cvs_pat_[A-Za-z0-9]{12}_[A-Za-z0-9_-]{43}$/);
  await section.getByRole('button', { name: 'Sao chép', exact: true }).click();
  await expect(section.locator('.agent-copied')).toHaveText('Đã sao chép.');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(token);
  await section.getByRole('button', { name: 'REST', exact: true }).click();
  await expect(section.locator('.agent-snippet')).toContainText(`Bearer ${token}`);
  await checkState(page, section, 'show-once');

  await section.getByRole('button', { name: 'Tôi đã lưu khoá' }).click();
  await expect(secret).toHaveCount(0);
  expect(await page.content()).not.toContain(token);
  const row = section.getByRole('listitem').filter({ hasText: 'Claude Code e2e' });
  await expect(row).toContainText('Đang dùng');
  await expect(row).toContainText('Chưa dùng lần nào');

  const headers = { authorization: `Bearer ${token}` };
  expect((await request.get('/api/me/limits', { headers })).status()).toBe(200);
  await checkState(page, section, 'list', row);

  await row.getByRole('button', { name: 'Thu hồi khoá Claude Code e2e' }).click();
  const confirm = page.getByRole('dialog', { name: 'Thu hồi khoá “Claude Code e2e”?' });
  await expect(confirm).toContainText('AI đang dùng khoá này sẽ mất quyền ngay.');
  await confirm.getByRole('button', { name: 'Thu hồi' }).click();
  await expect(row).toContainText('Đã thu hồi');
  expect((await request.get('/api/me/limits', { headers })).status()).toBe(401);

  const memberContext = await browser.newContext();
  const member = await memberContext.newPage();
  await signIn(member, 'agentmem');
  const memberSettings = await openSettings(member);
  await expect(memberSettings.getByRole('button', { name: 'Bảo mật' })).toBeVisible();
  await expect(memberSettings.getByRole('button', { name: 'Kết nối AI' })).toHaveCount(0);
  await memberContext.close();
});
