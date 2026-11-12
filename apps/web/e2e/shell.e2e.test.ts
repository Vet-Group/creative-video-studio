import { expect, type Page, test } from '@playwright/test';
import { accountButton, modelButton, openSettings, presetOf, select, signIn } from './support.test';

const sidebar = (page: Page) => page.locator('.sidebar');
const nav = (page: Page) => page.getByRole('navigation', { name: 'Điều hướng chính' });

test('the sidebar lists Explore, Try On, Image Generation, Create, Marketing Studio, Apps and Library in the live order, and Admin only for an Admin', async ({ page }) => {
  await signIn(page, 'member1');
  await expect(nav(page).getByRole('link')).toHaveCount(9);
  await expect(nav(page).locator('.nav-label')).toHaveText(['Khám phá', 'Thử đồ', 'Tạo ảnh', 'Tạo video', 'Marketing Studio', 'Ứng dụng', 'Thư viện', 'Góp ý', 'Có gì mới']);
  await expect(nav(page).getByRole('link', { name: 'Marketing Studio', exact: true })).toBeVisible(); // the badge is not part of the name
  await (await openSettings(page)).getByRole('button', { name: 'Đăng xuất' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await signIn(page, 'admin');
  await expect(nav(page).getByRole('link')).toHaveCount(10);
  await expect(nav(page).locator('.nav-label')).toHaveText(['Khám phá', 'Thử đồ', 'Tạo ảnh', 'Tạo video', 'Marketing Studio', 'Ứng dụng', 'Thư viện', 'Góp ý', 'Có gì mới', 'Quản trị']);
});

test('a link anywhere in the app, not only the sidebar, shows the top progress bar until the next page is up', async ({ page }) => {
  await signIn(page, 'member1');
  await page.goto('/explore');
  const bar = page.locator('.nav-progress');
  await expect(bar).toHaveAttribute('data-on', 'false');
  await page.route(/[?&]_rsc=/, async (route) => {
    await new Promise((r) => setTimeout(r, 1500)); // a slow line, so the wait is visible
    await route.continue();
  });
  await page.getByRole('list', { name: 'Mẫu' }).getByRole('link', { name: 'Xoay chậm tại chỗ' }).click();
  await expect(bar).toHaveAttribute('data-on', 'true');
  await page.waitForTimeout(300); // past its 150 ms delay: already a third of the width, easy to see on a phone
  expect((await bar.boundingBox())!.width).toBeGreaterThanOrEqual(0.3 * page.viewportSize()!.width - 1);
  await expect(page).toHaveURL(/\/create\?preset=slow-orbit$/);
  await expect(bar).toHaveAttribute('data-on', 'false');
  await page.unroute(/[?&]_rsc=/);
});

test('the top bar also ends when the page commits without the address changing, as when a redirect lands back on the page shown', async ({ page }) => {
  await signIn(page, 'member1');
  await page.goto('/explore');
  const bar = page.locator('.nav-progress');
  await page.route(/[?&]_rsc=/, async (route) => {
    await new Promise((r) => setTimeout(r, 8000));
    await route.continue().catch(() => {}); // the page may be gone by then
  });
  await page.getByRole('list', { name: 'Mẫu' }).getByRole('link', { name: 'Xoay chậm tại chỗ' }).click();
  await expect(bar).toHaveAttribute('data-on', 'true');
  // What the router does when a page commits: a new history.state under the address it lands on, here the one already shown.
  await page.evaluate(() => history.replaceState({ ...history.state }, '', location.href));
  await expect(bar).toHaveAttribute('data-on', 'false', { timeout: 2000 }); // not the 15 s fallback
  await expect(page).toHaveURL(/\/explore$/);
  await page.unroute(/[?&]_rsc=/);
});

test('Explore links into Create with the chosen preset or model already picked', async ({ page }) => {
  await signIn(page, 'member1');
  await nav(page).getByRole('link', { name: 'Khám phá' }).click();
  await expect(page).toHaveURL(/\/explore$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/^Chào buổi (sáng|chiều|tối), 1$/); // E2E Member 1: the last word is the given name
  const tools = page.getByRole('list', { name: 'Công cụ' }).getByRole('link');
  await expect(tools).toHaveCount(6);
  await expect(tools.locator('strong')).toHaveText(['Thử đồ', 'Tạo ảnh', 'Tạo video', 'Marketing Studio', 'Ứng dụng', 'Thư viện']);

  await page.getByRole('list', { name: 'Mẫu' }).getByRole('link', { name: 'Xoay chậm tại chỗ' }).click();
  await expect(page).toHaveURL(/\/create\?preset=slow-orbit$/);
  await expect(presetOf(page)).toHaveAttribute('data-value', 'slow-orbit');

  await page.goto('/explore');
  await page.getByRole('list', { name: 'Mô hình' }).getByRole('link', { name: /Mock E2E/ }).click();
  await expect(page).toHaveURL(/\/create\?model=mock-e2e$/);
  await expect(modelButton(page)).toContainText('Mock E2E');

  // A model that does not fit the form's starting ratio and duration stays chosen, and the form takes its options instead.
  const models = (enabled: boolean) => page.request.put('/api/admin/settings', { data: { models: [{ id: 'mock-e2e-square', enabled }] } });
  await page.context().clearCookies();
  await signIn(page, 'admin');
  expect((await models(true)).ok()).toBe(true);
  try {
    await page.goto('/create?model=mock-e2e-square');
    await expect(modelButton(page)).toContainText('Mock E2E Square');
    await expect(select(page, 'Tỉ lệ khung hình')).toHaveAttribute('data-value', '1:1');
    await expect(select(page, 'Thời lượng')).toHaveAttribute('data-value', '5');
  } finally {
    await models(false);
  }

  await page.goto('/create?preset=no-such-preset');
  await expect(page.locator('.banner')).toHaveAttribute('aria-busy', 'false');
  await expect(presetOf(page)).toHaveAttribute('data-value', ''); // the default free prompt
});

test('at 1440 the sidebar keeps the live rhythm: the first item at 81 px, one every 41 px within a group, quiet group labels, solid 16 px icons and a red "Mới" pill on Marketing Studio', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signIn(page, 'member1');
  const links = nav(page).getByRole('link');
  const ys = await links.evaluateAll((as) => as.map((a) => Math.round(a.getBoundingClientRect().y)));
  expect(ys[0]).toBe(81);
  for (let i = 2; i < 6; i++) expect(ys[i]! - ys[i - 1]!).toBe(41); // the create group: Try On to Apps
  // The groups the nav reads as, each named by its label (Explore, the home page, has none).
  await expect(nav(page).getByRole('group', { name: 'Sáng tạo' }).getByRole('link')).toHaveCount(5);
  await expect(nav(page).getByRole('group', { name: 'Của bạn' }).getByRole('link')).toHaveText(['Thư viện', 'Góp ý', 'Có gì mới (có mục mới)']); // a first visit: the newest day is unseen
  await expect(nav(page).locator('.nav-group-label')).toHaveText(['Sáng tạo', 'Của bạn']);
  await expect(page.locator('.brand strong')).toHaveText('Video Studio'); // the app, not the user, heads the sidebar
  const icon = links.first().locator('svg');
  await expect(icon).toHaveAttribute('fill', 'currentColor');
  expect((await icon.boundingBox())!.width).toBe(16);
  const badge = links.nth(4).locator('.nav-badge');
  await expect(badge).toHaveText('Mới');
  await expect(badge).toHaveCSS('background-color', 'rgb(217, 45, 32)');
  expect((await links.nth(4).locator('.nav-label').boundingBox())!.height).toBe(21); // one line, the pill beside it
  const pill = (await badge.boundingBox())!, row = (await links.nth(4).boundingBox())!;
  expect(pill.x + pill.width).toBeLessThanOrEqual(row.x + row.width);
});

test('the sidebar collapses to a 64 px icon rail that keeps its labels for screen readers and is remembered', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signIn(page, 'member1');
  const toggle = page.getByRole('button', { name: 'Thu gọn thanh bên' });
  expect((await sidebar(page).boundingBox())!.width).toBe(240);
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(async () => (await sidebar(page).boundingBox())!.width).toBe(64);
  expect((await page.locator('.content').boundingBox())!.x).toBe(64);
  const label = nav(page).getByRole('link', { name: 'Thư viện' }).locator('.nav-label');
  // Clipped, not display:none, so the link keeps its text as its accessible name.
  await expect(label).toHaveCSS('clip-path', 'inset(50%)');
  await expect(label).not.toHaveCSS('display', 'none');
  await expect(nav(page).getByRole('link', { name: 'Thư viện' })).toHaveAttribute('title', 'Thư viện');
  // The account chip shrinks to its avatar, named and titled by the user; the group labels are clipped like the item labels.
  const chip = accountButton(page);
  await expect(chip).toHaveAccessibleName('Tài khoản: E2E Member 1');
  await expect(chip).toHaveAttribute('title', 'E2E Member 1');
  await expect(chip.locator('.account-who')).toBeHidden();
  const c = (await chip.boundingBox())!;
  expect(c.x).toBeGreaterThanOrEqual(8);
  expect(c.x + c.width).toBeLessThanOrEqual(56);
  await expect(nav(page).locator('.nav-group-label').first()).toHaveCSS('clip-path', 'inset(50%)');

  // The server renders the remembered rail, so the first paint is already 64 px wide.
  const html = await (await page.request.get('/create')).text();
  expect(html).toContain('data-collapsed="true"');
  await page.reload();
  expect((await sidebar(page).boundingBox())!.width).toBe(64);
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await expect.poll(async () => (await sidebar(page).boundingBox())!.width).toBe(240);
});

test('the Apps pages widen the sidebar to 280 px as Fash does, and the icon rail still wins there', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signIn(page, 'member1');
  for (const path of ['/apps', '/apps/character-swap']) {
    await page.goto(path);
    const section = page.locator('section:is(.apps, .app-page)');
    await expect(section).toBeVisible(); // the rule keys on the page section, which follows the loading state
    await expect.poll(async () => (await sidebar(page).boundingBox())!.width).toBe(280);
    expect((await page.locator('.content').boundingBox())!.x).toBe(280);
    expect((await section.boundingBox())!.x).toBe(328);
  }
  await page.getByRole('button', { name: 'Thu gọn thanh bên' }).click();
  await expect.poll(async () => (await sidebar(page).boundingBox())!.width).toBe(64);
  expect((await page.locator('.content').boundingBox())!.x).toBe(64);
  await page.getByRole('button', { name: 'Thu gọn thanh bên' }).click();
  await page.goto('/create');
  expect((await sidebar(page).boundingBox())!.width).toBe(240);
});

test('Settings shows the profile, the own caps, the sign-in summary, the support contact and no billing', async ({ page }) => {
  await signIn(page, 'member1');
  const settings = await openSettings(page);
  await expect(settings.getByRole('navigation', { name: 'Tài khoản' }).getByRole('button')).toHaveText([/^Hồ sơ/, /^Hạn mức/, /^Bảo mật/, /^Tuỳ chọn/, /^Phương thức đăng nhập/, /^Hỗ trợ/, 'Đăng xuất']);
  await expect(settings.getByRole('button', { name: 'Hồ sơ' })).toHaveAttribute('aria-current', 'true');
  await expect(settings.getByText('member1@e2e.test')).toBeVisible();
  await expect(settings.getByText('E2E Member 1')).toBeVisible();
  await expect(settings.getByText('Chưa phân team')).toBeVisible();
  await settings.getByRole('button', { name: 'Hạn mức', exact: true }).click(); // the profile also has a see-limits link with that word
  await expect(settings.getByRole('meter', { name: 'Clip video hôm nay' })).toHaveAttribute('aria-valuemax', '1000'); // serve.ts sets the daily clip cap
  await expect(settings.getByRole('meter', { name: 'Ảnh và ứng dụng tháng này' })).toBeVisible();
  await expect(settings.getByText('Hạn mức ngày đặt lại lúc 0:00 giờ Việt Nam', { exact: false })).toBeVisible();
  await settings.getByRole('button', { name: 'Bảo mật' }).click();
  await expect(settings.getByText('Đã đặt', { exact: true })).toBeVisible();
  await expect(settings.getByText('Chưa có passkey')).toBeVisible();
  await expect(settings.getByRole('link', { name: 'Quản lý passkey' })).toHaveAttribute('href', '/account/sign-in-methods');
  await settings.getByRole('button', { name: 'Hỗ trợ' }).click();
  await expect(settings.getByRole('link', { name: 'support@e2e.test' })).toHaveAttribute('href', 'mailto:support@e2e.test');
  await page.keyboard.press('Escape');
  await expect(settings).toBeHidden();
  await expect(accountButton(page)).toBeFocused(); // the menu handed the focus back to its button before the dialog opened
});

for (const [width, height] of [[390, 844], [1024, 768]] as const) {
  test(`at ${width} px the shell fits the width and Settings opens inside the screen`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await signIn(page, 'member1');
    const box = (await (await openSettings(page)).boundingBox())!; // the top bar's avatar below 1024 px
    expect(box.x).toBeGreaterThanOrEqual(16);
    expect(box.x + box.width).toBeLessThanOrEqual(width - 16);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    if (width >= 1024) await expect(page.getByRole('button', { name: 'Thu gọn thanh bên' })).toBeVisible();
    else await expect(page.getByRole('button', { name: 'Thu gọn thanh bên' })).toBeHidden();
  });
}

test('the account menu works by keyboard: Enter opens it on Cài đặt, the arrows wrap, Esc closes it and returns the focus, a click outside closes it', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page, 'member1');
  const chip = accountButton(page);
  await expect(chip).toHaveAttribute('aria-haspopup', 'menu');
  await expect(chip).toContainText('member1@e2e.test');
  await chip.focus();
  await page.keyboard.press('Enter');
  await expect(chip).toHaveAttribute('aria-expanded', 'true');
  const menu = page.getByRole('menu', { name: 'Tài khoản: E2E Member 1' });
  const items = menu.getByRole('menuitem');
  await expect(items).toHaveText([/^Cài đặt/, /^Hạn mức hôm nay/, 'Bảo mật', 'Hỗ trợ', 'Đăng xuất']);
  await expect(items.first()).toBeFocused();
  await expect(items.first()).toHaveAttribute('aria-keyshortcuts', 'Control+Comma');
  await expect(items.nth(1)).toContainText('/ 1000 clip'); // today's clips against the cap serve.ts sets, fetched on open
  // It opens upward from the chip at the bottom of the sidebar.
  const m = (await menu.boundingBox())!;
  expect(m.y + m.height).toBeLessThanOrEqual((await chip.boundingBox())!.y);
  await page.keyboard.press('ArrowUp');
  await expect(items.last()).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(items.first()).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(items.nth(1)).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  await expect(chip).toBeFocused();
  await expect(chip).toHaveAttribute('aria-expanded', 'false');
  await chip.click();
  await expect(menu).toBeVisible();
  await page.mouse.click(900, 450);
  await expect(menu).toBeHidden();
});

test('a menu item opens Settings on its section: Bảo mật on Security, Hạn mức hôm nay on Limits, Hỗ trợ on Support', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page, 'member1');
  const settings = page.getByRole('dialog', { name: 'Cài đặt' });
  for (const [item, section] of [['Bảo mật', 'Bảo mật'], [/^Hạn mức hôm nay/, 'Hạn mức'], ['Hỗ trợ', 'Hỗ trợ']] as const) {
    await accountButton(page).click();
    await page.getByRole('menuitem', { name: item }).click();
    await expect(settings.getByRole('heading', { name: section, exact: true })).toBeVisible();
    await expect(settings.getByRole('navigation', { name: 'Tài khoản' }).getByRole('button', { name: section, exact: true })).toHaveAttribute('aria-current', 'true');
    await page.keyboard.press('Escape');
    await expect(settings).toBeHidden();
    await expect(accountButton(page)).toBeFocused();
  }
  await expect(page.getByRole('menu')).toHaveCount(0);
});

test('Ctrl+, opens Settings from anywhere, even while typing, and not a second time over a dialog already open', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page, 'member1');
  const prompt = page.getByRole('textbox').first();
  await prompt.click();
  await page.keyboard.press('Control+Comma');
  const settings = page.getByRole('dialog', { name: 'Cài đặt' });
  await expect(settings).toBeVisible();
  await expect(settings.getByRole('heading', { name: 'Hồ sơ' })).toBeVisible();
  await settings.getByRole('button', { name: 'Bảo mật' }).click();
  await page.keyboard.press('Control+Comma'); // ignored: the open dialog stays on its section
  await expect(settings.getByRole('heading', { name: 'Bảo mật', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(settings).toBeHidden();
  await expect(prompt).toBeFocused();
});

test('at 390 px the top bar shows the avatar, which opens the account menu below it, inside the screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, 'member1');
  const avatar = page.locator('.topbar').getByRole('button', { name: 'Tài khoản: E2E Member 1' });
  await expect(page.locator('.topbar .vet-logo')).toHaveCount(0); // the drawer's brand row has the logo
  const a = (await avatar.boundingBox())!;
  expect(a.x + a.width).toBeLessThanOrEqual(390 - 6 + 0.5);
  await avatar.click();
  const menu = page.getByRole('menu', { name: 'Tài khoản: E2E Member 1' });
  await expect(menu).toBeVisible();
  const m = (await menu.boundingBox())!;
  expect(m.y).toBeGreaterThanOrEqual(a.y + a.height);
  expect(m.x).toBeGreaterThanOrEqual(16);
  expect(m.x + m.width).toBeLessThanOrEqual(390);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await menu.getByRole('menuitem', { name: 'Bảo mật' }).click();
  const settings = page.getByRole('dialog', { name: 'Cài đặt' });
  await expect(settings.getByRole('heading', { name: 'Bảo mật', exact: true })).toBeVisible(); // the phone layout opens the section's own page
  await expect(settings.getByRole('navigation', { name: 'Tài khoản' })).toBeHidden();
  await page.keyboard.press('Escape');
  await expect(avatar).toBeFocused();

  // The drawer has the same chip at its bottom.
  await page.getByRole('button', { name: 'Mở menu' }).click();
  const chip = page.locator('.sidebar').getByRole('button', { name: 'Tài khoản: E2E Member 1' });
  await expect(chip).toBeVisible();
  const c = (await chip.boundingBox())!;
  expect(c.y + c.height).toBeGreaterThan(844 - 80);
  await chip.click();
  await expect(menu).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  await expect(page.locator('.sidebar')).toBeVisible(); // Esc closed only the menu, not the drawer
});

test.describe('on touch', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

  test('the account menu rows are at least 44 px tall', async ({ page }) => {
    await signIn(page, 'member1');
    await accountButton(page).click();
    for (const item of await page.getByRole('menuitem').all()) expect((await item.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  });
});
