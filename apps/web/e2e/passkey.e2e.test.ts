import { expect, type Page, test } from '@playwright/test';
import { signIn } from './support.test';

// A virtual authenticator of the browser (Chrome DevTools Protocol) stands in for the platform's own, and confirms each ceremony itself.
async function virtualAuthenticator(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true },
  });
}

async function signOut(page: Page) {
  await page.getByRole('button', { name: 'Cài đặt' }).click();
  await page.getByRole('dialog', { name: 'Cài đặt' }).getByRole('button', { name: 'Đăng xuất' }).click();
  await expect(page).toHaveURL(/\/login$/);
}

test('a member adds a passkey, signs in with it, sees it marked as used last, and deletes it', async ({ page }) => {
  await virtualAuthenticator(page);
  await signIn(page, 'passa');

  await page.goto('/account/sign-in-methods');
  await page.getByRole('button', { name: 'Thêm passkey' }).click();
  await expect(page.getByText(/^Passkey · \d{2}\/\d{2}\/\d{4}$/)).toBeVisible();

  await signOut(page);
  const button = page.getByRole('button', { name: 'Đăng nhập bằng passkey', exact: true });
  await expect(button).toBeEnabled();
  // The Email field's passkey suggestion may already have signed in; otherwise the button does.
  if (page.url().endsWith('/login')) await button.click();
  await expect(page).toHaveURL(/\/create$/);

  // No suggestion request this time, so the login page stays put while the mark is checked.
  await page.route('**/api/auth/passkey/generate-authenticate-options', (route) => route.abort());
  await signOut(page);
  await expect(button.locator('.login-last')).toHaveText('Lần trước');
  await page.unroute('**/api/auth/passkey/generate-authenticate-options');

  await signIn(page, 'passa');
  await page.goto('/account/sign-in-methods');
  await page.getByRole('button', { name: /^Xoá passkey ngày / }).click();
  await expect(page.getByText(/^Passkey · /)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Thêm passkey' })).toBeEnabled();
});
