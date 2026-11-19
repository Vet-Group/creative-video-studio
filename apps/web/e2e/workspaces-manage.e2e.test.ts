import { createPool } from '@cvs/db/client';
import { type Browser, type BrowserContext, expect, type Page, test } from '@playwright/test';
import { loginReady, newAddress, openSettings, signIn } from './support.test';
import { USERS } from './users';

// Workspaces, phase 3 (docs/WORKSPACES.md): an Admin creates a partner workspace with a new owner account, the owner signs in with the temporary password
// and adds a member, that member (also in the company workspace) switches between the two, a stale tab's write gets the reload dialog, and the partner
// workspace shows none of the company-only surfaces. CVS_E2E_SHOTS=<folder> saves the screenshots there (390 px dark, 1440 px light), else in the test output.
const url = new URL(process.env.DATABASE_URL!);
url.pathname = `/${process.env.CVS_E2E_DB ?? 'cvs_e2e'}`;
const db = createPool(url.toString(), 2);
const run = Math.random().toString(36).slice(2, 8);
const WS_NAME = `E2E Đối tác ${run}`;
const OWNER = { email: `owner-${run}@partner.e2e.test`, name: 'E2E Chủ đối tác', password: `owner-pass-${run}-1` };
const BOARD_ITEM = `E2E partner board ${run}`;

test.afterAll(async () => {
  try {
    await db.query('delete from feedback where title = $1', [BOARD_ITEM]);
  } finally {
    await db.end();
  }
});

async function shot(page: Page, name: string): Promise<void> {
  const dir = process.env.CVS_E2E_SHOTS;
  await page.screenshot({ path: dir ? `${dir}/${name}.png` : test.info().outputPath(`${name}.png`) });
}
/** The same signed-in browser at a phone's width in dark mode, for the 390 px screenshots. */
async function phone(browser: Browser, from: BrowserContext): Promise<Page> {
  const context = await browser.newContext({ storageState: await from.storageState(), viewport: { width: 390, height: 844 }, colorScheme: 'dark' });
  return context.newPage();
}
const switcher = (page: Page) => page.getByRole('combobox', { name: 'Không gian làm việc', exact: true });

test('an Admin creates a partner workspace, its owner adds a member, who switches workspaces; a stale tab is told to reload', async ({ browser }) => {
  test.setTimeout(360_000);
  // 1. The Admin creates the workspace with a new account as its owner and copies the temporary password shown once.
  const adminContext = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'light' });
  const admin = await adminContext.newPage();
  await signIn(admin, 'wsadm');
  await admin.goto('/admin/workspaces');
  await expect(admin.getByRole('heading', { name: 'Không gian làm việc', level: 1 })).toBeVisible();
  await admin.getByLabel('Tên không gian', { exact: true }).fill(WS_NAME);
  await admin.getByLabel('Email chủ sở hữu', { exact: true }).fill(OWNER.email);
  await admin.getByLabel('Tạo tài khoản mới cho chủ sở hữu').check();
  await admin.getByLabel('Tên chủ sở hữu', { exact: true }).fill(OWNER.name);
  await admin.getByRole('button', { name: 'Tạo không gian', exact: true }).click();
  const temporary = admin.locator('.temp-password code');
  await expect(temporary).toHaveText(/^\S{16}$/);
  const password = (await temporary.textContent())!;
  const row = admin.getByRole('row').filter({ hasText: WS_NAME });
  await expect(row).toContainText(OWNER.name);
  await expect(row.getByRole('cell', { name: 'Hoạt động' })).toBeVisible();
  await expect(admin.getByRole('row').filter({ hasText: 'VET Group' })).toContainText('Công ty');
  await shot(admin, 'admin-workspaces-1440-light');
  const adminPhone = await phone(browser, adminContext);
  await adminPhone.goto('/admin/workspaces');
  await expect(adminPhone.getByRole('row').filter({ hasText: WS_NAME })).toBeVisible();
  await shot(adminPhone, 'admin-workspaces-390-dark');
  await adminPhone.context().close();
  const workspaceId = (await db.query('select id from workspaces where name = $1', [WS_NAME])).rows[0].id as string;

  // 2. The owner signs in with it, must set their own password first, and lands in the partner workspace.
  const ownerContext = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'light' });
  const owner = await ownerContext.newPage();
  await newAddress(owner);
  await owner.addInitScript(() => localStorage.setItem('cvs.welcome.done', '1'));
  await owner.goto('/login');
  await loginReady(owner);
  await owner.getByLabel('Email').fill(OWNER.email);
  await owner.getByLabel('Mật khẩu').fill(password);
  await owner.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await expect(owner).toHaveURL(/\/account\/password$/);
  await owner.getByLabel('Mật khẩu hiện tại').fill(password);
  await owner.getByLabel('Mật khẩu mới', { exact: true }).fill(OWNER.password);
  await owner.getByLabel('Nhập lại mật khẩu mới').fill(OWNER.password);
  await owner.getByRole('button', { name: 'Lưu và tiếp tục' }).click();
  await expect(owner).toHaveURL(/\/create$/);

  // A partner workspace shows no company-only surface: no Admin area, no team, no spend, no proposals to the shared presets, no switcher for one workspace.
  const nav = owner.getByRole('navigation', { name: 'Điều hướng chính' });
  await expect(nav.getByRole('link', { name: 'Thành viên' })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Quản trị' })).toHaveCount(0);
  await expect(switcher(owner)).toHaveCount(0);
  expect(((await (await owner.request.get('/api/presets')).json()) as { canPropose: boolean }).canPropose).toBe(false);
  const limits = (await (await owner.request.get('/api/me/limits')).json()) as { monthToDate: unknown };
  expect(limits.monthToDate).toBeNull();
  const settings = await openSettings(owner);
  await expect(settings.getByText('Thành viên từ')).toBeVisible();
  await expect(settings.getByText('Nhóm', { exact: true })).toHaveCount(0);
  await settings.getByRole('button', { name: 'Hạn mức', exact: true }).click();
  await expect(settings.getByText('Clip video hôm nay')).toBeVisible();
  await expect(settings.getByText('Tổng chi phí tháng này của bạn')).toHaveCount(0);
  await owner.keyboard.press('Escape');

  // 3. On the Members page the owner adds an existing user by email; an account on the company's domain is refused.
  await nav.getByRole('link', { name: 'Thành viên' }).click();
  await expect(owner.getByRole('heading', { name: 'Thành viên', level: 1 })).toBeVisible();
  await owner.getByLabel('Email', { exact: true }).fill('x.staff@vetgroup.net');
  await owner.getByLabel('Tạo tài khoản mới', { exact: true }).check();
  await owner.getByLabel('Tên hiển thị').fill('Lookalike');
  await owner.getByRole('button', { name: 'Thêm thành viên' }).click();
  await expect(owner.locator('p.error[role="alert"]')).toHaveText('Không tạo được tài khoản với email này. Hãy dùng email khác, hoặc nhờ Admin.');
  await owner.getByLabel('Tạo tài khoản mới', { exact: true }).uncheck();
  await owner.getByLabel('Email', { exact: true }).fill(USERS.wsboth.email);
  await owner.getByRole('button', { name: 'Thêm thành viên' }).click();
  const members = owner.getByRole('table');
  await expect(members.getByRole('row').filter({ hasText: USERS.wsboth.email })).toBeVisible();
  await expect(members.getByRole('row').filter({ hasText: `${OWNER.name} (bạn)` }).getByLabel(`Vai trò của ${OWNER.email}`)).toHaveValue('owner');
  await shot(owner, 'members-1440-light');
  const ownerPhone = await phone(browser, ownerContext);
  await ownerPhone.goto('/members');
  await expect(ownerPhone.getByRole('table').getByRole('row').filter({ hasText: USERS.wsboth.email })).toBeVisible();
  await shot(ownerPhone, 'members-390-dark');
  await ownerPhone.context().close();
  await db.query(`insert into feedback (id, user_id, team_id, kind, title, body, image_asset_ids, workspace_id) select $1, id, team_id, 'feature', $2, 'b', '{}', $3 from users where email = $4`, [
    `wsm-${run}`,
    BOARD_ITEM,
    workspaceId,
    OWNER.email,
  ]);

  // 4. The member, also in the company workspace (their oldest), switches to the partner one and sees its board.
  const bothContext = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'light' });
  const both = await bothContext.newPage();
  await signIn(both, 'wsboth');
  await both.goto('/feedback');
  await expect(switcher(both)).toHaveText('VET Group');
  await expect(both.getByText(BOARD_ITEM)).toHaveCount(0);
  await switcher(both).click();
  const options = both.getByRole('listbox', { name: 'Không gian làm việc' }).getByRole('option');
  await expect(options).toHaveText(['VET Group', WS_NAME]);
  await expect(options.filter({ hasText: 'VET Group' })).toHaveAttribute('aria-selected', 'true');
  await shot(both, 'switcher-1440-light');
  await options.filter({ hasText: WS_NAME }).click();
  await expect(switcher(both)).toHaveText(WS_NAME);
  await expect(both.getByText(BOARD_ITEM)).toBeVisible();
  const bothPhone = await phone(browser, bothContext);
  await bothPhone.goto('/feedback');
  await bothPhone.getByRole('button', { name: 'Mở menu' }).click();
  await switcher(bothPhone).click();
  await expect(bothPhone.getByRole('listbox', { name: 'Không gian làm việc' }).getByRole('option')).toHaveCount(2);
  await shot(bothPhone, 'switcher-390-dark');
  await bothPhone.context().close();

  // 5. A second tab still shows the partner workspace while the first switches back: its next write is refused and it offers the reload.
  const stale = await bothContext.newPage();
  await stale.goto('/feedback');
  await expect(stale.getByText(BOARD_ITEM)).toBeVisible();
  await switcher(both).click();
  await both.getByRole('listbox', { name: 'Không gian làm việc' }).getByRole('option', { name: 'VET Group' }).click();
  await expect(switcher(both)).toHaveText('VET Group');
  await stale.getByRole('listitem').filter({ hasText: BOARD_ITEM }).getByRole('button', { name: /^Bình chọn/ }).click();
  const changed = stale.getByRole('dialog', { name: 'Đã đổi không gian làm việc' });
  await expect(changed).toBeVisible();
  await shot(stale, 'workspace-changed-1440-light');
  expect((await db.query('select count(*)::int as n from feedback_votes where feedback_id = $1', [`wsm-${run}`])).rows[0].n).toBe(0);
  await changed.getByRole('button', { name: 'Tải lại trang' }).click();
  await expect(switcher(stale)).toHaveText('VET Group');
  await expect(stale.getByText(BOARD_ITEM)).toHaveCount(0);

  await Promise.all([adminContext.close(), ownerContext.close(), bothContext.close()]);
});
