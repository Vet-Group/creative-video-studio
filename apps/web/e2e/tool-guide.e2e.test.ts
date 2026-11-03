import { expect, test } from '@playwright/test';
import { signIn } from './support.test';

// Which creative tool to use when: the sidebar's line per tool, the guide dialog, each tool page's hint strip and Explore's start list.
test('the sidebar tells what each creative tool is for, and "Chọn công cụ nào?" compares them and opens the right one', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page, 'toolg');
  await page.goto('/library');
  const nav = page.getByRole('navigation', { name: 'Điều hướng chính' });
  const tryOn = nav.getByRole('link', { name: 'Thử đồ', exact: true });
  await expect(tryOn).toHaveAccessibleDescription(/^Mặc quần áo của bạn lên người mẫu/);
  const hint = page.locator('.nav-item').filter({ has: page.getByRole('link', { name: 'Thử đồ', exact: true }) }).locator('.nav-hint');
  await expect(hint).toBeHidden();
  await tryOn.hover();
  await expect(hint).toBeVisible();
  await page.mouse.move(800, 600);
  await expect(hint).toBeHidden();
  // A keyboard user reads it too, and Esc puts it away.
  await nav.getByRole('link', { name: 'Thư viện', exact: true }).focus();
  await page.keyboard.press('Shift+Tab');
  const video = page.locator('.nav-item').filter({ has: page.getByRole('link', { name: 'Ứng dụng', exact: true }) }).locator('.nav-hint');
  await expect(video).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(video).toBeHidden();
  // A click leaves focus on the link, but not the line over the page.
  await nav.getByRole('link', { name: 'Tạo ảnh', exact: true }).click();
  await expect(page).toHaveURL(/\/image-generation$/);
  await page.mouse.move(800, 600);
  await expect(page.locator('.nav-item').filter({ has: page.getByRole('link', { name: 'Tạo ảnh', exact: true }) }).locator('.nav-hint')).toBeHidden();

  await nav.getByRole('button', { name: 'Chọn công cụ nào?' }).click();
  const guide = page.getByRole('dialog', { name: 'Chọn công cụ nào?' });
  await expect(guide.getByRole('table').getByRole('rowheader')).toHaveText(['Thử đồ', 'Tạo ảnh', 'Tạo video', 'Marketing Studio', 'Ứng dụng']);
  await expect(guide.getByRole('heading', { level: 3 })).toHaveCount(2 + 5);
  await guide.getByRole('link', { name: /^Thử trang sức lên người mẫu/ }).click();
  await expect(page).toHaveURL(/\/apps\/jewelry-try-on$/);
  await expect(guide).toHaveCount(0);
});

test('a tool page opens with when to use it, links to the others and the guide, and its hint stays hidden once closed', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page, 'toolg');
  await page.goto('/create');
  const hint = page.getByRole('complementary', { name: 'Khi nào dùng Tạo video' });
  await expect(hint).toContainText('Dùng khi: Bạn đã có ảnh đẹp và muốn nó chuyển động');
  await expect(hint.getByRole('link', { name: 'Marketing Studio' })).toHaveAttribute('href', '/marketing-studio');
  await hint.getByRole('button', { name: 'So sánh các công cụ' }).click();
  await expect(page.getByRole('dialog', { name: 'Chọn công cụ nào?' })).toBeVisible();
  await page.keyboard.press('Escape');
  await hint.getByRole('button', { name: 'Ẩn gợi ý này' }).click();
  await expect(hint).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Tạo video', level: 1 })).toBeAttached();
  await expect(page.getByRole('complementary', { name: 'Khi nào dùng Tạo video' })).toHaveCount(0);
  // Hidden on this page only.
  for (const [path, name] of [['/try-on', 'Thử đồ'], ['/image-generation', 'Tạo ảnh'], ['/marketing-studio', 'Marketing Studio'], ['/apps', 'Ứng dụng']]) {
    await page.goto(path!);
    await expect(page.getByRole('complementary', { name: `Khi nào dùng ${name}` })).toBeVisible();
  }
});

test('Explore starts from what you need, and the drawer on a phone shows each tool’s line without sideways scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page, 'toolg');
  await page.goto('/explore');
  const start = page.getByRole('list', { name: 'Bắt đầu từ đâu' });
  await expect(start.getByRole('link')).toHaveCount(6);
  await expect(start.getByRole('link', { name: /^Có ảnh quần áo, cần ảnh người mẫu mặc nó/ })).toHaveAttribute('href', '/try-on');
  await expect(page.getByRole('list', { name: 'Công cụ' }).getByRole('link', { name: /^Tạo ảnh Ảnh mới từ một câu mô tả/ })).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  const fits = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  expect(await fits()).toBe(true);
  await page.getByRole('button', { name: 'Mở menu' }).click();
  const drawer = page.getByRole('dialog', { name: 'Menu' });
  await expect(drawer.locator('.nav-hint').filter({ hasText: 'Công cụ một việc' })).toBeVisible();
  await drawer.getByRole('button', { name: 'Chọn công cụ nào?' }).click();
  await expect(drawer).toHaveCount(0); // the drawer gives way to the guide
  const guide = page.getByRole('dialog', { name: 'Chọn công cụ nào?' });
  await expect(guide).toBeVisible();
  // On a phone the comparison is one card per tool, each line labelled, with nothing to scroll sideways.
  const compare = guide.locator('.tool-compare-wrap');
  await compare.scrollIntoViewIfNeeded();
  expect(await compare.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  expect(await guide.getByRole('cell').first().evaluate((el) => getComputedStyle(el, '::before').content)).toBe('"Bạn đưa vào: "');
  await page.keyboard.press('Escape');
  await page.goto('/try-on');
  await expect(page.getByRole('complementary', { name: 'Khi nào dùng Thử đồ' })).toBeVisible();
  expect(await fits()).toBe(true);
});
