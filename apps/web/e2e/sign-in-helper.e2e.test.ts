import { test, expect } from '@playwright/test';
import { signIn } from './support.test';

// A page whose cookies were cleared sends itself to /login?next=… on its next 401; that used to abort signIn's own goto (2 of 8 runs at these delays).
for (const ms of [50, 100]) {
  test(`signIn still signs in when the open page sends itself to the login ${ms} ms into it`, async ({ page }) => {
    await signIn(page, 'admin');
    await page.context().clearCookies();
    // The page can also send itself to the login before this call is answered (its 5 s tray poll gets a 401 once the cookies are gone): its context is then destroyed
    // and the call rejects, but that is the redirect this spec wants, already done.
    await page
      .evaluate((d) => setTimeout(() => window.location.assign('/login?next=%2Fhistory'), d), ms)
      .catch((e: Error) => {
        if (!e.message.includes('Execution context was destroyed')) throw e;
      });
    await signIn(page, 'admin');
    await expect(page).toHaveURL(/\/create$/);
  });
}
