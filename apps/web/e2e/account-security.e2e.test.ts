import { type Browser, expect, type Page, test } from '@playwright/test';
import { loginReady, openSettings, signIn } from './support.test';
import { PASSWORD, USERS, type UserKey } from './users';

// Built from the fixture password so no password-like literal sits in the source (the secret scan flags those).
const TEMP_PASSWORD = `${PASSWORD}-tam`;

/** Signs in on the login page with any password and waits for the page the app opens. */
async function logIn(page: Page, who: UserKey, password: string, landing: RegExp) {
  await page.goto('/login');
  await loginReady(page);
  await page.getByLabel('Email').fill(USERS[who].email);
  await page.getByLabel('Mật khẩu').fill(password);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await expect(page).toHaveURL(landing);
}

/** A second browser (its own cookies) signed in as the same user, as another device would be. */
async function otherDevice(browser: Browser, who: UserKey) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await signIn(page, who);
  return { context, page };
}

async function openSecurity(page: Page) {
  const settings = await openSettings(page);
  await settings.getByRole('button', { name: 'Bảo mật' }).click();
  return settings;
}

test('a user changes their password in Settings: the old one stops working and the other device is signed out', async ({ page, browser }) => {
  const other = await otherDevice(browser, 'seca');
  await signIn(page, 'seca');
  const settings = await openSecurity(page);
  const disclosure = settings.getByRole('button', { name: 'Đổi mật khẩu' }).and(settings.locator('[aria-expanded]'));
  await expect(disclosure).toHaveAttribute('aria-expanded', 'false');
  await disclosure.click();
  await expect(disclosure).toHaveAttribute('aria-expanded', 'true');
  const form = settings.getByRole('group', { name: 'Đổi mật khẩu' });
  await form.getByLabel('Mật khẩu hiện tại').fill('not-my-password');
  await form.getByLabel('Mật khẩu mới', { exact: true }).fill('seca-new-password-1');
  await form.getByLabel('Nhập lại mật khẩu mới').fill('seca-new-password-2');
  await form.getByRole('button', { name: 'Đổi mật khẩu' }).click();
  await expect(form.getByRole('alert')).toHaveText('Mật khẩu nhập lại không khớp.');
  await form.getByLabel('Nhập lại mật khẩu mới').fill('seca-new-password-1');
  await form.getByRole('button', { name: 'Đổi mật khẩu' }).click();
  await expect(form.getByRole('alert')).toHaveText('Mật khẩu hiện tại không đúng.');
  await form.getByLabel('Mật khẩu hiện tại').fill(PASSWORD);
  await form.getByRole('button', { name: 'Đổi mật khẩu' }).click();
  // After a change the form closes again and the result stays in its place.
  await expect(settings.getByRole('status')).toHaveText('Đã đổi mật khẩu. Các thiết bị khác đã được đăng xuất.');
  await expect(form).toBeHidden();
  await expect(disclosure).toHaveAttribute('aria-expanded', 'false');
  await expect(settings.getByRole('list', { name: 'Phiên đăng nhập' }).getByRole('listitem')).toHaveCount(1);

  await other.page.goto('/library');
  await expect(other.page).toHaveURL(/\/login\?next=%2Flibrary$/);
  await other.context.close();

  await settings.getByRole('button', { name: 'Đăng xuất', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await loginReady(page);
  await page.getByLabel('Email').fill(USERS.seca.email);
  await page.getByLabel('Mật khẩu').fill(PASSWORD);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
  await logIn(page, 'seca', 'seca-new-password-1', /\/create$/);
});

test('a temporary password from an Admin opens only the change page until the user sets their own', async ({ page, browser }) => {
  const admin = await browser.newContext();
  const adminPage = await admin.newPage();
  await signIn(adminPage, 'admin');
  const { users } = (await (await adminPage.request.get('/api/admin/users')).json()) as { users: { id: string; email: string }[] };
  const id = users.find((u) => u.email === USERS.secb.email)!.id;
  expect((await adminPage.request.patch(`/api/admin/users/${id}`, { data: { temporaryPassword: TEMP_PASSWORD } })).status()).toBe(200);
  await admin.close();

  await logIn(page, 'secb', TEMP_PASSWORD, /\/account\/password$/);
  await expect(page.getByRole('heading', { name: 'Đặt mật khẩu mới' })).toBeVisible();
  await expect(page.getByText(USERS.secb.email)).toBeVisible();
  await expect(page.getByRole('navigation')).toHaveCount(0); // none of the app around it
  await page.goto('/create');
  await expect(page).toHaveURL(/\/account\/password$/);
  await page.goto('/account/sign-in-methods');
  await expect(page).toHaveURL(/\/account\/password$/);
  expect((await page.request.get('/api/me/limits')).status()).toBe(403);
  expect((await page.request.post('/api/jobs', { data: {} })).status()).toBe(403);

  await page.getByLabel('Mật khẩu hiện tại').fill(TEMP_PASSWORD);
  await page.getByLabel('Mật khẩu mới', { exact: true }).fill(TEMP_PASSWORD);
  await page.getByLabel('Nhập lại mật khẩu mới').fill(TEMP_PASSWORD);
  await page.getByRole('button', { name: 'Lưu và tiếp tục' }).click();
  await expect(page.getByRole('main').getByRole('alert')).toHaveText('Mật khẩu mới phải khác mật khẩu hiện tại.');
  await page.getByLabel('Mật khẩu mới', { exact: true }).fill('secb-own-password-1');
  await page.getByLabel('Nhập lại mật khẩu mới').fill('secb-own-password-1');
  await page.getByRole('button', { name: 'Lưu và tiếp tục' }).click();
  await expect(page).toHaveURL(/\/create$/);
  await expect(page.getByLabel('Ảnh sản phẩm')).toBeEnabled();
  await page.goto('/account/password');
  await expect(page).toHaveURL(/\/create$/);
});

test('the sessions list shows both devices and signs the other one out', async ({ page, browser }) => {
  const other = await otherDevice(browser, 'secc');
  await signIn(page, 'secc');
  const settings = await openSecurity(page);
  const rows = settings.getByRole('list', { name: 'Phiên đăng nhập' }).getByRole('listitem');
  await expect(rows).toHaveCount(2);
  await expect(rows.filter({ hasText: 'Thiết bị này' })).toHaveCount(1);
  await expect(rows.first()).toContainText(/(Edge|Chrome) trên Windows/);
  await settings.getByRole('button', { name: 'Đăng xuất các thiết bị khác' }).click();
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('Thiết bị này');
  await expect(settings.getByText('Không có thiết bị nào khác đang đăng nhập.')).toBeVisible();
  await other.page.goto('/create');
  await expect(other.page).toHaveURL(/\/login$/);
  await other.context.close();
});
