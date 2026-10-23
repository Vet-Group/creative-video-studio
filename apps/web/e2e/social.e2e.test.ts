import { expect, test } from '@playwright/test';
import { signIn } from './support.test';

// The e2e server runs with no Google or Lark values (serve.ts), so no social button shows anywhere.
test('the login page explains a refused social sign-in and shows no social button', async ({ page }) => {
  await page.goto('/login?error=signup_disabled');
  await expect(page.getByRole('alert').filter({ hasText: 'Email này chưa được cấp quyền. Liên hệ Admin.' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Google|Lark/ })).toHaveCount(0);
});

test('a user sees the password method under Settings, Connected accounts, and on the sign-in methods page', async ({ page }) => {
  await signIn(page, 'member1');
  await page.getByRole('button', { name: 'Cài đặt' }).click();
  const settings = page.getByRole('dialog', { name: 'Cài đặt' });
  await settings.getByRole('button', { name: 'Tài khoản liên kết' }).click();
  await expect(settings.getByRole('heading', { name: 'Phương thức đăng nhập' })).toBeVisible();
  await expect(settings.getByText('Email và mật khẩu')).toBeVisible();
  await expect(settings.getByRole('button', { name: /Liên kết|Huỷ liên kết/ })).toHaveCount(0);

  await page.goto('/account/sign-in-methods'); // where a Google or Lark link returns
  await expect(page.getByRole('heading', { name: 'Phương thức đăng nhập' })).toBeVisible();
  await expect(page.getByText('Email và mật khẩu')).toBeVisible();
});
