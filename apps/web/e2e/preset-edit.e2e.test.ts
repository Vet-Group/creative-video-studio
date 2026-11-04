import { expect, type Page, test } from '@playwright/test';
import { presetOf, signIn } from './support.test';

// Presets are managed in Create's picker: a template editor edits them in place, a member proposes, and one editor's approval applies it.
// Each test edits a preset no other spec reads, and puts its label back at the end.

/** Opens Create's preset picker once the page has hydrated (the banner button does nothing before). */
async function openPicker(page: Page) {
  await page.goto('/create');
  await expect(page.getByLabel('Ảnh sản phẩm')).toBeEnabled();
  await page.getByRole('button', { name: 'Chọn mẫu khác' }).click();
  return page.getByRole('list', { name: 'Danh sách mẫu' });
}

async function restoreLabel(page: Page, id: string, label: string) {
  expect((await page.request.patch(`/api/presets/${id}`, { data: { label } })).ok()).toBe(true);
}

test('a template editor edits a preset label in the picker, and the picker shows and picks it under the new label', async ({ page }) => {
  await signIn(page, 'tpled');
  const grid = await openPicker(page);
  await grid.getByRole('button', { name: 'Sửa mẫu Lia vòng sang phải', exact: true }).click();
  const form = page.getByRole('dialog', { name: 'Sửa mẫu' });
  await expect(form.getByLabel('Tên mẫu')).toHaveValue('Lia vòng sang phải');
  await expect(form.getByLabel('Mô tả chuyển động (tiếng Anh)')).not.toHaveValue(''); // an editor reads the prompt it edits
  await form.getByLabel('Tên mẫu').fill('Lia vòng phải (sửa)');
  await Promise.all([page.waitForResponse((r) => r.url().endsWith('/api/presets/arc-right') && r.request().method() === 'PATCH' && r.ok()), form.getByRole('button', { name: 'Lưu', exact: true }).click()]);
  await expect(form).toBeHidden();
  await expect(page.getByRole('region', { name: 'Thông báo' }).getByText('Đã lưu mẫu.')).toBeVisible();
  await grid.getByRole('button', { name: 'Lia vòng phải (sửa)', exact: true }).click();
  await expect(presetOf(page)).toHaveAttribute('data-value', 'arc-right');
  await expect(presetOf(page)).toHaveText('Lia vòng phải (sửa)');
  await restoreLabel(page, 'arc-right', 'Lia vòng sang phải');
});

test('a member proposes a new label, an editor approves it from the pending list, and the picker shows it', async ({ page }) => {
  await signIn(page, 'tplprop');
  let grid = await openPicker(page);
  await expect(grid.getByRole('button', { name: /^Sửa mẫu / })).toHaveCount(0); // a member edits nothing directly
  await grid.getByRole('button', { name: 'Đề xuất sửa mẫu Lia vòng sang trái', exact: true }).click();
  const form = page.getByRole('dialog', { name: 'Đề xuất sửa mẫu' });
  await expect(form.getByLabel('Mô tả chuyển động mới (tiếng Anh)')).toHaveValue(''); // the prompt stays on the server
  await form.getByLabel('Tên mẫu').fill('Lia vòng trái (đề xuất)');
  await form.getByLabel('Ghi chú (không bắt buộc)').fill('Tên ngắn hơn');
  await form.getByRole('button', { name: 'Gửi đề xuất' }).click();
  await expect(page.getByRole('region', { name: 'Thông báo' }).getByText('Đã gửi đề xuất, chờ người có quyền duyệt.')).toBeVisible();
  await expect(grid.getByRole('button', { name: 'Lia vòng sang trái', exact: true })).toBeVisible(); // nothing changes before the approval

  await page.context().clearCookies(); // signed out, so /login shows its form
  await signIn(page, 'tpled');
  grid = await openPicker(page);
  await page.getByRole('button', { name: /^Chờ duyệt \([1-9]\d*\)$/ }).click();
  const proposal = page.getByRole('dialog', { name: 'Đề xuất chờ duyệt' }).getByRole('listitem', { name: 'Đề xuất của E2E Template Proposer' }).filter({ hasText: 'Lia vòng trái (đề xuất)' });
  await expect(proposal.locator('del')).toHaveText('Lia vòng sang trái'); // the label now beside the proposed one
  await expect(proposal.getByText('Ghi chú: Tên ngắn hơn')).toBeVisible();
  await proposal.getByRole('button', { name: 'Duyệt' }).click();
  await expect(page.getByRole('region', { name: 'Thông báo' }).getByText('Đã duyệt đề xuất.')).toBeVisible();
  await expect(proposal).toHaveCount(0);
  await page.keyboard.press('Escape'); // closes the pending list, back to the picker
  await expect(grid.getByRole('button', { name: 'Lia vòng trái (đề xuất)', exact: true })).toBeVisible();
  await restoreLabel(page, 'arc-left', 'Lia vòng sang trái');
});
