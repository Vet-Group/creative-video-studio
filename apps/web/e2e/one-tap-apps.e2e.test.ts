import AxeBuilder from '@axe-core/playwright';
import { createPool } from '@cvs/db/client';
import { expect, test } from '@playwright/test';
import { png, signIn } from './support.test';
import { USERS } from './users';

// A custom app (an Admin's one-tap app made from a live clip, docs/WORKSPACES.md §2), from the member's side: its card on Apps, its run page and the job a Run makes.
// The workspace ws_onetap is made here (as workspaces-isolation does): tapmem is only in it, tapadm is in it too and picks it with the cookie. The app is seeded through
// POST /api/admin/apps, from a free-prompt mock run of tapadm's.
const url = new URL(process.env.DATABASE_URL!);
url.pathname = `/${process.env.CVS_E2E_DB ?? 'cvs_e2e'}`;
const db = createPool(url.toString(), 2);
const userId = async (key: keyof typeof USERS) => ((await db.query('select id from users where email = $1', [USERS[key].email])).rows[0] as { id: string }).id;

const PROMPT = 'Rotate the product slowly on a white table';
const NAME = 'Video xoay sản phẩm';

test.beforeAll(async () => {
  const [adm, mem] = [await userId('tapadm'), await userId('tapmem')];
  await db.query(`insert into workspaces (id, name) values ('ws_onetap', 'E2E One Tap Co') on conflict do nothing`);
  await db.query(`delete from workspace_members where user_id = $1 and workspace_id = 'ws_vet'`, [mem]); // tapmem is in ws_onetap only
  await db.query(`insert into workspace_members (workspace_id, user_id, role) values ('ws_onetap', $1, 'owner'), ('ws_onetap', $2, 'member') on conflict do nothing`, [adm, mem]);
});

test.afterAll(async () => {
  await db.end();
});

test('a member runs a published custom app: its card, its page with no prompt, and a mock job with the app\'s own prompt and model', async ({ browser }) => {
  // The Admin makes the app: a finished free-prompt run in ws_onetap becomes an app with one photo slot, published.
  const adminContext = await browser.newContext();
  let appId: string;
  try {
    const admin = await adminContext.newPage();
    await signIn(admin, 'tapadm');
    await adminContext.addCookies([{ name: 'cvs_ws', value: 'ws_onetap', url: admin.url() }]);
    const up = await admin.request.post('/api/assets', { multipart: { file: { name: 'source.png', mimeType: 'image/png', buffer: png() } } });
    expect(up.status()).toBe(201);
    const asset = ((await up.json()) as { assets: { id: string }[] }).assets[0]!.id;
    const run = await admin.request.post('/api/jobs', { data: { assetIds: [asset], modelId: 'mock-e2e', prompt: PROMPT, ratio: '9:16', durationSec: 5 } });
    expect(run.status()).toBe(201);
    const jobId = ((await run.json()) as { id: string }).id;
    await expect.poll(async () => ((await (await admin.request.get(`/api/jobs/${jobId}`)).json()) as { status: string }).status, { timeout: 60_000 }).toBe('succeeded');
    const made = await admin.request.post('/api/admin/apps', {
      data: { jobId, name: NAME, description: 'Xoay sản phẩm của bạn trên nền trắng.', category: 'video', prompt: PROMPT, inputs: [{ slot: { label: 'Ảnh sản phẩm', hint: 'Ảnh trên nền trắng' } }], publish: true },
    });
    expect(made.status()).toBe(201);
    appId = ((await made.json()) as { id: string }).id;
  } finally {
    await adminContext.close();
  }

  const member = await (await browser.newContext()).newPage(); // axe needs a page of a context made by browser.newContext()
  await signIn(member, 'tapmem');
  await member.getByRole('navigation', { name: 'Điều hướng chính' }).getByRole('link', { name: 'Ứng dụng' }).click();
  await expect(member).toHaveURL(/\/apps$/);
  const card = member.getByRole('list', { name: 'Danh sách ứng dụng' }).getByRole('link').filter({ hasText: NAME });
  await expect(card).toHaveAttribute('href', `/apps/${appId}`);
  await expect(card.getByText('Mới')).toBeVisible();
  await card.click();
  await expect(member).toHaveURL(new RegExp(`/apps/${appId}$`));

  // The page shows the app's settings and no prompt, and Run waits for the photo.
  const reason = member.locator('.form-message').getByRole('status');
  await expect(member.getByText(/^Cài sẵn: Mock E2E · 9:16 · 5 giây$/)).toBeVisible();
  await expect(reason).toHaveText('Tải lên ảnh: Ảnh sản phẩm.');
  expect(await member.content()).not.toContain(PROMPT);
  expect(await (await member.request.get(`/apps/${appId}`)).text()).not.toContain(PROMPT); // the server HTML with its inline flight data, not only the DOM
  await expect(member.getByRole('tab', { name: 'Lịch sử' })).toHaveCount(0);

  await member.locator('input[type=file][aria-label="Ảnh sản phẩm"]').setInputFiles({ name: 'mine.png', mimeType: 'image/png', buffer: png() });
  const runButton = member.getByRole('button', { name: /^Chạy/ });
  await expect(runButton).toBeEnabled();
  await expect(runButton).toContainText('$0.00');
  expect((await new AxeBuilder({ page: member }).exclude('nextjs-portal').analyze()).violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id)).toEqual([]);
  await runButton.click();
  await expect(member.getByRole('status').filter({ hasText: 'Đã gửi lượt tạo. Theo dõi trong khay Lượt tạo của tôi.' })).toBeVisible();
  // /apps/<id> has no History tab of its own, so the runs are in the "Lượt tạo" drawer.
  await member.getByRole('button', { name: /^Lượt tạo/ }).click();
  await expect(member.getByRole('dialog', { name: 'Lượt tạo của tôi' }).getByText('Hoàn tất')).toHaveCount(1, { timeout: 60_000 });
  await member.keyboard.press('Escape');

  // The job is the app's: its prompt and model, the member's own photo.
  const jobs = ((await (await member.request.get('/api/jobs?mine')).json()) as { jobs: { id: string }[] }).jobs;
  expect(jobs).toHaveLength(1);
  const job = (await (await member.request.get(`/api/jobs/${jobs[0]!.id}`)).json()) as { prompt: string; modelId: string; status: string };
  expect(job).toMatchObject({ prompt: PROMPT, modelId: 'mock-e2e', status: 'succeeded' });

  // Pressing Run again with the same photo asks first.
  await runButton.click();
  await expect(member.getByRole('alertdialog').or(member.getByRole('dialog')).getByText('Chạy lại đúng các cài đặt vừa gửi?')).toBeVisible();

  // Another workspace's user finds neither the card nor the page: tapadm without the cookie is in ws_vet.
  const other = await browser.newPage();
  await signIn(other, 'tapadm');
  expect((await other.goto(`/apps/${appId}`))!.status()).toBe(404);
  await other.goto('/apps');
  await expect(other.getByRole('list', { name: 'Danh sách ứng dụng' }).getByRole('link').filter({ hasText: NAME })).toHaveCount(0);
});

// The Admin's side: Library > Biến thành ứng dụng > the editor > Admin > Ứng dụng, with the source clip held by its app and a member shut out of the Admin pages.
test('an Admin makes an app of a Library clip, publishes and takes it down, and the clip is held until the app is deleted', async ({ browser }) => {
  const PROMPT2 = 'Spin the bottle on a marble table';
  const NAME2 = 'Xoay chai thử Admin';
  const context = await browser.newContext();
  const admin = await context.newPage();
  await signIn(admin, 'tapadm');
  await context.addCookies([{ name: 'cvs_ws', value: 'ws_onetap', url: admin.url() }]);
  const up = await admin.request.post('/api/assets', { multipart: { file: { name: 'bottle.png', mimeType: 'image/png', buffer: png() } } });
  const asset = ((await up.json()) as { assets: { id: string }[] }).assets[0]!.id;
  const run = await admin.request.post('/api/jobs', { data: { assetIds: [asset], modelId: 'mock-e2e', prompt: PROMPT2, ratio: '9:16', durationSec: 5 } });
  expect(run.status()).toBe(201);
  const jobId = ((await run.json()) as { id: string }).id;
  await expect.poll(async () => ((await (await admin.request.get(`/api/jobs/${jobId}`)).json()) as { status: string }).status, { timeout: 60_000 }).toBe('succeeded');

  // The newest clip of the Library offers the link (an Admin, on the Library page), and the link opens the editor for that clip.
  await admin.goto('/library');
  await admin.getByRole('button', { name: 'Xem chi tiết' }).first().click();
  const link = admin.getByRole('dialog').getByRole('link', { name: 'Biến thành ứng dụng' });
  await expect(link).toHaveAttribute('href', `/admin/apps/new?job=${jobId}`);
  await link.click();
  await expect(admin.getByRole('heading', { name: 'Biến thành ứng dụng', level: 1 })).toBeVisible();
  await expect(admin.getByText('Mock E2E · 9:16 · 5 giây')).toBeVisible();
  await expect(admin.getByText('Mô hình, tỉ lệ và thời lượng giữ như lượt gốc.')).toBeVisible();
  // The input choices are small radios with their label on one line, not text-field sized.
  const upload = await admin.getByRole('radio', { name: 'Người dùng tải lên' }).boundingBox();
  const label = await admin.locator('label').filter({ hasText: 'Người dùng tải lên' }).boundingBox();
  expect([upload!.width <= 20, label!.height <= 30]).toEqual([true, true]);

  // Lưu waits for a name; the prompt starts as the clip's own.
  const save = admin.getByRole('button', { name: 'Lưu' });
  await expect(save).toBeDisabled();
  await expect(admin.getByRole('textbox', { name: /^Mô tả gửi cho mô hình/ })).toHaveValue(PROMPT2);
  await admin.getByRole('textbox', { name: 'Tên ô' }).fill('Ảnh sản phẩm');
  await admin.getByRole('textbox', { name: 'Tên ứng dụng' }).fill(NAME2);
  await admin.getByRole('combobox', { name: 'Danh mục' }).selectOption('video');
  await admin.getByRole('checkbox', { name: 'Đăng lên trang Ứng dụng ngay' }).check();
  await expect(save).toBeEnabled();
  // Huỷ on a changed form asks first; the dialog's own Huỷ keeps the edit.
  await admin.getByRole('link', { name: 'Huỷ' }).click();
  await admin.getByRole('dialog', { name: 'Bỏ các thay đổi chưa lưu?' }).getByRole('button', { name: 'Huỷ' }).click();
  await expect(admin.getByRole('textbox', { name: 'Tên ứng dụng' })).toHaveValue(NAME2);
  expect((await new AxeBuilder({ page: admin }).exclude('nextjs-portal').analyze()).violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id)).toEqual([]);
  await save.click();
  await expect(admin).toHaveURL(/\/admin\/apps$/);
  const row = admin.getByRole('row').filter({ hasText: NAME2 });
  await expect(row.getByText('Đã đăng')).toBeVisible();
  const appId = ((await row.getByRole('link', { name: /^Mở/ }).getAttribute('href')) ?? '').replace('/apps/', '');
  // An unchanged editor leaves on Huỷ without asking.
  await admin.goto(`/admin/apps/${appId}`);
  await admin.getByRole('link', { name: 'Huỷ' }).click();
  await expect(admin).toHaveURL(/\/admin\/apps$/);

  // The clip is held: the Library card shows the 409 text that names the app.
  await admin.goto('/library');
  await admin.getByRole('button', { name: 'Xoá', exact: true }).first().click();
  await expect(admin.getByText(`Clip này đang là nguồn của ứng dụng «${NAME2}». Hãy xoá ứng dụng trước.`)).toBeVisible();

  // A member gets none of the Admin pages' data.
  const member = await (await browser.newContext()).newPage();
  await signIn(member, 'tapmem');
  for (const path of ['/admin/apps', `/admin/apps/${appId}`, `/admin/apps/new?job=${jobId}`]) {
    const html = await (await member.request.get(path)).text();
    expect(html).not.toContain(PROMPT2);
    expect(html).not.toContain(NAME2);
  }
  await member.goto(`/admin/apps/${appId}`);
  await expect(member.getByRole('heading', { name: 'Sửa ứng dụng' })).toHaveCount(0);

  // Gỡ khỏi trang Ứng dụng: the card and the page go for the member.
  await admin.goto('/admin/apps');
  await row.getByRole('button', { name: /^Gỡ khỏi trang Ứng dụng/ }).click();
  await expect(row.getByText('Nháp')).toBeVisible();
  // Keyboard focus goes to the page title, not the body, and the status line says what happened.
  await expect(admin.getByRole('heading', { name: 'Ứng dụng tự tạo', level: 1 })).toBeFocused();
  await expect(admin.getByRole('status').filter({ hasText: `Đã gỡ «${NAME2}» khỏi trang Ứng dụng.` })).toBeVisible();
  await member.goto('/apps');
  await expect(member.getByRole('list', { name: 'Danh sách ứng dụng' }).getByRole('link').filter({ hasText: NAME2 })).toHaveCount(0);
  expect((await member.goto(`/apps/${appId}`))!.status()).toBe(404);

  // Xoá ứng dụng: the clip deletes again.
  await row.getByRole('button', { name: /^Xoá ứng dụng/ }).click();
  await admin.getByRole('dialog', { name: `Xoá ứng dụng «${NAME2}»?` }).getByRole('button', { name: 'Xoá ứng dụng' }).click();
  await expect(row).toHaveCount(0);
  await expect(admin.getByRole('status').filter({ hasText: `Đã xoá ứng dụng «${NAME2}».` })).toBeVisible();
  await expect(admin.getByRole('heading', { name: 'Ứng dụng tự tạo', level: 1 })).toBeFocused();
  expect((await admin.request.delete(`/api/jobs/${jobId}`)).status()).toBe(200);
});

test('Admin > Ứng dụng shows all 11 tabs of the Admin bar at 1024 and 1440 px without hidden overflow', async ({ page }, testInfo) => {
  await signIn(page, 'tapadm');
  for (const width of [1024, 1440]) {
    await page.setViewportSize({ width, height: 768 });
    await page.goto('/admin/apps');
    const nav = page.getByRole('navigation', { name: 'Các trang quản trị' });
    await expect(nav.getByRole('link')).toHaveCount(11);
    await expect(nav.getByRole('link', { name: 'Ứng dụng' })).toHaveAttribute('aria-current', 'page');
    const size = await nav.evaluate((el) => ({ scroll: el.scrollWidth, client: el.clientWidth }));
    expect(size.scroll, `${width} px`).toBeLessThanOrEqual(size.client);
    await nav.screenshot({ path: testInfo.outputPath(`admin-nav-${width}.png`) });
  }
});
