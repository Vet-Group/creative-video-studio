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
