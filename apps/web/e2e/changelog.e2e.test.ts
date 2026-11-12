import { expect, type Page, test } from '@playwright/test';
import { signIn } from './support.test';

const SEEN = 'cvs.changelog.seen';
const POPUP = 'cvs.changelog.popup';
const longAgo = '2026-11-11T12:00:00+07:00'; // older than the newest three entries a member may read

const dot = (page: Page) => page.locator('.sidebar nav a[href="/changelog"] .nav-dot');
const popup = (page: Page) => page.getByRole('dialog', { name: 'Có gì mới' });

/** Pretends the member last looked at the changelog long ago, so newer entries are unseen. */
async function unseen(page: Page) {
  await page.evaluate(([seen, popupKey, value]) => (localStorage.setItem(seen!, value!), localStorage.removeItem(popupKey!)), [SEEN, POPUP, longAgo]);
}

test('a first visit shows the dot for the newest day but no popup; the page lists entries for members only, and a kind chip filters them', async ({ page }) => {
  await signIn(page, 'chga');
  await page.goto('/explore');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(popup(page)).toHaveCount(0);
  await expect(page.getByRole('link', { name: /^Có gì mới/ })).toBeVisible();
  await expect(dot(page)).toHaveCount(1);

  await page.getByRole('link', { name: /^Có gì mới/ }).click();
  await expect(page).toHaveURL(/\/changelog$/);
  await expect(dot(page)).toHaveCount(0);
  await expect(page.getByRole('heading', { level: 1, name: 'Có gì mới' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 3, name: 'Trang Có gì mới' })).toBeVisible();
  // Grouped by day, newest first.
  const days = page.locator('.changelog-day');
  expect(await days.count()).toBeGreaterThan(5);
  await expect(days.first()).toContainText('12');
  // A member sees no admin entry, no operations chip and no PR numbers.
  await expect(page.getByText('Chỉ quản trị viên')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Vận hành' })).toHaveCount(0);
  await expect(page.locator('.changelog-entry a[href*="/pull/"]')).toHaveCount(0);
  await expect(page.getByRole('heading', { level: 3, name: 'Xoá người dùng' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Sửa lỗi' }).click();
  await expect(page.getByRole('button', { name: 'Sửa lỗi' })).toHaveAttribute('aria-pressed', 'true');
  const chips = page.locator('.changelog-entry .kind-chip');
  expect(await chips.count()).toBeGreaterThan(0);
  await expect(chips.filter({ hasNotText: 'Sửa lỗi' })).toHaveCount(0);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/changelog');
  await expect(page.getByRole('heading', { level: 1, name: 'Có gì mới' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test('unseen entries show the dot and the Explore card, one popup a day that "Để sau" closes, and opening the page clears the dot', async ({ page }) => {
  await signIn(page, 'chga');
  await unseen(page);
  await page.goto('/explore');

  // The popup lists the three newest unseen entries, once.
  await expect(popup(page)).toBeVisible();
  await expect(popup(page).getByRole('listitem')).toHaveCount(3);
  await popup(page).getByRole('button', { name: 'Để sau' }).click();
  await expect(popup(page)).toBeHidden();
  await expect(dot(page)).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(popup(page)).toHaveCount(0);
  await expect(dot(page)).toBeVisible();

  // Explore shows the three newest entries and a link to all of them.
  const card = page.getByRole('list', { name: 'Thay đổi mới nhất' });
  await expect(card.getByRole('listitem')).toHaveCount(3);
  await page.getByRole('link', { name: /^Xem tất cả$/ }).first().click();
  await expect(page).toHaveURL(/\/changelog$/);
  await expect(page.getByText('Chưa xem').first()).toBeVisible();
  await expect(dot(page)).toHaveCount(0);

  await page.goto('/explore');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(dot(page)).toHaveCount(0);
  await expect(popup(page)).toHaveCount(0);
});

test('"Xem tất cả" in the popup opens the page and marks everything seen; an Admin also sees admin entries, operations and PR links', async ({ page, browser }) => {
  await signIn(page, 'chgb');
  await unseen(page);
  await page.goto('/explore');
  await popup(page).getByRole('button', { name: 'Xem tất cả' }).click();
  await expect(page).toHaveURL(/\/changelog$/);
  await expect(dot(page)).toHaveCount(0);
  expect(await page.evaluate((key) => localStorage.getItem(key), SEEN)).toMatch(/^2026-11-12T/);

  const context = await browser.newContext();
  try {
    const admin = await context.newPage();
    await signIn(admin, 'admin');
    await admin.goto('/changelog');
    await expect(admin.getByRole('heading', { level: 3, name: 'Xoá người dùng' })).toBeVisible();
    await expect(admin.getByText('Chỉ quản trị viên').first()).toBeVisible();
    await expect(admin.getByRole('button', { name: 'Vận hành' })).toBeVisible();
    await expect(admin.locator('.changelog-entry a[href$="/pull/396"]')).toBeVisible();
  } finally {
    await context.close();
  }
});
