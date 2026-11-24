import AxeBuilder from '@axe-core/playwright';
import { createPool } from '@cvs/db/client';
import { type Browser, type BrowserContext, expect, type Page, test } from '@playwright/test';
import { loginReady, newAddress, openSettings, signIn } from './support.test';
import { USERS } from './users';

// Workspaces, phase 3 (docs/WORKSPACES.md): an Admin creates a partner workspace with a new owner account and adds a company member to it, the owner
// signs in with the temporary password and creates a member's account (company staff and addresses stay out of reach, each refusal in the Admin's
// audit log), the company member switches
// between the two (the company's carries a fixed badge), a stale tab's write gets the reload dialog, and the partner shows no company-only surface. CVS_E2E_SHOTS=<folder> saves the screenshots there (390 px dark, 1440 px light), else in the test output.
const url = new URL(process.env.DATABASE_URL!);
url.pathname = `/${process.env.CVS_E2E_DB ?? 'cvs_e2e'}`;
const db = createPool(url.toString(), 2);
const run = Math.random().toString(36).slice(2, 8);
const WS_NAME = `E2E Đối tác ${run}`;
const OWNER = { email: `owner-${run}@partner.e2e.test`, name: 'E2E Chủ đối tác', password: `owner-pass-${run}-1` };
const BOARD_ITEM = `E2E partner board ${run}`;
const SELLER = `seller-${run}@partner.e2e.test`;

test.afterAll(async () => {
  try {
    await db.query('delete from feedback where title = $1', [BOARD_ITEM]);
  } finally {
    await db.end();
  }
});

async function shot(page: Page, name: string, fullPage = false): Promise<void> {
  const dir = process.env.CVS_E2E_SHOTS;
  await page.screenshot({ path: dir ? `${dir}/${name}.png` : test.info().outputPath(`${name}.png`), fullPage });
}
/** The same signed-in browser at a phone's width in dark mode, for the 390 px screenshots. */
async function phone(browser: Browser, from: BrowserContext): Promise<Page> {
  const context = await browser.newContext({ storageState: await from.storageState(), viewport: { width: 390, height: 844 }, colorScheme: 'dark' });
  return context.newPage();
}
/** Serious or critical axe violations on the page, as a11y.e2e counts them. */
const blocking = async (page: Page) =>
  (await new AxeBuilder({ page }).exclude('nextjs-portal').analyze()).violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(' | ')}`);
const switcher = (page: Page) => page.getByRole('combobox', { name: 'Không gian làm việc', exact: true });
/** The closed switcher as drawn: its height, the name's lines, whether the name is cut (an ellipsis or a clamp), and whether the page or the phone's drawer scrolls sideways. */
const drawn = (page: Page) =>
  switcher(page).evaluate((button) => {
    const name = button.querySelector('.select-value')!;
    const sidebar = document.getElementById('sidebar')!;
    return {
      height: Math.round(button.getBoundingClientRect().height),
      lines: Math.round(name.getBoundingClientRect().height / parseFloat(getComputedStyle(name).lineHeight)),
      cut: name.scrollWidth > name.clientWidth || name.scrollHeight > name.clientHeight,
      // The desktop sidebar does not scroll (overflow visible): the guide pill may run past it by design.
      sideways: document.documentElement.scrollWidth > innerWidth || (getComputedStyle(sidebar).overflowX !== 'visible' && sidebar.scrollWidth > sidebar.clientWidth),
    };
  });
/** Opens the phone's drawer and waits until it has slid in. */
async function openDrawer(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Mở menu' }).click();
  await expect.poll(async () => (await page.locator('#sidebar').boundingBox())?.x).toBe(0);
}

test('an Admin creates a partner workspace and adds a company member, its owner adds a member, the company member switches; a stale tab is told to reload', async ({ browser }) => {
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
  await shot(adminPhone, 'admin-workspaces-390-dark', true);
  await adminPhone.context().close();
  // Only an Admin brings a company member into a partner workspace (an owner cannot even see that the account exists).
  await row.getByRole('button', { name: `Quản lý ${WS_NAME}` }).click();
  const editor = admin.getByRole('dialog', { name: `Quản lý ${WS_NAME}` });
  await editor.getByLabel('Email', { exact: true }).fill(USERS.wsboth.email);
  await editor.getByRole('button', { name: 'Thêm thành viên' }).click();
  await expect(editor.getByRole('row').filter({ hasText: USERS.wsboth.email })).toBeVisible();
  await admin.keyboard.press('Escape');
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

  // 3. On the Members page the owner creates a seller's account; an address on the company's domain is refused, and an Admin looks like no account.
  await nav.getByRole('link', { name: 'Thành viên' }).click();
  await expect(owner.getByRole('heading', { name: 'Thành viên', level: 1 })).toBeVisible();
  await owner.getByLabel('Email', { exact: true }).fill('x.staff@vetgroup.net');
  await owner.getByLabel('Tạo tài khoản mới', { exact: true }).check();
  await owner.getByLabel('Tên hiển thị').fill('Lookalike');
  await owner.getByRole('button', { name: 'Thêm thành viên' }).click();
  const problem = owner.locator('p.error[role="alert"]');
  await expect(problem).toHaveText('Không dùng được email này trong không gian của bạn. Hãy dùng email khác, hoặc nhờ Admin.');
  await owner.getByLabel('Tạo tài khoản mới', { exact: true }).uncheck();
  await owner.getByLabel('Email', { exact: true }).fill(USERS.wsadm.email);
  await owner.getByRole('button', { name: 'Thêm thành viên' }).click();
  await expect(problem).toHaveText('Chưa có tài khoản nào với email này. Đánh dấu “Tạo tài khoản mới” để tạo.');
  await owner.getByLabel('Email', { exact: true }).fill(SELLER);
  await owner.getByLabel('Tạo tài khoản mới', { exact: true }).check();
  await owner.getByLabel('Tên hiển thị').fill('E2E Người bán');
  await owner.getByRole('button', { name: 'Thêm thành viên' }).click();
  await expect(owner.locator('.temp-password code')).toHaveText(/^\S{16}$/);
  await owner.getByRole('button', { name: 'Đã lưu' }).click();
  const members = owner.getByRole('table');
  await expect(members.getByRole('row').filter({ hasText: SELLER })).toBeVisible();
  await expect(members.getByRole('row').filter({ hasText: USERS.wsboth.email })).toBeVisible();
  await expect(members.getByRole('row').filter({ hasText: `${OWNER.name} (bạn)` }).getByLabel(`Vai trò của ${OWNER.email}`)).toHaveValue('owner');
  await shot(owner, 'members-1440-light');
  const ownerPhone = await phone(browser, ownerContext);
  await ownerPhone.goto('/members');
  await expect(ownerPhone.getByRole('table').getByRole('row').filter({ hasText: USERS.wsboth.email })).toBeVisible();
  await shot(ownerPhone, 'members-390-dark', true);
  expect.soft(await blocking(ownerPhone), '/members dark').toEqual([]);
  expect.soft(await blocking(owner), '/members light').toEqual([]);
  await ownerPhone.context().close();
  // The owner is not throttled, but each refusal is logged: the Admin reads both in the audit log, the reason in words.
  await admin.goto('/admin/audit');
  await admin.getByLabel('Loại sự kiện').selectOption('workspace.member_refused');
  const refusals = admin.getByRole('row').filter({ hasText: `workspace:${workspaceId}` });
  await expect(refusals).toHaveCount(2);
  await expect(refusals.filter({ hasText: 'x.staff@vetgroup.net' })).toContainText('Bị từ chối thêm thành viên');
  await expect(refusals.filter({ hasText: 'x.staff@vetgroup.net' })).toContainText('reason: email thuộc tên miền công ty');
  await expect(refusals.filter({ hasText: USERS.wsadm.email })).toContainText('reason: chưa có tài khoản hoặc là nhân viên');
  await shot(admin, 'audit-refused-1440-light');
  const auditPhone = await phone(browser, adminContext);
  await auditPhone.goto('/admin/audit');
  await auditPhone.getByLabel('Loại sự kiện').selectOption('workspace.member_refused');
  await expect(auditPhone.getByRole('row').filter({ hasText: 'x.staff@vetgroup.net' })).toBeVisible();
  await shot(auditPhone, 'audit-refused-390-dark', true);
  await auditPhone.context().close();
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
  await expect(switcher(both)).toHaveText('VET Group Công ty');
  // The closed switcher shows the whole name beside the badge (it read "VET Gr…" at 1440 px), which a pointer also gets as the name's title.
  await shot(both, 'switcher-closed-1440-light');
  expect(await drawn(both)).toMatchObject({ lines: 1, cut: false, sideways: false });
  await expect(switcher(both).locator('.select-value')).toHaveAttribute('title', 'VET Group');
  // The icon rail has no room for it: it hides there and comes back with the full sidebar.
  const rail = both.getByRole('button', { name: 'Thu gọn thanh bên' });
  await rail.click();
  await expect(switcher(both)).toBeHidden();
  await rail.click();
  await expect(switcher(both)).toBeVisible();
  await expect(both.getByText(BOARD_ITEM)).toHaveCount(0);
  // On a page with a form the switch asks first, as its reload drops the photos and choices there; cancel stays put.
  await both.goto('/create');
  await switcher(both).click();
  await both.getByRole('listbox', { name: 'Không gian làm việc' }).getByRole('option', { name: WS_NAME }).click();
  const ask = both.getByRole('dialog', { name: 'Chuyển không gian làm việc?' });
  await expect(ask).toBeVisible();
  await ask.getByRole('button', { name: 'Huỷ' }).click();
  await expect(ask).toBeHidden();
  await expect(switcher(both)).toHaveText('VET Group Công ty');
  await both.goto('/feedback');
  await switcher(both).click();
  const options = both.getByRole('listbox', { name: 'Không gian làm việc' }).getByRole('option');
  await expect(options).toHaveText(['VET Group Công ty', WS_NAME]); // the badge is the company's alone
  await expect(options.filter({ hasText: WS_NAME }).locator('.tag')).toHaveCount(0);
  await expect(options.filter({ hasText: 'VET Group' })).toHaveAttribute('aria-selected', 'true');
  await shot(both, 'switcher-1440-light');
  await options.filter({ hasText: WS_NAME }).click();
  await expect(switcher(both)).toHaveText(WS_NAME);
  await expect(both.getByText(BOARD_ITEM)).toBeVisible();
  const bothPhone = await phone(browser, bothContext);
  await bothPhone.goto('/feedback');
  await openDrawer(bothPhone);
  await expect(switcher(bothPhone)).toHaveText(WS_NAME);
  await shot(bothPhone, 'switcher-closed-390-dark');
  expect(await drawn(bothPhone)).toMatchObject({ cut: false, sideways: false });
  expect((await drawn(bothPhone)).height).toBeGreaterThanOrEqual(44); // a full touch target
  await switcher(bothPhone).click();
  await expect(bothPhone.getByRole('listbox', { name: 'Không gian làm việc' }).getByRole('option')).toHaveCount(2);
  await shot(bothPhone, 'switcher-390-dark');
  expect.soft(await blocking(bothPhone), 'switcher dark').toEqual([]);
  // A long name takes two lines, then an ellipsis at 1440 px; the title and the open list keep all of it, and a phone still fits it without scrolling sideways.
  const longName = `E2E Đối tác có một cái tên rất dài để thử xuống dòng ${run}`;
  await db.query('update workspaces set name = $1 where id = $2', [longName, workspaceId]);
  try {
    await both.reload();
    await expect(switcher(both)).toHaveText(longName);
    await shot(both, 'switcher-closed-long-1440-light');
    expect(await drawn(both)).toMatchObject({ lines: 2, cut: true, sideways: false });
    await expect(switcher(both).locator('.select-value')).toHaveAttribute('title', longName);
    await switcher(both).click();
    await expect(both.getByRole('listbox', { name: 'Không gian làm việc' }).getByRole('option', { name: longName })).toBeVisible();
    await both.keyboard.press('Escape');
    await bothPhone.reload();
    await openDrawer(bothPhone);
    await shot(bothPhone, 'switcher-closed-long-390-dark');
    const phoneLong = await drawn(bothPhone);
    expect(phoneLong).toMatchObject({ sideways: false });
    expect(phoneLong.lines).toBeLessThanOrEqual(2);
    expect(phoneLong.height).toBeGreaterThanOrEqual(44);
  } finally {
    await db.query('update workspaces set name = $1 where id = $2', [WS_NAME, workspaceId]);
  }
  await bothPhone.context().close();
  await both.reload();

  // 5. A second tab still shows the partner workspace while the first switches back: its next write is refused and it offers the reload.
  const stale = await bothContext.newPage();
  await stale.goto('/feedback');
  await expect(stale.getByText(BOARD_ITEM)).toBeVisible();
  await switcher(both).click();
  await both.getByRole('listbox', { name: 'Không gian làm việc' }).getByRole('option', { name: 'VET Group' }).click();
  await expect(switcher(both)).toHaveText('VET Group Công ty');
  await stale.getByRole('listitem').filter({ hasText: BOARD_ITEM }).getByRole('button', { name: /bình chọn$/ }).click();
  const changed = stale.getByRole('dialog', { name: 'Đã đổi không gian làm việc' });
  await expect(changed).toBeVisible();
  await shot(stale, 'workspace-changed-1440-light');
  expect((await db.query('select count(*)::int as n from feedback_votes where feedback_id = $1', [`wsm-${run}`])).rows[0].n).toBe(0);
  await changed.getByRole('button', { name: 'Tải lại trang' }).click();
  await expect(switcher(stale)).toHaveText('VET Group Công ty');
  await expect(stale.getByText(BOARD_ITEM)).toHaveCount(0);

  await Promise.all([adminContext.close(), ownerContext.close(), bothContext.close()]);
});
