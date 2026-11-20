import { expect, test } from '@playwright/test';
import { signIn } from './support.test';

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

  // The sidebar's row opens it too; case and accents do not count, and Enter opens the active option.
  await page.getByRole('navigation', { name: 'Điều hướng chính' }).getByRole('button', { name: 'Tìm nhanh' }).click();
  await expect(box).toBeFocused();
  await box.pressSequentially('thu vien');
  await expect(options.first()).toHaveText('Thư viện');
  await expect(options.first()).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/library$/);
  await expect(palette).toBeHidden();

  // Opened again, the page it last opened leads, in the recent group.
  await page.keyboard.press('ControlOrMeta+k');
  await expect(palette.getByRole('group', { name: 'Gần đây' }).getByRole('option')).toHaveText(['Thư viện']);
  await box.pressSequentially('khong co trang nay');
  await expect(options).toHaveCount(0);
  await expect(palette.getByRole('status')).toContainText('Không tìm thấy');
});
