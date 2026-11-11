import { expect, test } from '@playwright/test';
import { accountButton, openSettings, signIn } from './support.test';

test('a user renames themselves and picks an avatar colour; both stay after a reload, in the dialog and the sidebar', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page, 'seta');
  let settings = await openSettings(page);
  await settings.getByRole('button', { name: 'Sửa tên, màu và email' }).click();
  const name = settings.getByLabel('Tên hiển thị');
  await expect(name).toBeFocused();
  await expect(name).toHaveValue('E2E Settings A');
  await name.fill('   ');
  await settings.getByRole('button', { name: 'Lưu' }).click();
  await expect(settings.getByRole('alert')).toHaveText('Hãy nhập tên hiển thị.');

  await name.fill('  E2E Đổi Tên  ');
  const colours = settings.getByRole('group', { name: 'Màu ảnh đại diện' }).getByRole('radio');
  await expect(colours).toHaveCount(8);
  await expect(settings.getByRole('group', { name: 'Màu ảnh đại diện' }).getByRole('radio', { checked: true })).toHaveCount(1); // the colour the name gives is picked to start with
  await settings.getByRole('radio', { name: 'Chàm' }).check();
  await settings.getByRole('button', { name: 'Lưu' }).click();
  await expect(settings.getByLabel('Tên hiển thị')).toBeHidden();
  await expect(settings.getByText('E2E Đổi Tên', { exact: true })).toBeVisible();
  await expect(settings.locator('.profile-card .avatar')).toHaveCSS('background-color', 'rgb(67, 56, 202)');
  await expect(settings.locator('.profile-card .avatar')).toHaveText('ET');
  await expect(settings.getByRole('button', { name: 'Sửa tên, màu và email' })).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(accountButton(page)).toHaveAccessibleName('Tài khoản: E2E Đổi Tên'); // router.refresh() reran the layout
  await expect(page.locator('.account-chip .avatar')).toHaveCSS('background-color', 'rgb(67, 56, 202)');
  await page.reload();
  await expect(page.locator('.account-chip .account-name')).toHaveText('E2E Đổi Tên');
  settings = await openSettings(page);
  await expect(settings.getByText('E2E Đổi Tên', { exact: true })).toBeVisible();
  await expect(settings.locator('.profile-card .avatar')).toHaveCSS('background-color', 'rgb(67, 56, 202)');
  await settings.getByRole('button', { name: 'Sửa tên, màu và email' }).click();
  await expect(settings.getByRole('radio', { name: 'Chàm' })).toBeChecked();

  // The user changes their own sign-in email; a bad address is refused on the spot, the saved one shows at once, then it goes back.
  const email = settings.getByLabel('Email đăng nhập');
  const original = await email.inputValue();
  await email.fill('not an email');
  await settings.getByRole('button', { name: 'Lưu' }).click();
  await expect(settings.getByRole('alert')).toHaveText('Email không hợp lệ.');
  await email.fill('  E2E.Seta.New@Example.test ');
  await settings.getByRole('button', { name: 'Lưu' }).click();
  await expect(settings.locator('.profile-email')).toHaveText('e2e.seta.new@example.test');
  await settings.getByRole('button', { name: 'Sửa tên, màu và email' }).click();
  await settings.getByLabel('Email đăng nhập').fill(original);
  await settings.getByRole('button', { name: 'Lưu' }).click();
  await expect(settings.locator('.profile-email')).toHaveText(original);
});

test('the protection card scores the account and jumps to the missing check; the usage strip leads to Limits', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page, 'setb');
  const settings = await openSettings(page);
  await expect(settings.getByRole('img', { name: 'Đạt 1 trên 3' })).toBeVisible(); // a password, no passkey, no 2FA
  await expect(settings.getByText('Clip video', { exact: true })).toBeVisible();
  await expect(settings.getByText('0 / 1000')).toBeVisible();
  await settings.getByRole('button', { name: 'Thiết lập Xác thực 2 lớp' }).click();
  await expect(settings.getByRole('button', { name: 'Bảo mật', exact: true })).toHaveAttribute('aria-current', 'true');
  await expect(settings.getByRole('heading', { name: 'Bảo mật' })).toBeFocused();
  await expect(settings.getByRole('group', { name: 'Xác thực 2 lớp' })).toBeInViewport();

  await settings.getByRole('button', { name: 'Hồ sơ', exact: true }).click();
  await settings.getByRole('button', { name: 'Xem hạn mức' }).click();
  await expect(settings.getByRole('button', { name: 'Hạn mức', exact: true })).toHaveAttribute('aria-current', 'true');
  await expect(settings.getByRole('meter', { name: 'Clip video hôm nay' })).toHaveAttribute('aria-valuemax', '1000');
  await expect(settings.locator('.meter-head', { hasText: 'Tổng chi phí tháng này của bạn' })).toContainText('$0.00'); // a new user has no ledger rows
});

test('on a phone Settings is a list of sections; a section opens as a page with a back button, and Esc still closes', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, 'setb');
  const settings = await openSettings(page); // from the top bar's avatar
  const nav = settings.getByRole('navigation', { name: 'Tài khoản' });
  await expect(nav).toBeVisible();
  await expect(settings.getByText('Mật khẩu, xác thực 2 lớp, thiết bị')).toBeVisible();
  await expect(settings.getByRole('heading', { name: 'Hồ sơ' })).toBeHidden();
  for (const row of await nav.getByRole('button').all()) expect((await row.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);

  await nav.getByRole('button', { name: 'Bảo mật' }).click();
  const heading = settings.getByRole('heading', { name: 'Bảo mật' });
  await expect(heading).toBeFocused();
  await expect(nav).toBeHidden();
  await expect(settings.getByRole('group', { name: 'Phiên đăng nhập' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  const box = (await settings.boundingBox())!;
  expect(box.x + box.width).toBeLessThanOrEqual(390 - 16);

  await settings.getByRole('button', { name: 'Cài đặt', exact: true }).click();
  await expect(nav).toBeVisible();
  await expect(heading).toBeHidden();
  await expect(nav.getByRole('button', { name: 'Bảo mật' })).toBeFocused();

  await nav.getByRole('button', { name: 'Tuỳ chọn' }).click();
  await expect(settings.getByRole('heading', { name: 'Tuỳ chọn' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(settings).toBeHidden();
});

test('the preferences switch on (with the notification permission) and stay on after a reload', async ({ page, context }) => {
  await context.grantPermissions(['notifications']);
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page, 'setb');
  let settings = await openSettings(page);
  await settings.getByRole('button', { name: 'Tuỳ chọn', exact: true }).click();
  const notify = settings.getByRole('switch', { name: 'Thông báo khi xong' });
  const sound = settings.getByRole('switch', { name: 'Âm báo' });
  await expect(notify).toHaveAttribute('aria-checked', 'false');
  await expect(sound).toHaveAttribute('aria-checked', 'false');
  await expect(settings.getByText('chỉ áp dụng trên thiết bị và trình duyệt này', { exact: false })).toBeVisible();
  await expect(settings.getByRole('list', { name: 'Phím tắt' }).getByRole('listitem')).toHaveCount(4);
  await notify.click();
  await sound.click();
  await expect(notify).toHaveAttribute('aria-checked', 'true');
  await expect(sound).toHaveAttribute('aria-checked', 'true');

  await page.reload();
  settings = await openSettings(page);
  await settings.getByRole('button', { name: 'Tuỳ chọn', exact: true }).click();
  await expect(settings.getByRole('switch', { name: 'Thông báo khi xong' })).toHaveAttribute('aria-checked', 'true');
  await expect(settings.getByRole('switch', { name: 'Âm báo' })).toHaveAttribute('aria-checked', 'true');
  await settings.getByRole('switch', { name: 'Âm báo' }).click();
  await page.reload();
  settings = await openSettings(page);
  await settings.getByRole('button', { name: 'Tuỳ chọn', exact: true }).click();
  await expect(settings.getByRole('switch', { name: 'Âm báo' })).toHaveAttribute('aria-checked', 'false');
});
