import { expect, test } from '@playwright/test';
import { accountButton, signIn } from './support.test';

test('a developer Admin signs in as a member, sees the banner on their pages, and stops back into their own session', async ({ page }) => {
  await signIn(page, 'impdev');
  await page.goto('/admin/users');
  // Not on their own row, and the switch only on an Admin's row.
  await page.getByLabel('Tìm theo tên hoặc email').fill('imp');
  await expect(page.getByRole('button', { name: 'Đăng nhập thay impdev@e2e.test' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Sửa impdev@e2e.test' }).click();
  await expect(page.getByLabel('Vai trò của impdev@e2e.test')).toBeVisible();
  await expect(page.getByLabel('Nhà phát triển: impdev@e2e.test')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Sửa impplain@e2e.test' }).click();
  await expect(page.getByLabel('Nhà phát triển: impplain@e2e.test')).not.toBeChecked();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Sửa impmember@e2e.test' }).click();
  await expect(page.getByLabel('Vai trò của impmember@e2e.test')).toBeVisible();
  await expect(page.getByLabel('Nhà phát triển: impmember@e2e.test')).toHaveCount(0);
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: 'Đăng nhập thay impmember@e2e.test' }).click();
  const confirm = page.getByRole('dialog', { name: 'Đăng nhập thay E2E Imp Member?' });
  await expect(confirm).toContainText('được tính cho tài khoản của họ');
  await confirm.getByRole('button', { name: 'Đăng nhập thay', exact: true }).click();

  // A full reload to the home page: the member's pages, with the banner at phone width too.
  await expect(page.getByText('Bạn đang đăng nhập thay E2E Imp Member. Mọi thao tác được tính cho tài khoản này.')).toBeVisible();
  await expect(accountButton(page)).toHaveAccessibleName('Tài khoản: EM E2E Imp Member impmember@e2e.test');
  await expect(page.getByRole('link', { name: 'Quản trị', exact: true })).toHaveCount(0);
  await page.goto('/admin/users');
  await expect(page.getByText('Khu vực quản trị chỉ dành cho Admin.')).toBeVisible();
  // The screen-tall form card gives up the banner's height, so Run is in view without scrolling, on a laptop and on a phone.
  const runInView = () => page.locator('.runbar button.run').evaluate((b) => b.getBoundingClientRect().bottom <= window.innerHeight);
  await page.goto('/create');
  await expect.poll(runInView).toBe(true);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/create');
  await expect(page.getByRole('button', { name: 'Thoát', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  // A phone keeps the banner to one row: the name beside the exit button, without the note on whose account pays (it was 152 px tall).
  await expect(page.locator('.impersonation-note')).toBeHidden();
  expect((await page.locator('.impersonation-banner').boundingBox())!.height).toBeLessThan(60);
  await expect.poll(runInView).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight)).toBe(true);

  await page.getByRole('button', { name: 'Thoát', exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/users$/);
  await expect(page.getByRole('heading', { name: 'Người dùng' })).toBeVisible();
  await expect(page.getByText('Bạn đang đăng nhập thay')).toHaveCount(0);
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(page.getByRole('button', { name: 'Đăng nhập thay impmember@e2e.test' })).toBeVisible();
});

test('an Admin without the developer flag sees neither the sign-in-as action nor the developer switch', async ({ page }) => {
  await signIn(page, 'impplain');
  await page.goto('/admin/users');
  await page.getByLabel('Tìm theo tên hoặc email').fill('imp');
  await expect(page.getByRole('button', { name: 'Sửa impmember@e2e.test' })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Đăng nhập thay / })).toHaveCount(0);
  await page.getByRole('button', { name: 'Sửa impdev@e2e.test' }).click();
  await expect(page.getByLabel('Vai trò của impdev@e2e.test')).toBeVisible();
  await expect(page.getByLabel(/^Nhà phát triển: /)).toHaveCount(0);
});
