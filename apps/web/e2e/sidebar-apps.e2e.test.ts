import { expect, type Page, test } from '@playwright/test';
import { signIn } from './support.test';

const nav = (page: Page) => page.getByRole('navigation', { name: 'Điều hướng chính' });
const toggle = (page: Page) => nav(page).getByRole('button', { name: 'Ứng dụng nhanh' });
const shortcuts = (page: Page) => nav(page).getByRole('list', { name: 'Ứng dụng nhanh' });
const NAMES = ['Tất cả ứng dụng', 'Thử trang sức', 'Thử đồ lót', 'Tạo người mẫu AI', 'Tối ưu media', 'Đổi nền'];

test('the Apps row opens and closes a list of app shortcuts, remembers the choice and links to the apps', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signIn(page, 'member1');
  await expect(toggle(page)).toHaveAttribute('aria-expanded', 'false');
  await expect(toggle(page)).toHaveAttribute('aria-controls', await page.locator('ul.nav-sub').evaluate((ul) => ul.id)); // the button names the list it opens (hidden, so not found by role)
  await expect(shortcuts(page)).toBeHidden();

  await toggle(page).click();
  await expect(toggle(page)).toHaveAttribute('aria-expanded', 'true');
  await expect(shortcuts(page).getByRole('link')).toHaveText(NAMES);
  await page.reload();
  await expect(toggle(page)).toHaveAttribute('aria-expanded', 'true'); // remembered in this browser

  await shortcuts(page).getByRole('link', { name: 'Thử trang sức' }).click();
  await expect(page).toHaveURL(/\/apps\/jewelry-try-on$/);
  await expect(shortcuts(page).getByRole('link', { name: 'Thử trang sức' })).toHaveAttribute('aria-current', 'page');
  await expect(shortcuts(page).getByRole('link', { name: 'Tất cả ứng dụng' })).not.toHaveAttribute('aria-current', 'page');
  await expect(nav(page).getByRole('link', { name: 'Ứng dụng', exact: true })).toHaveAttribute('aria-current', 'page');

  await toggle(page).click();
  await expect(toggle(page)).toHaveAttribute('aria-expanded', 'false');
  await expect(shortcuts(page)).toBeHidden();
  await page.reload();
  await expect(toggle(page)).toHaveAttribute('aria-expanded', 'false');
});

test('All apps is the current item on the Apps index, and the icon rail leaves the list out', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signIn(page, 'member1');
  await page.goto('/apps');
  await toggle(page).click();
  await expect(shortcuts(page).getByRole('link', { name: 'Tất cả ứng dụng' })).toHaveAttribute('aria-current', 'page');
  await page.getByRole('button', { name: 'Thu gọn thanh bên' }).click();
  await expect(toggle(page)).toBeHidden();
  await expect(shortcuts(page)).toBeHidden();
  await page.getByRole('button', { name: 'Thu gọn thanh bên' }).click();
  await expect(shortcuts(page)).toBeVisible(); // the open choice came through the rail
});

test('the page works when the browser refuses storage: the list stays closed and still opens', async ({ page }) => {
  await page.addInitScript(() => {
    // Refuses only the sidebar's own key, so the rest of the app still has its storage.
    const blocked = (key: string) => {
      if (key === 'cvs.sidebar.apps.open') throw new DOMException('blocked', 'SecurityError');
    };
    const get = Storage.prototype.getItem;
    const set = Storage.prototype.setItem;
    Storage.prototype.getItem = function (key) {
      blocked(key);
      return get.call(this, key);
    };
    Storage.prototype.setItem = function (key, value) {
      blocked(key);
      set.call(this, key, value);
    };
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signIn(page, 'member1');
  await expect(toggle(page)).toHaveAttribute('aria-expanded', 'false');
  await toggle(page).click();
  await expect(shortcuts(page).getByRole('link')).toHaveText(NAMES);
});

test.describe('on a phone with touch', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('the toggle and the shortcuts are 44 px touch targets in the drawer', async ({ page }) => {
    await signIn(page, 'member1');
    await page.getByRole('button', { name: 'Mở menu' }).click();
    await toggle(page).click();
    await expect(shortcuts(page).getByRole('link')).toHaveCount(NAMES.length);
    const boxes = [await toggle(page).boundingBox(), ...(await Promise.all((await shortcuts(page).getByRole('link').all()).map((a) => a.boundingBox())))];
    for (const b of boxes) {
      expect(b!.height).toBeGreaterThanOrEqual(44);
    }
    expect(boxes[0]!.width).toBeGreaterThanOrEqual(44);
  });
});
