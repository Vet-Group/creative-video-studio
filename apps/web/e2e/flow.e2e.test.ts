import { expect, test } from '@playwright/test';
import { modelButton, pickPreset, presetOf, runInUi, select, selectText, selectValue, signIn, today } from './support.test';

test('a Member runs a mock job and works through the Library', async ({ page }) => {
  await signIn(page, 'member1');

  // Create: the pre-selected model shows its pass rate and estimate in the model panel, and the Run button carries the estimate; a Member sees no company budget.
  await expect(modelButton(page)).toContainText('Mock E2E');
  await modelButton(page).click();
  await expect(page.getByRole('option', { name: /Mock E2E/ })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByText('Tỉ lệ đạt: 80% (8/10)')).toBeVisible();
  await expect(page.getByText('Ước tính: $0.0000')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(modelButton(page)).toBeFocused();
  await expect(page.getByRole('button', { name: 'Tạo video' })).toContainText('$0.0000');
  await expect(page.getByText('Tháng này bạn đã dùng: $0.0000')).toBeVisible();
  await expect(page.getByText('Ngân sách tháng còn lại')).toHaveCount(0);

  await runInUi(page, { preset: 'slow-orbit', ratio: '1:1', duration: '8', store: 'E2E Shop' });

  // The tray shows the live state, then the toast announces the result.
  const tray = page.getByRole('complementary', { name: 'Job của tôi' });
  await expect(tray).toBeVisible();
  await expect(page.getByRole('region', { name: 'Thông báo' }).getByText('Clip đã xong')).toBeVisible({ timeout: 60_000 });
  await expect(tray.getByText('Hoàn tất')).toBeVisible();

  // Library: the card carries the MOCK badge and the real cost.
  await page.getByRole('link', { name: 'Thư viện' }).first().click();
  const card = page.getByRole('article').filter({ hasText: 'E2E Member 1' });
  await expect(card).toHaveCount(1);
  await expect(card.getByText('MOCK', { exact: true })).toBeVisible();
  await expect(card.getByText('Chi phí thật: $0.0000')).toBeVisible();
  // Re-assigning the store is for Admins: a Member has no such control.
  await expect(card.getByLabel('Cửa hàng')).toHaveCount(0);

  // Play.
  const video = card.locator('video');
  await video.evaluate(async (v: HTMLVideoElement) => {
    v.muted = true;
    await v.play();
  });
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime)).toBeGreaterThan(0);

  // Download: the server names the file YYYYMMDD-<creator-slug>-<id>.mp4.
  const [download] = await Promise.all([page.waitForEvent('download'), card.getByRole('button', { name: 'Tải xuống' }).click()]);
  expect(download.suggestedFilename()).toMatch(new RegExp(`^${today()}-e2e-member-1-[0-9a-f]{8}\\.mp4$`));

  // Filters.
  await page.getByLabel('Tỉ lệ').selectOption('9:16');
  await expect(page.getByText('Chưa có clip nào khớp bộ lọc.')).toBeVisible();
  await page.getByLabel('Tỉ lệ').selectOption('1:1');
  await expect(card).toHaveCount(1);
  await page.getByLabel('Người tạo').selectOption({ label: 'E2E Member 1' });
  await expect(card).toHaveCount(1);
  await page.getByLabel('Ngày').fill('2000-01-01');
  await expect(page.getByText('Chưa có clip nào khớp bộ lọc.')).toBeVisible();
  await page.getByLabel('Ngày').fill('');
  await expect(card).toHaveCount(1);

  // Reuse pre-fills the Create form, and it stays editable.
  await card.getByRole('link', { name: 'Dùng lại' }).click();
  await expect(page).toHaveURL(/\/create\?reuse=/);
  await expect(page.getByRole('img', { name: 'shirt.png' })).toBeVisible();
  await expect(presetOf(page)).toHaveAttribute('data-value', 'slow-orbit');
  await expect(select(page, 'Tỉ lệ khung hình')).toHaveAttribute('data-value', '1:1');
  await expect(select(page, 'Thời lượng')).toHaveAttribute('data-value', '8');
  await expect(modelButton(page)).toContainText('Mock E2E');
  await expect(select(page, 'Cửa hàng/Thương hiệu')).toHaveText('E2E Shop');
  await pickPreset(page, 'light-sweep');

  // A user picks a preset or writes a prompt: the prompt box opens only for "Tự viết mô tả", and Run waits for some text.
  await expect(page.getByLabel('Mô tả chuyển động')).toBeDisabled();
  const enhance = page.getByRole('button', { name: 'Cải thiện mô tả bằng AI' });
  await expect(enhance).toHaveCount(0); // a preset's tested prompt is not rewritten
  await pickPreset(page, '');
  // Enhance sits in the prompt box, on by default as on Fash, and flips with a click.
  await expect(enhance).toHaveAttribute('aria-pressed', 'true');
  await expect(enhance).toHaveText('Cải thiện: bật');
  await enhance.click();
  await expect(enhance).toHaveAttribute('aria-pressed', 'false');
  await expect(enhance).toHaveText('Cải thiện: tắt');
  await enhance.click();
  await expect(page.getByRole('button', { name: 'Tạo video' })).toBeDisabled();
  await page.getByLabel('Mô tả chuyển động').fill('Slow turn of the shirt.');
  await expect(page.getByRole('button', { name: 'Tạo video' })).toBeEnabled();

  // Pass, then Fail, which needs a fault.
  await page.getByRole('link', { name: 'Thư viện' }).first().click();
  await card.getByRole('button', { name: 'Đạt', exact: true }).click();
  await expect(card.getByText('Kết quả: Đạt')).toBeVisible();
  await card.getByRole('button', { name: 'Không đạt', exact: true }).click();
  await expect(card.getByRole('button', { name: 'Xác nhận không đạt' })).toBeDisabled();
  await card.getByLabel('Lỗi gặp phải').selectOption({ label: 'Sai màu' });
  await card.getByRole('button', { name: 'Xác nhận không đạt' }).click();
  await expect(card.getByText('Kết quả: Không đạt (Sai màu)')).toBeVisible();

  // Delete.
  await card.getByRole('button', { name: 'Xóa', exact: true }).click();
  await card.getByRole('button', { name: 'Xác nhận xóa' }).click();
  await expect(card).toHaveCount(0);
});
