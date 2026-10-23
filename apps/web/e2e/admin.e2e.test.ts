import { expect, type Page, test } from '@playwright/test';
import { runInUi, signIn } from './support.test';

const nav = (page: Page, name: string) => page.getByRole('navigation', { name: 'Các trang quản trị' }).getByRole('link', { name, exact: true });

/** Clicks a download link, checks the suggested file name and returns the file's bytes (fetched with the page's session). */
async function download(page: Page, linkName: string, fileName: string | RegExp): Promise<Buffer> {
  const link = page.getByRole('link', { name: linkName });
  const [file] = await Promise.all([page.waitForEvent('download'), link.click()]);
  if (typeof fileName === 'string') expect(file.suggestedFilename()).toBe(fileName);
  else expect(file.suggestedFilename()).toMatch(fileName);
  const res = await page.request.get((await link.getAttribute('href'))!);
  expect(res.status()).toBe(200);
  return res.body();
}

const BOM = [0xef, 0xbb, 0xbf];

test('an Admin sets up a team, a store and a user, then reconciles the month costs', async ({ page }) => {
  await signIn(page, 'admin');
  await page.getByRole('link', { name: 'Quản trị', exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/users$/);

  // Teams: create one with a cost-centre code.
  await nav(page, 'Nhóm').click();
  await page.getByLabel('Tên nhóm', { exact: true }).fill('Team E2E');
  await page.getByLabel('Mã trung tâm chi phí (không bắt buộc)').fill('CC-E2E');
  await page.getByRole('button', { name: 'Tạo nhóm', exact: true }).click();
  await expect(page.getByLabel('Tên nhóm Team E2E')).toHaveValue('Team E2E');
  await expect(page.getByLabel('Mã trung tâm chi phí của Team E2E')).toHaveValue('CC-E2E');

  // Stores: create one; its code can still be edited because it has no cost yet.
  await nav(page, 'Cửa hàng').click();
  await page.getByLabel('Tên cửa hàng', { exact: true }).fill('Store E2E');
  await page.getByLabel('Mã cửa hàng (store_id của POD Studio)').fill('E2E-1');
  await page.getByRole('button', { name: 'Tạo cửa hàng', exact: true }).click();
  await expect(page.getByLabel('Mã cửa hàng của Store E2E')).toHaveValue('E2E-1');
  await expect(page.getByLabel('Mã cửa hàng của Store E2E')).toBeEnabled();

  // Users: add a user in the new team; the team picker offers visible teams.
  await nav(page, 'Người dùng').click();
  await page.getByLabel('Email', { exact: true }).fill('new.user@e2e.test');
  await page.getByLabel('Tên hiển thị').fill('New E2E User');
  await page.getByLabel('Nhóm của người dùng mới').selectOption({ label: 'Team E2E' });
  await page.getByRole('button', { name: 'Thêm người dùng', exact: true }).click();
  await expect(page.getByLabel('Nhóm của new.user@e2e.test').locator('option:checked')).toHaveText('Team E2E');
  await expect(page.getByRole('row', { name: /new\.user@e2e\.test/ })).toContainText('Hoạt động');

  // Costs: the VND rate, an invoice and its difference, a manual adjustment.
  await nav(page, 'Chi phí').click();
  const month = await page.getByLabel('Tháng', { exact: true }).inputValue();
  expect(month).toMatch(/^\d{4}-\d{2}$/);
  await page.getByLabel(/Tỉ giá VND\/USD/).fill('25000');
  await Promise.all([page.waitForResponse((r) => r.url().includes('/api/admin/rates/') && r.ok()), page.getByRole('button', { name: 'Lưu tỉ giá' }).click()]);
  await page.reload();
  await expect(page.getByLabel(/Tỉ giá VND\/USD/)).toHaveValue('25000.0000');

  await page.getByLabel('Tổng hóa đơn fal (USD)').fill('12.5');
  await page.getByRole('button', { name: 'Ghi hóa đơn fal' }).click();
  const invoice = page.getByRole('listitem').filter({ hasText: 'Tổng hóa đơn fal (USD)' });
  await expect(invoice.locator('.error')).toContainText('$12.5000');
  await expect(invoice.locator('.error')).toContainText('lệch quá 5%');
  await expect(invoice).toContainText('Tổng theo tháng UTC: $0.0000');

  await page.getByLabel('Số tiền điều chỉnh (USD, có thể âm)').fill('-1.5');
  await page.getByLabel('Ghi chú (bắt buộc)').fill('Test adjustment');
  await page.getByRole('button', { name: 'Thêm điều chỉnh' }).click();
  const shared = page.getByRole('region', { name: 'Chi phí chung' });
  await expect(shared).toContainText('Chênh lệch hóa đơn: $12.5000');
  await expect(shared).toContainText('Điều chỉnh tay: $-1.5000');
  // The total shows the 2-decimal value with the exact 4-decimal USD and the VND beside it, not in a tooltip.
  await expect(page.getByText('Tổng chi phí:')).toContainText('$11.00 ($11.0000 · 275.000');

  // Both CSVs: file name, a byte order mark and the fixed header columns.
  const detail = await download(page, 'Tải CSV chi tiết sổ cái', `cvs-ledger-detail-${month}.csv`);
  expect([...detail.subarray(0, 3)]).toEqual(BOM);
  const detailLines = detail.toString('utf8').split('\r\n');
  expect(detailLines[1]).toBe('month,date,job id,user,email,team,cost-centre code,store,store code,provider,model,entry kind,USD,VND,Tạm tính/Thật,Đạt/Không đạt');
  expect(detailLines.some((l) => l.includes('invoice_diff') && l.includes('12.5000'))).toBe(true);
  expect(detailLines.some((l) => l.includes('manual_adjustment') && l.includes('-1.5000'))).toBe(true);

  const summary = await download(page, 'Tải CSV tổng hợp theo nhóm và cửa hàng', `cvs-summary-${month}.csv`);
  expect([...summary.subarray(0, 3)]).toEqual(BOM);
  const summaryLines = summary.toString('utf8').split('\r\n');
  expect(summaryLines[1]).toBe(
    'month,team,cost-centre code,store,store code,USD,VND,failed clips USD (Fail verdict),failed jobs USD (failed or timed out),accepted clips,cost per accepted clip USD',
  );
  expect(summaryLines.some((l) => l.includes('Chi phí chung') && l.includes('11.0000') && l.includes('275000'))).toBe(true);

  // Report: the weekly CSV.
  await nav(page, 'Báo cáo tuần').click();
  await expect(page.getByRole('heading', { name: 'Báo cáo tuần' })).toBeVisible();
  const report = await download(page, 'Tải CSV báo cáo', /^cvs-report-\d{4}-\d{2}-\d{2}\.csv$/);
  expect([...report.subarray(0, 3)]).toEqual(BOM);

  // Audit: the team creation is listed with its new value, and the action filter narrows the list.
  await nav(page, 'Nhật ký').click();
  await page.getByLabel('Loại sự kiện').selectOption('team.create');
  await expect(page.getByRole('cell', { name: /"name":"Team E2E"/ })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'store.create', exact: true })).toHaveCount(0);

  // Settings and Presets load; a preset edit is saved.
  await nav(page, 'Cài đặt').click();
  await expect(page.getByRole('checkbox', { name: /Mock E2E/ })).toBeChecked();
  await nav(page, 'Mẫu chuyển động').click();
  const label = page.getByRole('textbox', { name: /^Tên mẫu / }).first();
  await expect(label).toBeVisible();
  const before = await label.inputValue();
  await label.fill(`${before} (sửa)`);
  await Promise.all([page.waitForResponse((r) => r.url().includes('/api/admin/presets/') && r.ok()), page.getByRole('button', { name: 'Lưu', exact: true }).first().click()]);
  await page.reload();
  await expect(page.getByRole('textbox', { name: /^Tên mẫu / }).first()).toHaveValue(`${before} (sửa)`);

  // The Create form follows the presets: the new label shows, a preset switched off disappears and comes back when switched on.
  await page.goto('/create');
  const picker = page.getByLabel('Mẫu chuyển động');
  await expect(picker.locator('option').first()).toHaveText(`${before} (sửa)`);
  await page.goto('/admin/presets');
  const second = page.getByRole('row').nth(2);
  const secondLabel = await second.getByRole('textbox').first().inputValue();
  const setSecond = async (on: boolean) => {
    await second.getByRole('checkbox', { name: 'Đang bật' }).setChecked(on);
    await Promise.all([page.waitForResponse((r) => r.url().includes('/api/admin/presets/') && r.ok()), second.getByRole('button', { name: 'Lưu', exact: true }).click()]);
  };
  await setSecond(false);
  await page.goto('/create');
  await expect(picker.locator('option', { hasText: `${before} (sửa)` })).toHaveCount(1);
  await expect(picker.locator('option', { hasText: secondLabel })).toHaveCount(0);
  await page.goto('/admin/presets');
  await setSecond(true);
  await page.goto('/create');
  await expect(picker.locator('option', { hasText: secondLabel })).toHaveCount(1);
});

test('an Admin re-assigns a clip store from the Library and Reuse follows it', async ({ page }) => {
  await signIn(page, 'admin');
  for (const [name, code] of [['Reuse Shop A', 'RA'], ['Reuse Shop B', 'RB']]) {
    expect((await page.request.post('/api/admin/stores', { data: { name, code } })).status()).toBe(201);
  }
  await page.goto('/create');
  await runInUi(page, { store: 'Reuse Shop A' });
  await expect(page.getByRole('region', { name: 'Thông báo' }).getByText('Clip đã xong')).toBeVisible({ timeout: 60_000 });

  await page.getByRole('link', { name: 'Thư viện' }).first().click();
  const card = page.getByRole('article').first();
  await expect(card.getByLabel('Cửa hàng').locator('option:checked')).toHaveText('Reuse Shop A');
  await card.getByLabel('Cửa hàng').selectOption({ label: 'Reuse Shop B' });
  await page.reload();
  await expect(page.getByRole('article').first().getByLabel('Cửa hàng').locator('option:checked')).toHaveText('Reuse Shop B');

  await page.getByRole('article').first().getByRole('link', { name: 'Dùng lại' }).click();
  await expect(page.getByLabel('Cửa hàng/Thương hiệu').locator('option:checked')).toHaveText('Reuse Shop B');

  // The Library is shared by every spec, which filter it by ratio and date: leave no clip of this spec behind.
  await page.getByRole('link', { name: 'Thư viện' }).first().click();
  const mine = page.getByRole('article', { name: (await page.getByRole('article').first().getAttribute('aria-label'))!, exact: true });
  await mine.getByRole('button', { name: 'Xóa', exact: true }).click();
  await mine.getByRole('button', { name: 'Xác nhận xóa' }).click();
  await expect(mine).toHaveCount(0);
});

test('a Member cannot see the Admin pages', async ({ page }) => {
  await signIn(page, 'member4');
  await expect(page.getByRole('link', { name: 'Quản trị', exact: true })).toHaveCount(0);
  await page.goto('/admin/users');
  await expect(page.getByRole('heading', { name: 'Không có quyền truy cập' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Người dùng' })).toHaveCount(0);
  await expect(page.getByLabel('Email', { exact: true })).toHaveCount(0);
  expect((await page.request.get('/api/admin/users')).status()).toBe(403);
});
