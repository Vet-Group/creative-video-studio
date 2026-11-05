import { test, expect } from '@playwright/test';
import { signIn } from './support.test';

// A page whose cookies were cleared sends itself to /login?next=… on its next 401; that used to abort signIn's own goto (2 of 8 runs at these delays).
for (const ms of [50, 100]) {
  test(`signIn still signs in when the open page sends itself to the login ${ms} ms into it`, async ({ page }) => {
    await signIn(page, 'admin');
    await page.context().clearCookies();
    await page.evaluate((d) => setTimeout(() => window.location.assign('/login?next=%2Fhistory'), d), ms);
    await signIn(page, 'admin');
    await expect(page).toHaveURL(/\/create$/);
  });
}
