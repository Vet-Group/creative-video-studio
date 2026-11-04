import { expect, test } from '@playwright/test';
import { pickPreset, presetOf, signIn } from './support.test';

// Create asks for its presets again whenever its effect re-runs (twice on mount in development); an answer that lands after the member picked a preset must not undo the pick.
test('a late answer for the preset list does not undo the preset the member picked', async ({ page }) => {
  await signIn(page, 'preseta');
  let asked = 0;
  let answered = 0;
  await page.route('**/api/presets', async (route) => {
    const res = await route.fetch();
    if (++asked === 1) await new Promise((resolve) => setTimeout(resolve, 3_000));
    await route.fulfill({ response: res });
    answered++;
  });
  await page.goto('/create');
  await expect(page.getByLabel('Ảnh sản phẩm')).toBeEnabled(); // hydrated, so the banner button opens the picker
  await pickPreset(page, 'gentle-push-in');
  await expect.poll(() => answered === asked && asked > 0, { timeout: 10_000 }).toBe(true);
  await expect(presetOf(page)).toHaveAttribute('data-value', 'gentle-push-in');
});
