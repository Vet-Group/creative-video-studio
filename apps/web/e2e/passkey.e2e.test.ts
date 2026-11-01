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
  const dialog = page.getByRole('dialog', { name: 'Cài đặt' });
  // Right after a navigation the page may not be hydrated yet, and a click on Settings then does nothing; click again until it opens.
  await expect(async () => {
    await page.getByRole('button', { name: 'Cài đặt' }).click();
    await expect(dialog).toBeVisible({ timeout: 2_000 });
  }).toPass();
  await dialog.getByRole('button', { name: 'Đăng xuất' }).click();
  await expect(page).toHaveURL(/\/login$/);
}

test('a member adds a passkey, signs in with it, sees it marked as used last, and deletes it', async ({ page }) => {
  await virtualAuthenticator(page);
  // No passkey suggestions in the Email field, so only the button signs in and the page never moves on by itself.
  await page.addInitScript(() => {
    PublicKeyCredential.isConditionalMediationAvailable = async () => false;
  });
  await signIn(page, 'passa');

  await page.goto('/account/sign-in-methods');
  await page.getByRole('button', { name: 'Thêm passkey' }).click();
  await expect(page.getByText(/^Passkey · \d{2}\/\d{2}\/\d{4}$/)).toBeVisible();

  await signOut(page);
  const button = page.getByRole('button', { name: 'Đăng nhập bằng passkey', exact: true });
  await button.click();
  await expect(page).toHaveURL(/\/create$/);

  await signOut(page);
  await expect(button.locator('.login-last')).toHaveText('Lần trước');

  await signIn(page, 'passa');
  await page.goto('/account/sign-in-methods');
  await page.getByRole('button', { name: /^Xoá passkey ngày / }).click();
  await expect(page.getByText(/^Passkey · /)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Thêm passkey' })).toBeEnabled();
});
