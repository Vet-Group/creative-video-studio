import { expect, type Page, test } from '@playwright/test';
import { gotoPastSignOut, loginReady, openSettings, signIn } from './support.test';
import { totpCode, wrongCode } from './totp';
import { PASSWORD, USERS, type UserKey } from './users';

async function signOut(page: Page) {
  const dialog = await openSettings(page); // retries the menu until the page has hydrated
  await dialog.getByRole('button', { name: 'Đăng xuất' }).click();
  await expect(page).toHaveURL(/\/login$/);
}

/** Gives the email and password on the login page; an account with 2FA on then shows the code step. */
async function password(page: Page, who: UserKey) {
  await loginReady(page);
  await page.getByLabel('Email').fill(USERS[who].email);
  await page.getByLabel('Mật khẩu').fill(PASSWORD);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
}

/** Turns 2FA on for the signed-in user through the API, as the Settings flow does, and returns the base32 secret. */
async function enableByApi(page: Page): Promise<string> {
  const post = (path: string, body: unknown) =>
    page.evaluate(
      async ([p, b]) => (await fetch(`/api/auth/two-factor/${p}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) })).json(),
      [path, body] as const,
    );
  const { totpURI } = (await post('enable', { password: PASSWORD })) as { totpURI: string };
  const secret = new URL(totpURI).searchParams.get('secret')!;
  await post('verify-totp', { code: await totpCode(secret) });
  return secret;
}

test('a member turns 2FA on in Settings, then a password sign-in asks for a code, a backup code works once, and a trusted device skips the step', async ({ page }) => {
  await signIn(page, 'totpa');
  const settings = await openSettings(page);
  await settings.getByRole('button', { name: 'Bảo mật' }).click();
  const box = settings.getByRole('group', { name: 'Xác thực 2 lớp' });
  await expect(box.getByText('Đang tắt')).toBeVisible();
  await box.getByRole('button', { name: 'Bật xác thực 2 lớp' }).click();
  await box.getByLabel('Mật khẩu', { exact: true }).fill('not-my-password');
  await box.getByRole('button', { name: 'Tiếp tục' }).click();
  await expect(box.getByRole('alert')).toHaveText('Mật khẩu không đúng.');
  await box.getByLabel('Mật khẩu', { exact: true }).fill(PASSWORD);
  await box.getByRole('button', { name: 'Tiếp tục' }).click();
  await expect(box.getByRole('img', { name: 'Mã QR để thêm tài khoản vào ứng dụng xác thực' })).toBeVisible();
  const secret = (await box.getByTestId('totp-secret').textContent())!;
  await box.getByLabel('Mã 6 số').fill(wrongCode(await totpCode(secret)));
  await box.getByRole('button', { name: 'Xác nhận' }).click();
  await expect(box.getByRole('alert')).toHaveText('Mã xác thực không đúng.');
  await expect(page).not.toHaveURL(/\/login/); // a wrong code is no lost session
  await box.getByLabel('Mã 6 số').fill(await totpCode(secret));
  await box.getByRole('button', { name: 'Xác nhận' }).click();
  const codes = box.getByRole('list', { name: 'Mã dự phòng' }).getByRole('listitem');
  await expect(codes).toHaveCount(10);
  const backup = (await codes.first().textContent())!;
  const [file] = await Promise.all([page.waitForEvent('download'), box.getByRole('link', { name: 'Tải .txt' }).click()]);
  expect(file.suggestedFilename()).toBe('ma-du-phong-vet-cvs.txt');
  await box.getByRole('button', { name: 'Tôi đã lưu' }).click();
  await expect(codes).toHaveCount(0);
  await expect(box.getByText('Đang bật')).toBeVisible();
  await page.keyboard.press('Escape');
  await signOut(page);

  // The password alone opens no session now: the code step shows, a wrong code shakes the camera, the right one enters.
  await password(page, 'totpa');
  const code = page.getByLabel('Mã xác thực');
  await expect(code).toHaveAttribute('autocomplete', 'one-time-code');
  await expect(code).toHaveAttribute('inputmode', 'numeric');
  expect((await page.request.get('/api/auth/get-session')).status()).toBe(200);
  expect(await (await page.request.get('/api/auth/get-session')).json()).toBeNull();
  await code.fill(wrongCode(await totpCode(secret)));
  await page.getByRole('button', { name: 'Xác nhận' }).click();
  await expect(page.locator('.login-form').getByRole('alert')).toHaveText('Mã xác thực không đúng.');
  await code.fill(await totpCode(secret));
  await page.getByRole('button', { name: 'Xác nhận' }).click();
  await expect(page).toHaveURL(/\/create$/);
  await signOut(page);

  // A backup code signs in once; the same one is refused the next time.
  await password(page, 'totpa');
  await page.getByRole('button', { name: 'Dùng mã dự phòng' }).click();
  await page.getByLabel('Mã dự phòng').fill(backup);
  await page.getByRole('button', { name: 'Xác nhận' }).click();
  await expect(page).toHaveURL(/\/create$/);
  await signOut(page);
  await password(page, 'totpa');
  await page.getByRole('button', { name: 'Dùng mã dự phòng' }).click();
  await page.getByLabel('Mã dự phòng').fill(backup);
  await page.getByRole('button', { name: 'Xác nhận' }).click();
  await expect(page.locator('.login-form').getByRole('alert')).toHaveText('Mã dự phòng không đúng hoặc đã được dùng.');

  // Back to the app's code, trusting this device: the next password sign-in skips the step and keeps the return page.
  await page.getByRole('button', { name: 'Dùng mã từ ứng dụng' }).click();
  await page.getByLabel('Mã xác thực').fill(await totpCode(secret));
  await page.getByLabel('Tin thiết bị này 30 ngày').check();
  await page.getByRole('button', { name: 'Xác nhận' }).click();
  await expect(page).toHaveURL(/\/create$/);
  await signOut(page);
  await page.goto('/login?next=%2Flibrary');
  await password(page, 'totpa');
  await expect(page).toHaveURL(/\/library$/);
});

test('a passkey sign-in is not asked for a code; "Quay lại" leaves the code step, which keeps the return page', async ({ page }) => {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true },
  });
  // No passkey suggestions in the Email field, so only the button signs in with one.
  await page.addInitScript(() => {
    PublicKeyCredential.isConditionalMediationAvailable = async () => false;
  });
  await signIn(page, 'totpc');
  await page.goto('/account/sign-in-methods');
  await page.getByRole('button', { name: 'Thêm passkey' }).click();
  await expect(page.getByText(/^Thêm ngày \d{2}\/\d{2}\/\d{4}$/)).toBeVisible();
  const secret = await enableByApi(page);
  await signOut(page);
  await page.getByRole('button', { name: 'Đăng nhập bằng passkey', exact: true }).click();
  await expect(page).toHaveURL(/\/create$/);
  await signOut(page);

  await page.goto('/login?next=%2Flibrary');
  await password(page, 'totpc');
  await page.getByRole('button', { name: 'Quay lại' }).click();
  await expect(page.getByRole('heading', { name: 'Đăng nhập' })).toBeVisible();
  await password(page, 'totpc');
  await page.getByLabel('Mã xác thực').fill(await totpCode(secret));
  await page.getByRole('button', { name: 'Xác nhận' }).click();
  await expect(page).toHaveURL(/\/library$/);
});

test('an Admin turns off the 2FA of a user who lost the phone: the user is signed out and the password alone works', async ({ page, browser }) => {
  const user = await browser.newContext();
  const userPage = await user.newPage();
  await signIn(userPage, 'totpb');
  await enableByApi(userPage);

  await signIn(page, 'admin');
  await page.goto('/admin/users');
  const row = page.getByRole('row').filter({ hasText: USERS.totpb.email });
  await expect(row.getByText('2FA', { exact: true })).toBeVisible();
  await row.getByRole('button', { name: `Sửa ${USERS.totpb.email}` }).click();
  const off = page.getByRole('button', { name: `Tắt xác thực 2 lớp của ${USERS.totpb.email}` });
  // A confirm step first: dismissing it changes nothing.
  const confirm = page.getByRole('dialog', { name: `Tắt xác thực 2 lớp của ${USERS.totpb.email}?` });
  await off.click();
  await confirm.getByRole('button', { name: 'Huỷ', exact: true }).click();
  await expect(confirm).toBeHidden();
  await expect(off).toBeVisible();
  await off.click();
  await Promise.all([
    page.waitForResponse((r) => r.url().includes('/api/admin/users/') && r.request().method() === 'PATCH' && r.ok()),
    confirm.getByRole('button', { name: 'Tắt xác thực 2 lớp', exact: true }).click(),
  ]);
  await expect(off).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(row.getByText('2FA', { exact: true })).toHaveCount(0);

  await gotoPastSignOut(userPage, '/library');
  await expect(userPage).toHaveURL(/\/login\?next=%2Flibrary$/);
  await password(userPage, 'totpb');
  await expect(userPage).toHaveURL(/\/library$/);
  await user.close();
});
