import { expect, test } from '@playwright/test';
import { signIn } from './support.test';

// The e2e server runs with no Google or Lark values (serve.ts), so no social button shows anywhere.
test('the login page explains a refused social sign-in and shows no social button', async ({ page }) => {
  await page.goto('/login?error=signup_disabled');
  await expect(page.getByRole('alert').filter({ hasText: 'Email này chưa được cấp quyền. Liên hệ Admin.' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Google|Lark/ })).toHaveCount(0);
});

test('a user opens the sign-in methods page from the menu and sees the password method', async ({ page }) => {
  await signIn(page, 'member1');
  await page.getByRole('link', { name: 'Phương thức đăng nhập' }).click();
  await expect(page).toHaveURL(/\/account\/sign-in-methods$/);
  await expect(page.getByRole('heading', { name: 'Phương thức đăng nhập' })).toBeVisible();
  await expect(page.getByText('Email và mật khẩu')).toBeVisible();
  await expect(page.getByRole('button', { name: /Liên kết|Huỷ liên kết/ })).toHaveCount(0);
});
