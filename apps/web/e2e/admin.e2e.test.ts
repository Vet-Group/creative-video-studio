import { expect, type Page, test } from '@playwright/test';
import { optionsOf, png, runInUi, runViaApi, select, signIn } from './support.test';

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
  await expect(page).toHaveURL(/\/admin\/overview$/);
  // The tab bar marks the page shown, and the Admin pages give the tray's width to their tables.
  await expect(nav(page, 'Tổng quan')).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('complementary', { name: 'Lượt tạo của tôi' })).toHaveCount(0);
  await expect(page.getByText('Ngân sách video', { exact: true })).toBeVisible();

  // Teams: create one with a cost-centre code.
  await nav(page, 'Nhóm').click();
  await expect(nav(page, 'Nhóm')).toHaveAttribute('aria-current', 'page');
  await expect(nav(page, 'Người dùng')).not.toHaveAttribute('aria-current');
  await page.getByLabel('Tên nhóm', { exact: true }).fill('Team E2E');
  await page.getByLabel('Mã trung tâm chi phí (không bắt buộc)').fill('CC-E2E');
  await page.getByRole('button', { name: 'Tạo nhóm', exact: true }).click();
  await expect(page.getByLabel('Tên nhóm Team E2E')).toHaveValue('Team E2E');
  await expect(page.getByLabel('Mã trung tâm chi phí của Team E2E')).toHaveValue('CC-E2E');
  // The report toggle saves at once, tags the team in the list and reads back after a reload; it is cleared again for the costs below.
  const reports = page.getByLabel('Không tính vào báo cáo: Team E2E');
  const teamRow = page.getByRole('row').filter({ has: page.getByLabel('Tên nhóm Team E2E') });
  await expect(reports).not.toBeChecked();
  await reports.click();
  await expect(reports).toBeChecked();
  await expect(teamRow.getByText('Không tính báo cáo', { exact: true })).toBeVisible();
  await page.reload();
  await expect(reports).toBeChecked();
  await reports.click();
  await expect(reports).not.toBeChecked();
  await expect(teamRow.getByText('Không tính báo cáo', { exact: true })).toHaveCount(0);

  // Stores: create one; its code stays editable.
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
  const newRow = page.getByRole('row', { name: /new\.user@e2e\.test/ });
  await expect(newRow).toContainText('Team E2E');
  await expect(newRow).toContainText('Hoạt động');
  // The search narrows the table by name or email, accents and case ignored, and shows every row again once cleared.
  const search = page.getByRole('searchbox', { name: 'Tìm theo tên hoặc email' });
  const rows = page.getByRole('row').filter({ has: page.getByRole('cell') });
  const all = await rows.count();
  await search.fill('NEW E2E');
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('Hoạt động');
  await expect(newRow).toBeVisible();
  await search.fill('admin@e2e');
  await expect(rows).toHaveCount(1);
  await expect(newRow).toHaveCount(0);
  await search.fill('khong-co-ai');
  await expect(rows).toHaveCount(0);
  await expect(page.getByText('Không có người dùng nào khớp “khong-co-ai”.')).toBeVisible();
  await search.fill('');
  await expect(rows).toHaveCount(all);
  // Editing happens in a dialog opened from the row: the team and role, then a temporary password whose field shows only after its button is pressed.
  await newRow.getByRole('button', { name: 'Sửa new.user@e2e.test' }).click();
  const editor = page.getByRole('dialog', { name: 'Sửa người dùng new.user@e2e.test' });
  await expect(editor.getByLabel('Nhóm của new.user@e2e.test').locator('option:checked')).toHaveText('Team E2E');
  await expect(editor.getByLabel('Mật khẩu tạm của new.user@e2e.test')).toHaveCount(0);
  await editor.getByRole('button', { name: 'Đặt mật khẩu tạm' }).click();
  await editor.getByLabel('Mật khẩu tạm của new.user@e2e.test').fill('Temp-pass-123');
  await Promise.all([page.waitForResponse((r) => r.url().includes('/api/admin/users/') && r.ok()), editor.getByRole('button', { name: 'Lưu mật khẩu' }).click()]);
  await expect(editor.getByLabel('Mật khẩu tạm của new.user@e2e.test')).toHaveCount(0);
  // A name change is saved from the dialog and shows in the row once it closes.
  await editor.getByLabel('Tên của new.user@e2e.test').fill('Renamed E2E User');
  await Promise.all([page.waitForResponse((r) => r.url().includes('/api/admin/users/') && r.ok()), editor.getByRole('button', { name: 'Lưu tên, email' }).click()]);
  await editor.getByRole('button', { name: 'Đóng' }).click();
  await expect(editor).toBeHidden();
  await expect(newRow).toContainText('Renamed E2E User');
  // A system account leaves the staff count and lists under its own section; unticking brings it back.
  const count = page.getByRole('status').filter({ hasText: /người dùng$/ });
  const staff = await count.textContent();
  await newRow.getByRole('button', { name: 'Sửa new.user@e2e.test' }).click();
  // The box follows the saved state, so it changes once the PATCH answers and the list reloads.
  const systemBox = editor.getByLabel('Tài khoản hệ thống: new.user@e2e.test');
  await Promise.all([page.waitForResponse((r) => r.url().includes('/api/admin/users/') && r.ok()), systemBox.click()]);
  await expect(systemBox).toBeChecked();
  await editor.getByRole('button', { name: 'Đóng' }).click();
  const systemSection = page.locator('details.system-users');
  await expect(systemSection.locator('summary')).toHaveText(/^Tài khoản hệ thống \(\d+\)$/);
  await expect(count).not.toHaveText(staff!);
  await systemSection.locator('summary').click();
  await expect(systemSection.getByRole('row', { name: /new\.user@e2e\.test/ })).toBeVisible();
  await systemSection.getByRole('button', { name: 'Sửa new.user@e2e.test' }).click();
  await Promise.all([page.waitForResponse((r) => r.url().includes('/api/admin/users/') && r.ok()), systemBox.click()]);
  await expect(systemBox).not.toBeChecked();
  await editor.getByRole('button', { name: 'Đóng' }).click();
  await expect(count).toHaveText(staff!);

  // Costs: the VND rate, an invoice and its difference and a manual adjustment on the reconciliation tab, then what the overview shows of them.
  await nav(page, 'Chi phí').click();
  const views = page.getByRole('navigation', { name: 'Các góc nhìn chi phí' });
  await expect(views.getByRole('link', { name: 'Tổng quan' })).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('input[type="month"]')).toHaveCount(0);
  // A month with no seeded rows (migration 0012 books the bake-off into 2026-10), so the totals do not depend on the run date. The reconciliation tab reads the month
  // of the address's period.
  const month = '2030-01';
  await page.goto('/admin/costs/reconcile?from=2030-01-01&to=2030-01-31');
  await expect(page.getByRole('heading', { level: 1, name: 'Đối soát Tháng 1/2030' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Tháng trước: Tháng 12/2029' })).toHaveAttribute('href', '/admin/costs/reconcile?from=2029-12-01&to=2029-12-31');
  const rate = page.getByLabel('Tỉ giá VND/USD Tháng 1/2030');
  await rate.fill('25000');
  await Promise.all([page.waitForResponse((r) => r.url().includes(`/api/admin/rates/${month}`) && r.ok()), page.getByRole('button', { name: 'Lưu tỉ giá' }).click()]);
  await page.reload();
  await expect(rate).toHaveValue('25000.0000');

  await page.getByLabel('Tổng hóa đơn fal (USD)').fill('12.5');
  await page.getByRole('button', { name: 'Ghi hóa đơn fal' }).click();
  const invoice = page.getByRole('listitem').filter({ hasText: 'Tổng hóa đơn fal (USD)' });
  await expect(invoice.locator('.error')).toContainText('$12.5000');
  await expect(invoice.locator('.error')).toContainText('lệch quá 5%');
  await expect(invoice).toContainText('Trong app ghi: $0.0000');
  // The UTC month total shows only when it differs from the ledger; a positive difference says where it went.
  await expect(invoice).not.toContainText('tháng UTC');
  await expect(invoice).toContainText('đã được tính vào Chi phí chung');

  await page.getByLabel('Số tiền điều chỉnh (USD, có thể âm)').fill('-1.5');
  await page.getByLabel('Ghi chú (bắt buộc)').fill('Test adjustment');
  await page.getByRole('button', { name: 'Thêm điều chỉnh' }).click();
  const shared = page.getByRole('region', { name: 'Chi phí chung' });
  await expect(shared).toContainText('Chênh lệch hóa đơn: $12.5000');
  await expect(shared).toContainText('Điều chỉnh tay: -$1.5000');
  await expect(page.locator('p.cost-note', { hasText: 'Sổ cái Tháng 1/2030, mọi tài khoản' })).toContainText('Chi phí chung $11.00');

  // The summary CSV is the whole month with every row: file name, a byte order mark, the fixed header columns and the shared line.
  const summary = await download(page, 'Tải CSV tổng hợp theo nhóm và cửa hàng', `cvs-summary-${month}.csv`);
  expect([...summary.subarray(0, 3)]).toEqual(BOM);
  const summaryLines = summary.toString('utf8').split('\r\n');
  expect(summaryLines[1]).toBe(
    'month,team,cost-centre code,store,store code,USD,VND,failed clips USD (Fail verdict),failed jobs USD (failed or timed out),accepted clips,cost per accepted clip USD',
  );
  expect(summaryLines.some((l) => l.includes('Chi phí chung') && l.includes('11.0000') && l.includes('275000'))).toBe(true);

  // The overview keeps the period. By default it counts only real users' job and LLM rows, so the shared rows are named as hidden; the switch shows every
  // row, and the total card has the 2-decimal value with the exact 4-decimal USD and the VND under it, not in a tooltip.
  await views.getByRole('link', { name: 'Tổng quan' }).click();
  await expect(page).toHaveURL(/\/admin\/costs\?from=2030-01-01&to=2030-01-31$/);
  await expect(page.locator('.period-label')).toHaveText('Tháng 1/2030');
  const total = page.getByRole('group', { name: 'Tổng chi phí' });
  await expect(total.locator('.kpi-value')).toHaveText('$0.00');
  const hidden = page.locator('p.cost-note');
  await expect(hidden).toContainText('Đang ẩn $11.00: tài khoản hệ thống, tài khoản thử và team không tính báo cáo $0.00; chi phí chung $11.00');
  await expect(hidden.getByRole('link', { name: 'Đối soát' })).toBeVisible();
  const realOnly = page.getByLabel('Chỉ người dùng thật');
  await expect(realOnly).toBeChecked();
  await realOnly.uncheck();
  await expect(page).toHaveURL(/real=0/);
  await expect(total.locator('.kpi-value')).toHaveText('$11.00');
  await expect(total).toContainText('$11.0000 · 275.000');
  await expect(hidden).toHaveCount(0);

  // The detail CSV follows the page: with every row shown it holds the shared rows.
  const detail = await download(page, 'Tải CSV chi tiết sổ cái', `cvs-ledger-detail-${month}.csv`);
  expect([...detail.subarray(0, 3)]).toEqual(BOM);
  const detailLines = detail.toString('utf8').split('\r\n');
  expect(detailLines[1]).toBe('month,date,job id,user,email,team,cost-centre code,store,store code,provider,model,entry kind,USD,VND,Tạm tính/Thật,Đạt/Không đạt');
  expect(detailLines.some((l) => l.includes('invoice_diff') && l.includes('12.5000'))).toBe(true);
  expect(detailLines.some((l) => l.includes('manual_adjustment') && l.includes('-1.5000'))).toBe(true);
  // The model view lists job and LLM rows only: the shared rows stay on the reconciliation tab.
  const card = page.getByRole('region', { name: 'Chi tiết chi phí' });
  await card.getByRole('group', { name: 'Xem theo' }).getByRole('button', { name: 'Mô hình', exact: true }).click();
  await expect(page).toHaveURL(/by=model/);
  await expect(card).toContainText('Không có chi phí nào trong Tháng 1/2030.');

  // Report: the weekly CSV.
  await nav(page, 'Báo cáo tuần').click();
  await expect(page.getByRole('heading', { name: 'Báo cáo tuần' })).toBeVisible();
  const report = await download(page, 'Tải CSV báo cáo', /^cvs-report-\d{4}-\d{2}-\d{2}\.csv$/);
  expect([...report.subarray(0, 3)]).toEqual(BOM);

  // Audit: the team creation is listed with its new value, and the action filter narrows the list.
  await nav(page, 'Nhật ký').click();
  await page.getByLabel('Loại sự kiện').selectOption('team.create');
  await expect(page.getByRole('cell', { name: /name: Team E2E/ })).toBeVisible();
  await expect(page.getByRole('cell', { name: /"name"/ })).toHaveCount(0); // read as fields, not raw JSON
  await expect(page.getByRole('cell', { name: 'store.create', exact: true })).toHaveCount(0);

  // Settings load.
  await nav(page, 'Cài đặt').click();
  await expect(page.getByRole('checkbox', { name: 'Mock E2E (mock)', exact: true })).toBeChecked();
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
  // An Admin re-assigns the store in the detail view.
  const open = () => page.getByRole('article').first().getByRole('button', { name: 'Xem chi tiết' }).click();
  const store = page.getByRole('dialog').getByLabel('Cửa hàng');
  await open();
  await expect(store.locator('option:checked')).toHaveText('Reuse Shop A');
  const saved = page.waitForResponse((r) => r.url().endsWith('/store') && r.request().method() === 'PUT');
  await store.selectOption({ label: 'Reuse Shop B' });
  expect((await saved).ok()).toBe(true);
  await page.reload();
  await open();
  await expect(store.locator('option:checked')).toHaveText('Reuse Shop B');

  await page.getByRole('dialog').getByRole('link', { name: 'Dùng lại' }).click();
  await expect(select(page, 'Cửa hàng/Thương hiệu')).toHaveText('Reuse Shop B');

  // The Library is shared by every spec, which filter it by ratio and date: leave no clip of this spec behind.
  await page.getByRole('link', { name: 'Thư viện' }).first().click();
  const mine = page.locator(`article[data-clip-id="${await page.getByRole('article').first().getAttribute('data-clip-id')}"]`);
  await mine.getByRole('button', { name: 'Xoá', exact: true }).click();
  await expect(mine).toHaveCount(0);
});

test('an Admin changes the code of a store that has costs after a confirm, and the audit reads the change', async ({ page }) => {
  await signIn(page, 'admin');
  const code = `CC${Date.now() % 100000}`;
  const name = `Coded store ${code}`;
  const created = await page.request.post('/api/admin/stores', { data: { name, code } });
  expect(created.status()).toBe(201);
  const storeId = ((await created.json()) as { id: string }).id;
  // A job booked on the store gives it cost entries.
  const up = await page.request.post('/api/assets', { multipart: { file: { name: 'shirt.png', mimeType: 'image/png', buffer: png() } } });
  const { assets } = (await up.json()) as { assets: { id: string }[] };
  const job = await page.request.post('/api/jobs', { data: { assetIds: [assets[0]!.id], modelId: 'mock-e2e', presetId: 'gentle-push-in', ratio: '9:16', durationSec: 5, storeId } });
  expect(job.status()).toBe(201);
  const jobId = ((await job.json()) as { id: string }).id;

  await page.goto('/admin/stores');
  await expect(nav(page, 'Cửa hàng')).toHaveAttribute('aria-current', 'page');
  const field = () => page.getByLabel(`Mã cửa hàng của ${name}`);
  const save = () => page.getByRole('row').filter({ has: field() }).getByRole('button', { name: 'Lưu', exact: true });
  await expect(field()).toBeEnabled();
  // Dismissed, nothing is sent; accepted, the new code is saved.
  const confirm = page.getByRole('dialog', { name: 'Đổi mã cửa hàng?' });
  await field().fill(`${code}-B`);
  await save().click();
  await confirm.getByRole('button', { name: 'Huỷ', exact: true }).click();
  await expect(confirm).toBeHidden();
  await page.reload();
  await expect(field()).toHaveValue(code);
  await field().fill(`${code}-B`);
  await save().click();
  await expect(confirm).toContainText('Cửa hàng này đã có chi phí');
  await Promise.all([page.waitForResponse((r) => r.url().includes(`/api/admin/stores/${storeId}`) && r.ok()), confirm.getByRole('button', { name: 'Đổi mã', exact: true }).click()]);
  await page.reload();
  await expect(field()).toHaveValue(`${code}-B`);

  // The audit shows the change as old → new, and the event name in a code badge.
  await nav(page, 'Nhật ký').click();
  await page.getByLabel('Loại sự kiện').selectOption('store.update');
  const entry = page.getByRole('row').filter({ hasText: `code: ${code} → ${code}-B` });
  await expect(entry).toContainText(`store:${storeId}`);
  await expect(entry).toContainText(`name: ${name}`);
  await expect(entry.locator('code.event')).toHaveText('Sửa cửa hàng');
  await expect(entry.locator('code.event')).toHaveAttribute('title', 'store.update');

  // The Library is shared by every spec: leave no clip of this one behind.
  await expect.poll(async () => ((await (await page.request.get(`/api/jobs/${jobId}`)).json()) as { status: string }).status, { timeout: 60_000 }).toBe('succeeded');
  expect((await page.request.delete(`/api/jobs/${jobId}`)).ok()).toBe(true);
});

test('the audit reads a switched-off model as enabled: true → false', async ({ page }) => {
  await signIn(page, 'admin');
  const set = (enabled: boolean) => page.request.put('/api/admin/settings', { data: { models: [{ id: 'mock-e2e-square', enabled }] } });
  expect((await set(true)).ok()).toBe(true);
  expect((await set(false)).ok()).toBe(true);
  await page.goto('/admin/audit');
  await page.getByLabel('Loại sự kiện').selectOption('model.set_enabled');
  const latest = page.getByRole('row').filter({ hasText: 'mock-e2e-square' }).first();
  await expect(latest).toContainText('enabled: true → false');
  await expect(latest).not.toContainText('{');
});

test('a saved Settings change clears the save bar and says it was saved', async ({ page }) => {
  await signIn(page, 'admin');
  await page.goto('/admin/settings');
  const budget = page.getByLabel('Ngân sách tháng cho video (USD)');
  const before = await budget.inputValue();
  expect(before).toMatch(/^\d+(\.\d{1,3})?$/); // shown as typed, not the stored "250.0000"
  const bar = page.getByRole('region', { name: 'Lưu cài đặt' });
  await expect(bar).toHaveCount(0);
  try {
    // The server answers 250.0000 for 250: the same amount, so nothing is left unsaved.
    await budget.fill('250');
    await expect(bar).toContainText('Có thay đổi chưa lưu.');
    await Promise.all([page.waitForResponse((r) => r.url().endsWith('/api/admin/settings') && r.request().method() === 'PUT' && r.ok()), bar.getByRole('button', { name: 'Lưu cài đặt' }).click()]);
    await expect(page.getByRole('status').filter({ hasText: 'Đã lưu cài đặt.' })).toBeVisible();
    await expect(bar).toHaveCount(0);
    await expect(budget).toHaveValue('250');
  } finally {
    expect((await page.request.put('/api/admin/settings', { data: { monthlyCapUsd: before } })).ok()).toBe(true);
  }
});

test('an Admin reads audit details at 390px without horizontal scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, 'admin');
  const { presets } = (await (await page.request.get('/api/presets')).json()) as { presets: { id: string; label: string }[] };
  const { id, label: original } = presets[0]!;
  for (const label of [`${original} mobile`, original]) expect((await page.request.patch(`/api/presets/${id}`, { data: { label } })).ok()).toBe(true);
  await page.goto('/admin/audit');
  await page.getByLabel('Loại sự kiện').selectOption('preset.update');
  const changes = page.locator('.changes').first();
  await expect(changes).toContainText('mobile');
  await changes.scrollIntoViewIfNeeded();
  await expect(changes).toBeInViewport({ ratio: 1 });
  expect(await page.locator('.table-wrap').evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  // A phone record's actions cell spans the card, so its "Thao tác" label reads on one line.
  await page.goto('/admin/stores');
  const actions = page.locator('.mobile-records td[data-label="Thao tác"]').first();
  await actions.scrollIntoViewIfNeeded();
  expect(await actions.evaluate((td) => parseFloat(getComputedStyle(td, '::before').height))).toBeLessThan(24);
});

test('an unknown address shows a Vietnamese not-found page with a way back', async ({ page }) => {
  await signIn(page, 'member4');
  const res = await page.goto('/khong-co-trang-nay');
  expect(res?.status()).toBe(404);
  await expect(page.getByRole('heading', { name: 'Không tìm thấy trang' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Về trang chính' })).toHaveAttribute('href', '/');
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

test("an Admin opens a member's line on Costs and sees the job behind it", async ({ browser, page }) => {
  // The member runs one mock job this month.
  const member = await browser.newPage();
  await signIn(member, 'costa');
  const jobId = await runViaApi(member);
  await member.close();

  await signIn(page, 'admin');
  await page.goto('/admin/costs');
  const users = page.getByRole('region', { name: 'Chi tiết chi phí' });
  const line = users.getByRole('button', { name: 'E2E Costs A' });
  await expect(line).toHaveAttribute('aria-expanded', 'false');
  await line.click();
  await expect(line).toHaveAttribute('aria-expanded', 'true');
  const jobs = users.locator('tr.drill');
  await expect(jobs.getByRole('row', { name: new RegExp(jobId.slice(0, 8)) })).toContainText('Tạo video');
  await expect(jobs).toContainText('Mock E2E');
  await line.click();
  await expect(jobs).toHaveCount(0);
});

test('on a phone each job of a Costs line is a two-line block with the time and the USD on top, all inside the table', async ({ browser, page }) => {
  const member = await browser.newPage();
  await signIn(member, 'costb');
  const jobId = await runViaApi(member);
  await member.close();

  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, 'admin');
  await page.goto('/admin/costs');
  const users = page.getByRole('region', { name: 'Chi tiết chi phí' });
  await users.getByRole('button', { name: 'E2E Costs B' }).click();
  const row = users.locator('tr.drill table.jobs tbody tr').filter({ hasText: jobId.slice(0, 8) });
  await expect(row).toContainText('Mock E2E');
  const box = (await users.locator('.table-wrap').boundingBox())!;
  const box$ = async (cell: ReturnType<typeof row.locator>) => (await cell.boundingBox())!;
  const [when, feature, model, usd] = [await box$(row.locator('td').first()), await box$(row.locator('td').nth(1)), await box$(row.locator('td.model')), await box$(row.locator('td.num'))];
  // Every cell is inside the table's box: nothing needs a sideways swipe.
  for (const cell of [when, feature, model, usd]) {
    expect(cell.x).toBeGreaterThanOrEqual(box.x);
    expect(cell.x + cell.width).toBeLessThanOrEqual(box.x + box.width + 1);
  }
  // The time and the USD share the top line; the feature and model sit on the line under it.
  expect(Math.abs(usd.y - when.y)).toBeLessThan(8);
  expect(usd.x).toBeGreaterThan(when.x);
  expect(feature.y).toBeGreaterThanOrEqual(when.y + when.height - 1);
  expect(Math.abs(model.y - feature.y)).toBeLessThan(8);
  expect(await page.evaluate(() => document.scrollingElement!.scrollWidth <= innerWidth)).toBe(true);
  // The "·" is drawn 9 px left of the model: inside the row next to the feature, past the row's clipped left edge once a long name wraps.
  const dot = () =>
    row.evaluate((r) => {
      const model = r.querySelector('td.model')!.getBoundingClientRect();
      return { shown: model.left - 9 >= r.getBoundingClientRect().left, wrapped: model.top > r.children[1]!.getBoundingClientRect().top + 4, clips: getComputedStyle(r).overflowX === 'clip' };
    });
  expect(await dot()).toEqual({ shown: true, wrapped: false, clips: true });
  await row.locator('td.model').evaluate((td) => { td.textContent = 'Nano Banana Pro (Character Swap) Nano Banana Pro'; });
  expect(await dot()).toEqual({ shown: false, wrapped: true, clips: true });
  // The blocks still read as a table: five column headers, and five cells in the job's row.
  const table = users.getByRole('table', { name: 'Job của dòng này' });
  await expect(table.getByRole('columnheader')).toHaveText(['Lúc gửi', 'Mục', 'Mô hình', 'Trạng thái', 'USD']);
  await expect(table.getByRole('row').filter({ hasText: jobId.slice(0, 8) }).getByRole('cell')).toHaveCount(5);
});

test('on a 320 px phone the Costs header buttons wrap their label instead of widening the page, and the view switch has 44 px targets', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await signIn(page, 'admin');
  for (const [path, name] of [['/admin/costs/reconcile', /Tải CSV tổng hợp/], ['/admin/costs', /Tải CSV chi tiết/]] as const) {
    await page.goto(path);
    const csv = page.getByRole('link', { name });
    await expect(csv).toBeVisible();
    const box = (await csv.boundingBox())!;
    expect(box.x + box.width).toBeLessThanOrEqual(320);
    expect(box.height).toBeGreaterThanOrEqual(36);
    expect(await page.evaluate(() => document.scrollingElement!.scrollWidth <= innerWidth)).toBe(true);
  }
  const views = page.getByRole('group', { name: 'Xem theo' }).getByRole('button');
  await expect(views).toHaveCount(5);
  for (const b of await views.all()) expect((await b.boundingBox())!.height).toBeGreaterThanOrEqual(44);
});

test('an Admin narrows Costs to the last 7 days with a quick choice, then to one day from the chart, and the address keeps the view', async ({ browser, page }) => {
  const member = await browser.newPage();
  await signIn(member, 'costa');
  await runViaApi(member);
  await member.close();

  await signIn(page, 'admin');
  await page.goto('/admin/costs');
  const picker = page.getByRole('group', { name: 'Khoảng thời gian' });
  await picker.getByRole('button', { name: '7 ngày', exact: true }).click();
  await expect(picker.getByRole('button', { name: '7 ngày', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page).toHaveURL(/\/admin\/costs\?from=\d{4}-\d{2}-\d{2}&to=\d{4}-\d{2}-\d{2}$/);
  const today = new URL(page.url()).searchParams.get('to')!;
  const date = `${today.slice(8)}/${today.slice(5, 7)}/${today.slice(0, 4)}`;
  // One bar per day and one tab stop among them; the last bar is today, read out with its date and amount.
  const chart = page.getByRole('group', { name: /^Các ngày/ });
  const days = chart.getByRole('button');
  await expect(days).toHaveCount(7);
  await expect(chart.locator('button[tabindex="0"]')).toHaveCount(1);
  await expect(days.last()).toHaveAttribute('aria-label', new RegExp(`^${date}: \\$\\d`));
  await days.last().click();
  await expect(page).toHaveURL(new RegExp(`from=${today}&to=${today}$`));
  await expect(page.locator('.period-label')).toHaveText(date);
  await expect(days).toHaveCount(1);
  const card = page.getByRole('region', { name: 'Chi tiết chi phí' });
  await expect(card.getByRole('button', { name: 'E2E Costs A' })).toBeVisible();
  // The detail view is kept in the address too, and a column header sorts.
  await card.getByRole('group', { name: 'Xem theo' }).getByRole('button', { name: 'Mô hình', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`from=${today}&to=${today}&by=model$`));
  const usd = card.getByRole('columnheader', { name: 'USD', exact: true });
  await expect(usd).toHaveAttribute('aria-sort', 'descending');
  await usd.getByRole('button').click();
  await expect(usd).toHaveAttribute('aria-sort', 'ascending');
  await page.reload();
  await expect(card.getByRole('group', { name: 'Xem theo' }).getByRole('button', { name: 'Mô hình', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.period-label')).toHaveText(date);
});

test('an Admin pauses, resumes, closes, reopens and deletes an unused store; the picker marks a paused one; a store with a clip cannot be deleted', async ({ page }) => {
  await signIn(page, 'admin');
  const code = `LS${Date.now() % 100000}`;
  const name = `Lifecycle store ${code}`;
  expect((await page.request.post('/api/admin/stores', { data: { name, code } })).status()).toBe(201);
  await page.goto('/admin/stores');
  const row = page.getByRole('row').filter({ has: page.getByLabel(`Mã cửa hàng của ${name}`) });
  const done = () => page.waitForResponse((r) => r.url().includes('/api/admin/stores?') && r.ok());

  await Promise.all([done(), row.getByRole('button', { name: 'Tạm dừng', exact: true }).click()]);
  await expect(row.locator('.tag')).toHaveText('Tạm dừng');
  const picker = async () => ((await (await page.request.get('/api/stores')).json()) as { stores: { name: string }[] }).stores.map((s) => s.name);
  expect(await picker()).toContain(`${name} (tạm dừng)`);
  await Promise.all([done(), row.getByRole('button', { name: 'Hoạt động lại', exact: true }).click()]);
  await expect(row.locator('.tag')).toHaveCount(0);

  await row.getByRole('button', { name: 'Đóng', exact: true }).click();
  await Promise.all([done(), page.getByRole('dialog', { name: `Đóng cửa hàng ${name}?` }).getByRole('button', { name: 'Đóng cửa hàng', exact: true }).click()]);
  await expect(row.locator('.tag')).toHaveText('Đã đóng');
  expect((await picker()).filter((n) => n.startsWith(name))).toEqual([]);
  await Promise.all([done(), row.getByRole('button', { name: 'Mở lại', exact: true }).click()]);
  await expect(row.locator('.tag')).toHaveCount(0);

  await row.getByRole('button', { name: 'Xoá', exact: true }).click();
  await Promise.all([done(), page.getByRole('dialog', { name: `Xoá cửa hàng ${name}?` }).getByRole('button', { name: 'Xoá', exact: true }).click()]);
  await expect(row).toHaveCount(0);

  // A store a clip points at keeps its history: Xoá is disabled and says to close it.
  const usedCode = `LU${Date.now() % 100000}`;
  const used = await page.request.post('/api/admin/stores', { data: { name: `Used store ${usedCode}`, code: usedCode } });
  const storeId = ((await used.json()) as { id: string }).id;
  const up = await page.request.post('/api/assets', { multipart: { file: { name: 'shirt.png', mimeType: 'image/png', buffer: png() } } });
  const { assets } = (await up.json()) as { assets: { id: string }[] };
  expect((await page.request.post('/api/jobs', { data: { assetIds: [assets[0]!.id], modelId: 'mock-e2e', presetId: 'gentle-push-in', ratio: '9:16', durationSec: 5, storeId } })).status()).toBe(201);
  await page.reload();
  const usedDelete = page.getByRole('row').filter({ has: page.getByLabel(`Mã cửa hàng của Used store ${usedCode}`) }).getByRole('button', { name: 'Xoá', exact: true });
  await expect(usedDelete).toBeDisabled();
  await expect(usedDelete).toHaveAttribute('title', /hãy Đóng thay vì xoá/);
  expect((await page.request.delete(`/api/admin/stores/${storeId}`)).status()).toBe(409);
});
