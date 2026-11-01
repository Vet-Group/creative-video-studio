import { expect, test } from '@playwright/test';
import { signIn } from './support.test';
import { PASSWORD, USERS } from './users';

test('the login page refuses a wrong password and has no Lark button while Lark is not configured', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('button', { name: /Lark/ })).toHaveCount(0);

  await page.getByLabel('Email').fill(USERS.member1.email);
  await page.getByLabel('Mật khẩu').fill(`${PASSWORD}-wrong`);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Email hoặc mật khẩu không đúng.' })).toBeVisible();
});

test('only an Admin sees the remaining company budget', async ({ page }) => {
  await signIn(page, 'admin');
  await expect(page.getByText('Ngân sách tháng còn lại của công ty: $')).toBeVisible();
});

test('a signed-out visit to the Library goes to the login page', async ({ page }) => {
  await page.goto('/library');
  await expect(page).toHaveURL(/\/login$/);
});

test('a limiter refusal says how long to wait instead of blaming the password', async ({ page }) => {
  await page.route('**/api/auth/sign-in/email', (route) =>
    route.fulfill({ status: 429, headers: { 'content-type': 'application/json', 'x-retry-after': '7' }, body: JSON.stringify({ message: 'Too many requests.' }) }),
  );
  await page.goto('/login');
  await page.getByLabel('Email').fill(USERS.member1.email);
  await page.getByLabel('Mật khẩu').fill(PASSWORD);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('Bạn thử quá nhiều lần. Hãy đợi 7 giây rồi thử lại.');
});
