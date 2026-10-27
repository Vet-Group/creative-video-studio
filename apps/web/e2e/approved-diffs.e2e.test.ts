import { expect, test } from '@playwright/test';
import { modelButton, signIn } from './support.test';

// The owner-approved differences from the reference site (docs/parity/fash-survey-2026-10-28.md and the earlier briefs). Parity work must not
// remove them: each test names one and fails if it goes.

test('Marketing Studio keeps its model select with the recommended badge, the audio switch and the cost in USD on Run', async ({ page }) => {
  await signIn(page, 'mkta');
  // The badge shows on whichever model the server recommends; the test makes the first one recommended.
  await page.route('**/api/models?feature=marketing*', async (route) => {
    const res = await route.fetch();
    const body = (await res.json()) as { models: { recommended: boolean }[] };
    await route.fulfill({ response: res, json: { ...body, models: body.models.map((m, i) => ({ ...m, recommended: i === 0 })) } });
  });
  await page.goto('/marketing-studio');
  await expect(modelButton(page)).toBeVisible();
  await modelButton(page).click();
  await expect(page.getByRole('listbox', { name: 'Mô hình' }).getByText('Đề xuất').first()).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('switch', { name: 'Tạo âm thanh' })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Tạo video/ }).locator('.run-cost')).toHaveText(/^· \$\d+\.\d+$/); // USD, not credits
});

test('Marketing Studio at 390 px opens on the form, with no "best on desktop" interstitial', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, 'mkta');
  await page.goto('/marketing-studio');
  await expect(page.getByRole('tab', { name: 'Tạo' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByText(/desktop/i)).toHaveCount(0);
});

test('the swap apps keep their own optional Prompt field', async ({ page }) => {
  await signIn(page, 'mkta');
  await page.goto('/apps/character-swap');
  await expect(page.getByRole('textbox', { name: 'Prompt (tuỳ chọn)' })).toBeVisible();
});

test('an Admin keeps the Quản trị entry in the sidebar, and a member does not see it', async ({ page }) => {
  await signIn(page, 'admin');
  await expect(page.getByRole('navigation', { name: 'Điều hướng chính' }).getByRole('link', { name: 'Quản trị', exact: true })).toBeVisible();
  await page.context().clearCookies();
  await signIn(page, 'mkta');
  await expect(page.getByRole('navigation', { name: 'Điều hướng chính' }).getByRole('link', { name: 'Quản trị', exact: true })).toHaveCount(0);
});
