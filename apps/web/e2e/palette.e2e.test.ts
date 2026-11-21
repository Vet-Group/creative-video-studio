import { expect, type Page, test } from '@playwright/test';
import { signIn } from './support.test';

/** Lets the app render what a key just did, so a check that something did not happen is not passed too early. */
const settle = (page: Page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r(null))));

test('Ctrl+K opens the quick search even from a field, Esc closes it and gives the focus back, and "thu vien" then Enter opens the Library', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signIn(page, 'member1'); // lands on Create
  const palette = page.getByRole('dialog', { name: 'Tìm nhanh' });
  const box = palette.getByRole('combobox', { name: 'Tìm trang, ứng dụng hoặc lượt tạo' });
  const options = palette.getByRole('option');

  const prompt = page.getByLabel('Mô tả chuyển động');
  await prompt.fill('Slow turn of the bottle.');
  await prompt.press('ControlOrMeta+k');
  await expect(palette).toBeVisible();
  await expect(box).toBeFocused();
  await expect(prompt).toHaveValue('Slow turn of the bottle.'); // the K went to the shortcut, not into the field
  await expect(box).toHaveAttribute('aria-activedescendant', (await options.first().getAttribute('id'))!);
  await page.keyboard.press('ArrowDown');
  await expect(options.nth(1)).toHaveAttribute('aria-selected', 'true');
  await expect(box).toHaveAttribute('aria-activedescendant', (await options.nth(1).getAttribute('id'))!);
  await page.keyboard.press('ArrowUp');
  await expect(options.first()).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Escape');
  await expect(palette).toBeHidden();
  await expect(prompt).toBeFocused();

  // Over another dialog (Settings, by Ctrl+,) it stays shut, so that one is never left open behind the page it opens.
  await page.keyboard.press('ControlOrMeta+Comma');
  const settings = page.getByRole('dialog', { name: 'Cài đặt' });
  await expect(settings).toBeVisible();
  await page.keyboard.press('ControlOrMeta+k');
  await settle(page);
  await expect(palette).toBeHidden();
  await expect(settings).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(settings).toBeHidden();

  // The sidebar's row opens it too; case and accents do not count, and Enter opens the active option.
  await page.getByRole('navigation', { name: 'Điều hướng chính' }).getByRole('button', { name: 'Tìm nhanh' }).click();
  await expect(box).toBeFocused();
  await box.pressSequentially('thu vien');
  await expect(options.first()).toHaveText('Thư viện');
  await expect(options.first()).toHaveAttribute('aria-selected', 'true');
  // The Enter that ends a word typed with an input method (Telex on a Mac) opens nothing: Chrome marks it composing, Safari only gives it keyCode 229.
  await box.dispatchEvent('keydown', { key: 'Enter', isComposing: true });
  await box.evaluate((el) => {
    const e = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    Object.defineProperty(e, 'keyCode', { value: 229 });
    el.dispatchEvent(e);
  });
  await settle(page);
  await expect(palette).toBeVisible(); // an Enter it took would have closed it at once
  await expect(page).toHaveURL(/\/create$/);
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/library$/);
  await expect(palette).toBeHidden();

  // Opened again, the page it last opened leads, in the recent group.
  await page.keyboard.press('ControlOrMeta+k');
  await expect(palette.getByRole('group', { name: 'Gần đây' }).getByRole('option')).toHaveText(['Thư viện']);
  // A member is not offered the Admin pages; with nothing to list the box says so.
  await box.pressSequentially('quan tri');
  await expect(options).toHaveCount(0);
  await expect(box).toHaveAttribute('aria-expanded', 'false');
  await expect(palette.getByRole('status')).toContainText('Không tìm thấy “quan tri”');
});
