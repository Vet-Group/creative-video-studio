import { expect, type Page, test } from '@playwright/test';
import { modelButton, select, signIn } from './support.test';

const sidebar = (page: Page) => page.locator('.sidebar');
const nav = (page: Page) => page.getByRole('navigation', { name: 'Điều hướng chính' });

test('the sidebar lists Explore, Try On, Image Generation, Create and Library in the live order, and Admin only for an Admin', async ({ page }) => {
  await signIn(page, 'member1');
  await expect(nav(page).getByRole('link')).toHaveText(['Khám phá', 'Thử đồ', 'Tạo ảnh', 'Tạo video', 'Thư viện']);
  await page.getByRole('button', { name: 'Cài đặt' }).click();
  await page.getByRole('dialog', { name: 'Cài đặt' }).getByRole('button', { name: 'Đăng xuất' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await signIn(page, 'admin');
  await expect(nav(page).getByRole('link')).toHaveText(['Khám phá', 'Thử đồ', 'Tạo ảnh', 'Tạo video', 'Thư viện', 'Quản trị']);
});

test('Explore links into Create with the chosen preset or model already picked', async ({ page }) => {
  await signIn(page, 'member1');
  await nav(page).getByRole('link', { name: 'Khám phá' }).click();
  await expect(page).toHaveURL(/\/explore$/);
  await expect(page.getByRole('heading', { name: 'Bắt đầu sáng tạo' })).toBeVisible();
  const tools = page.getByRole('list', { name: 'Công cụ' }).getByRole('link');
  await expect(tools).toHaveCount(4);
  await expect(tools.locator('strong')).toHaveText(['Thử đồ', 'Tạo ảnh', 'Tạo video', 'Thư viện']);

  await page.getByRole('list', { name: 'Mẫu' }).getByRole('link', { name: 'Xoay quanh chậm' }).click();
  await expect(page).toHaveURL(/\/create\?preset=slow-orbit$/);
  await expect(select(page, 'Mẫu chuyển động')).toHaveAttribute('data-value', 'slow-orbit');

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
  await expect(select(page, 'Mẫu chuyển động')).toHaveAttribute('data-value', 'gentle-push-in'); // the default
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

  // The server renders the remembered rail, so the first paint is already 64 px wide.
  const html = await (await page.request.get('/create')).text();
  expect(html).toContain('data-collapsed="true"');
  await page.reload();
  expect((await sidebar(page).boundingBox())!.width).toBe(64);
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await expect.poll(async () => (await sidebar(page).boundingBox())!.width).toBe(240);
});

test('Settings shows the profile, the support contact and no billing', async ({ page }) => {
  await signIn(page, 'member1');
  await page.getByRole('button', { name: 'Cài đặt' }).click();
  const settings = page.getByRole('dialog', { name: 'Cài đặt' });
  await expect(settings.getByRole('navigation', { name: 'Tài khoản' }).getByRole('button')).toHaveText(['Hồ sơ', 'Tài khoản liên kết', 'Hỗ trợ', 'Đăng xuất']);
  await expect(settings.getByText('member1@e2e.test')).toBeVisible();
  await expect(settings.getByText('E2E Member 1')).toBeVisible();
  await settings.getByRole('button', { name: 'Hỗ trợ' }).click();
  await expect(settings.getByRole('link', { name: 'support@e2e.test' })).toHaveAttribute('href', 'mailto:support@e2e.test');
  await page.keyboard.press('Escape');
  await expect(settings).toBeHidden();
  await expect(page.getByRole('button', { name: 'Cài đặt' })).toBeFocused();
});

for (const [width, height] of [[390, 844], [1024, 768]] as const) {
  test(`at ${width} px the shell fits the width and Settings opens inside the screen`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await signIn(page, 'member1');
    if (width < 1024) await page.getByRole('button', { name: 'Mở menu' }).click();
    await page.getByRole('button', { name: 'Cài đặt' }).click();
    const box = (await page.getByRole('dialog', { name: 'Cài đặt' }).boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(16);
    expect(box.x + box.width).toBeLessThanOrEqual(width - 16);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    if (width >= 1024) await expect(page.getByRole('button', { name: 'Thu gọn thanh bên' })).toBeVisible();
    else await expect(page.getByRole('button', { name: 'Thu gọn thanh bên' })).toBeHidden();
  });
}
