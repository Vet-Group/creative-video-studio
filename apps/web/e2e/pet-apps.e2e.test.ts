import { expect, type Page, test } from '@playwright/test';
import { mockupPrompt, nameSwapPrompt, petPortraitPrompt } from '../src/lib/apps';
import { modelButton, png, select, selectText, signIn } from './support.test';

// The pet apps: one picture in, one job per item picked (a style, a product, a name or a name and breed), each with the prompt its item makes,
// all of one Run sharing one batch id, which History's select-the-batch button and Reuse read back.
const runButton = (page: Page) => page.getByRole('button', { name: /^Chạy/ });
const reason = (page: Page) => page.locator('.form-message').getByRole('status');
const cost = (page: Page) => page.getByRole('status').filter({ hasText: 'ảnh ×' });
const preview = (page: Page) => page.getByRole('group', { name: 'Bản cuối gửi cho mô hình' });
const pickModel = async (page: Page, name: RegExp) => {
  await modelButton(page).click();
  await page.getByRole('option', { name }).click();
  await expect(modelButton(page)).toContainText(name);
};
const openApp = async (page: Page, name: string, slug: string) => {
  await page.goto('/apps');
  await page.getByRole('list', { name: 'Danh sách ứng dụng' }).getByRole('link').filter({ hasText: name }).click();
  await expect(page).toHaveURL(new RegExp(`/apps/${slug}$`));
};
type Job = { id: string; feature: string; status: string; batch: string | null; style: string | null; product: string | null; name: string | null; breed: string | null };
const mine = async (page: Page, feature: string) => ((await (await page.request.get('/api/jobs?mine')).json()) as { jobs: Job[] }).jobs.filter((j) => j.feature === feature);
const detail = async (page: Page, id: string) => (await (await page.request.get(`/api/jobs/${id}`)).json()) as { prompt: string; inputIds: string[] };

test('pet portrait: picks styles for a pet photo, sees the price of one design per style, runs one job per style, selects the batch for the .zip and reuses the whole batch', async ({ page }) => {
  await signIn(page, 'petsa');
  await openApp(page, 'Chân dung thú cưng', 'pet-portrait');
  const styles = page.getByRole('group', { name: 'Phong cách cần tạo' });

  // No style until the member picks one, as each costs a job.
  await expect(styles.getByRole('checkbox')).toHaveCount(8);
  for (const box of await styles.getByRole('checkbox').all()) await expect(box).not.toBeChecked();
  await expect(reason(page)).toHaveText('Tải lên ảnh: Thú cưng.');
  await page.getByLabel('Ảnh thú cưng').setInputFiles({ name: 'corgi.png', mimeType: 'image/png', buffer: png() });
  await expect(page.getByRole('group', { name: 'Thú cưng' }).getByRole('img', { name: 'corgi.png' })).toBeVisible();
  await expect(reason(page)).toHaveText('Chọn ít nhất một phong cách.');
  await expect(runButton(page)).toBeDisabled();

  // A priced model: one image's price per style, and the first style's prompt.
  await pickModel(page, /Mock pets priced/);
  for (const name of ['Màu nước', 'Hoạt hình', 'Sơn dầu']) await styles.getByText(name, { exact: true }).click();
  await expect(cost(page)).toHaveText('3 ảnh × $0.15 = $0.45');
  await expect(runButton(page)).toContainText('$0.45');
  await expect(preview(page)).toContainText(`Màu nước: ${petPortraitPrompt('watercolor')}`);
  await expect(page.getByText('2 phong cách còn lại dùng prompt như trên, chỉ khác phần mô tả phong cách.')).toBeVisible();

  // The run on the mock model: one job per style, each with its own prompt, all with one batch id.
  await pickModel(page, /Mock pets E2E/);
  await runButton(page).click();
  await expect(page.getByText('Đã gửi lượt tạo')).toBeVisible();
  await expect.poll(async () => (await mine(page, 'pet_portrait')).map((j) => [j.style, j.status]).sort(), { timeout: 90_000 }).toEqual([
    ['cartoon', 'succeeded'], ['oil', 'succeeded'], ['watercolor', 'succeeded'],
  ]);
  const jobs = await mine(page, 'pet_portrait');
  expect(new Set(jobs.map((j) => j.batch)).size).toBe(1);
  expect(jobs[0]!.batch).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  for (const job of jobs) expect((await detail(page, job.id)).prompt).toBe(petPortraitPrompt(job.style!));
  for (const style of ['Màu nước', 'Hoạt hình', 'Sơn dầu']) await expect(page.getByRole('heading', { name: `Chân dung thú cưng · ${style}`, level: 3 })).toBeVisible();

  // "Chọn cả lô" on one card picks the three results for the .zip.
  const card = page.locator('.job-card').filter({ has: page.getByRole('heading', { name: 'Chân dung thú cưng · Sơn dầu' }) });
  await card.getByRole('button', { name: 'Chọn cả lô' }).click();
  await expect(page.getByRole('group', { name: 'Tải nhiều mục' })).toContainText('Đã chọn 3');
  for (const style of ['Màu nước', 'Hoạt hình', 'Sơn dầu']) await expect(page.getByRole('checkbox', { name: new RegExp(`^Chọn Chân dung thú cưng · ${style} `) })).toBeChecked();
  await expect(page.getByRole('button', { name: 'Tải xuống .zip' })).toBeEnabled();

  // Reuse one card: the photo back in its slot and the three styles of its Run picked again.
  await page.goto(`/apps/pet-portrait?reuse=${jobs.find((j) => j.style === 'oil')!.id}`);
  await expect(page.getByRole('group', { name: 'Thú cưng' }).getByRole('img', { name: 'corgi.png' })).toBeVisible();
  for (const name of ['Màu nước', 'Hoạt hình', 'Sơn dầu']) await expect(styles.getByRole('checkbox', { name })).toBeChecked();
  for (const name of ['Nét mực đen', 'Pop art']) await expect(styles.getByRole('checkbox', { name })).not.toBeChecked();
  await expect(cost(page)).toContainText('3 ảnh ×');
});

test('mockup pack: runs one mockup per product for a design, reuses the batch, and with a blank product photo takes that one product only', async ({ page }) => {
  await signIn(page, 'mockupsa');
  await openApp(page, 'Mockup hàng loạt', 'mockup-pack');
  const products = page.getByRole('group', { name: 'Sản phẩm cần tạo' });
  await expect(products.getByRole('checkbox')).toHaveCount(6);
  await page.getByLabel('Ảnh thiết kế').setInputFiles({ name: 'design.png', mimeType: 'image/png', buffer: png() });
  await expect(reason(page)).toHaveText('Chọn ít nhất một sản phẩm.');

  await pickModel(page, /Mock pets priced/);
  for (const name of ['Thảm tròn 3D', 'Cốc sứ 11 oz']) await products.getByText(name, { exact: true }).click();
  await expect(cost(page)).toHaveText('2 ảnh × $0.15 = $0.30');
  await expect(preview(page)).toContainText(`Thảm tròn 3D: ${mockupPrompt('round-rug', false)}`);

  await pickModel(page, /Mock pets E2E/);
  await runButton(page).click();
  await expect(page.getByText('Đã gửi lượt tạo')).toBeVisible();
  await expect.poll(async () => (await mine(page, 'mockup_pack')).map((j) => [j.product, j.status]).sort(), { timeout: 90_000 }).toEqual([['mug', 'succeeded'], ['round-rug', 'succeeded']]);
  const first = await mine(page, 'mockup_pack');
  for (const job of first) expect((await detail(page, job.id)).prompt).toBe(mockupPrompt(job.product!, false));
  await expect(page.getByRole('heading', { name: 'Mockup sản phẩm · Thảm tròn 3D', level: 3 })).toBeVisible();

  // Reuse: the design and both products back.
  await page.goto(`/apps/mockup-pack?reuse=${first.find((j) => j.product === 'mug')!.id}`);
  await expect(page.getByRole('group', { name: 'Thiết kế' }).getByRole('img', { name: 'design.png' })).toBeVisible();
  for (const name of ['Thảm tròn 3D', 'Cốc sứ 11 oz']) await expect(products.getByRole('checkbox', { name })).toBeChecked();

  // A blank is one product: two picked stop Run until one is left, and the prompt then keeps the blank as it is.
  await page.getByLabel('Ảnh sản phẩm trơn').setInputFiles({ name: 'blank-mug.png', mimeType: 'image/png', buffer: png() });
  await expect(page.getByRole('group', { name: 'Sản phẩm trơn (tuỳ chọn)' }).getByRole('img', { name: 'blank-mug.png' })).toBeVisible();
  await expect(reason(page).filter({ hasText: 'Có ảnh sản phẩm trơn thì chỉ chọn một sản phẩm: đúng loại trong ảnh đó.' })).toBeVisible();
  await expect(runButton(page)).toBeDisabled();
  await products.getByText('Thảm tròn 3D', { exact: true }).click();
  await expect(runButton(page)).toBeEnabled();
  await expect(preview(page)).toContainText(`Cốc sứ 11 oz: ${mockupPrompt('mug', true)}`);
  await runButton(page).click();
  await expect(page.getByText('Đã gửi lượt tạo')).toBeVisible();
  await expect.poll(async () => (await mine(page, 'mockup_pack')).length, { timeout: 30_000 }).toBe(3);
  const onBlank = (await mine(page, 'mockup_pack')).find((j) => !first.some((f) => f.id === j.id))!;
  expect(onBlank.product).toBe('mug');
  expect(onBlank.batch).not.toBe(first[0]!.batch);
  const sent = await detail(page, onBlank.id);
  expect([sent.prompt, sent.inputIds.length]).toEqual([mockupPrompt('mug', true), 2]);
});

test('name swap: checks the names, prices names times breeds, runs one job per name and breed and reuses the whole batch', async ({ page }) => {
  await signIn(page, 'namesa');
  await openApp(page, 'Đổi tên hàng loạt', 'name-swap');
  await page.getByLabel('Ảnh thiết kế có tên').setInputFiles({ name: 'named.png', mimeType: 'image/png', buffer: png() });
  await expect(reason(page)).toHaveText('Nhập ít nhất một tên.');
  const names = page.getByLabel('Tên mới, mỗi dòng một tên');
  const breeds = page.getByRole('group', { name: 'Đổi cả giống chó (tuỳ chọn)' });

  // The names are held to what may go into a prompt, as the server holds them.
  await names.fill('Max\nBella 🐶');
  await expect(reason(page)).toHaveText('Tên "Bella 🐶" chỉ được có chữ cái, chữ số, khoảng trắng, dấu nháy đơn và gạch nối.');
  await names.fill('x'.repeat(21));
  await expect(reason(page)).toHaveText(`Tên "${'x'.repeat(21)}" dài quá 20 ký tự.`);
  await names.fill(Array.from({ length: 13 }, (_, i) => `Dog ${i + 1}`).join('\n'));
  await breeds.getByText('Pug', { exact: true }).click();
  await breeds.getByText('Beagle', { exact: true }).click();
  await expect(reason(page)).toHaveText('Tối đa 25 ảnh mỗi lần chạy, đang là 26: bớt tên hoặc giống chó.');

  // Two names (a repeat and spaces dropped) times two breeds.
  await names.fill('Max\nNguyễn Ánh\n  Max ');
  await pickModel(page, /Mock pets priced/);
  await expect(cost(page)).toHaveText('4 ảnh × $0.15 = $0.60');
  await expect(preview(page)).toContainText(`Max · Beagle: ${nameSwapPrompt('Max', 'Beagle')}`);
  await expect(page.getByText('3 ảnh còn lại dùng prompt như trên, chỉ khác tên (và giống chó).')).toBeVisible();
  // With no breed, one picture per name.
  await breeds.getByText('Beagle', { exact: true }).click();
  await breeds.getByText('Pug', { exact: true }).click();
  await expect(cost(page)).toHaveText('2 ảnh × $0.15 = $0.30');
  await expect(preview(page)).toContainText(`Max: ${nameSwapPrompt('Max')}`);
  await breeds.getByText('Pug', { exact: true }).click();
  await expect(cost(page)).toHaveText('2 ảnh × $0.15 = $0.30');

  await pickModel(page, /Mock pets E2E/);
  await runButton(page).click();
  await expect(page.getByText('Đã gửi lượt tạo')).toBeVisible();
  await expect.poll(async () => (await mine(page, 'name_swap')).map((j) => [j.name, j.breed, j.status]).sort(), { timeout: 90_000 }).toEqual([
    ['Max', 'Pug', 'succeeded'], ['Nguyễn Ánh', 'Pug', 'succeeded'],
  ]);
  const jobs = await mine(page, 'name_swap');
  for (const job of jobs) expect((await detail(page, job.id)).prompt).toBe(nameSwapPrompt(job.name!, job.breed!));
  await expect(page.getByRole('heading', { name: 'Đổi tên · Nguyễn Ánh · Pug', level: 3 })).toBeVisible();

  // Reuse one card: the design, both names in the order sent and the breed back.
  await page.goto(`/apps/name-swap?reuse=${jobs.find((j) => j.name === 'Max')!.id}`);
  await expect(page.getByRole('group', { name: 'Thiết kế có tên' }).getByRole('img', { name: 'named.png' })).toBeVisible();
  await expect(names).toHaveValue('Max\nNguyễn Ánh');
  await expect(breeds.getByRole('checkbox', { name: 'Pug' })).toBeChecked();
  await expect(breeds.getByRole('checkbox', { name: 'Beagle' })).not.toBeChecked();
});

test('name swap: fills the names from a CSV file, the pet name column first, through the rules of the box', async ({ page }) => {
  await signIn(page, 'namesb');
  await openApp(page, 'Đổi tên hàng loạt', 'name-swap');
  await page.getByLabel('Ảnh thiết kế có tên').setInputFiles({ name: 'named.png', mimeType: 'image/png', buffer: png() });
  const names = page.getByLabel('Tên mới, mỗi dòng một tên');
  await names.fill('Old');
  const csvFile = page.getByLabel('Tệp CSV chứa tên');
  const note = page.getByRole('status').filter({ hasText: 'Đã lấy' });

  // An export with a byte order mark, CRLF, quoted fields with a comma or a line break, a repeat, a blank and a value that is no name.
  const csv = '﻿Name,Email,Pet Name\r\n#1001,a@e2e.test,Max\r\n#1002,b@e2e.test,"Bella"\r\n#1003,c@e2e.test,Max\r\n#1004,d@e2e.test,"Max 🐶, the dog"\r\n#1005,e@e2e.test,\r\n#1006,f@e2e.test,"Nguyễn\r\nÁnh"\r\n';
  await csvFile.setInputFiles({ name: 'orders.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
  await expect(select(page, 'Cột chứa tên')).toContainText('Pet Name');
  await expect(names).toHaveValue('Max\nBella\nNguyễn Ánh');
  await expect(note).toHaveText('Đã lấy 3 tên từ cột “Pet Name” của orders.csv. Bỏ qua 1 giá trị không hợp lệ: "Max 🐶, the dog".');
  await pickModel(page, /Mock pets priced/);
  await expect(cost(page)).toHaveText('3 ảnh × $0.15 = $0.45');

  // Another column: order numbers are no names, so the box empties and the note says why.
  await selectText(page, 'Cột chứa tên', 'Name');
  await expect(names).toHaveValue('');
  await expect(note).toHaveText('Đã lấy 0 tên từ cột “Name” của orders.csv. Bỏ qua 6 giá trị không hợp lệ: "#1001", "#1002", "#1003"….');
  await expect(reason(page)).toHaveText('Nhập ít nhất một tên.');

  // More than 25 names: the first 25 are kept.
  const many = ['Pet Name', ...Array.from({ length: 30 }, (_, i) => `Dog ${i + 1}`)].join('\n');
  await csvFile.setInputFiles({ name: 'many.csv', mimeType: 'text/csv', buffer: Buffer.from(many) });
  await expect(names).toHaveValue(Array.from({ length: 25 }, (_, i) => `Dog ${i + 1}`).join('\n'));
  await expect(note).toHaveText('Đã lấy 25 tên từ cột “Pet Name” của many.csv. Chỉ giữ 25 tên đầu, bỏ 5 tên còn lại.');
  await expect(cost(page)).toHaveText('25 ảnh × $0.15 = $3.75');
});
