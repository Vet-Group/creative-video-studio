import { readFileSync } from 'node:fs';
import { createPool } from '@cvs/db/client';
import { expect, type Page, test } from '@playwright/test';
import sharp from 'sharp';
import { DOG_BREEDS } from '../src/lib/apps';
import { jpg, modelButton, openTab, png, signIn } from './support.test';
import { USERS } from './users';

const runButton = (page: Page) => page.getByRole('button', { name: /^Chạy/ });
const history = (page: Page) => page.getByRole('complementary', { name: 'Lượt tạo của tôi' });
const card = (page: Page, title: string) => history(page).locator('li.job-card').filter({ has: page.getByRole('heading', { name: title, level: 3 }) });

/** The entries of a STORE zip (names and bytes), read through its central directory. */
function zipEntries(zip: Buffer): { name: string; data: Buffer }[] {
  const end = zip.length - 22;
  let p = zip.readUInt32LE(end + 16);
  return Array.from({ length: zip.readUInt16LE(end + 10) }, () => {
    const n = zip.readUInt16LE(p + 28);
    const name = zip.subarray(p + 46, p + 46 + n).toString('utf8');
    const local = zip.readUInt32LE(p + 42);
    const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
    const data = zip.subarray(start, start + zip.readUInt32LE(p + 24));
    p += 46 + n + zip.readUInt16LE(p + 30) + zip.readUInt16LE(p + 32);
    return { name, data };
  });
}

// A seller's batch on the mock model: the ZIP of its results names each file by its breed, and an image result opens in Background Remover with the photo in its slot.
test('a breed swap batch downloads as a ZIP named by breed, and Xoá nền on a card opens Background Remover with the result in its slot', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signIn(page, 'toolsa');
  await page.goto('/apps/breed-swap');
  await page.getByLabel('Ảnh gốc có chó').setInputFiles({ name: 'rug.png', mimeType: 'image/png', buffer: png() });
  await modelButton(page).click();
  await page.getByRole('option', { name: /Mock breeds E2E/ }).click();
  const breeds = page.getByRole('group', { name: 'Giống chó cần tạo' });
  for (const name of ['Golden Retriever', 'Pug']) await breeds.getByText(name, { exact: true }).click();
  await runButton(page).click();
  const mine = async () =>
    ((await (await page.request.get('/api/jobs?mine')).json()) as { jobs: { id: string; feature: string; status: string; breed: string | null }[] }).jobs.filter((j) => j.feature === 'breed_swap');
  await expect.poll(async () => (await mine()).map((j) => [j.breed, j.status]).sort(), { timeout: 90_000 }).toEqual([['Golden Retriever', 'succeeded'], ['Pug', 'succeeded']]);

  // An image card offers the two photo tools beside the video link.
  const golden = card(page, 'Đổi giống chó · Golden Retriever');
  for (const name of ['Tạo video', 'Xoá nền', 'Tăng độ phân giải']) await expect(golden.getByRole(name === 'Tạo video' ? 'link' : 'button', { name })).toBeVisible();

  // The ZIP: one file per breed, named by its day, creator and breed.
  await history(page).getByRole('button', { name: 'Chọn', exact: true }).click();
  for (const breed of ['Golden Retriever', 'Pug']) await history(page).getByRole('checkbox', { name: new RegExp(`^Chọn Đổi giống chó · ${breed} `) }).check();
  const [download] = await Promise.all([page.waitForEvent('download'), history(page).getByRole('button', { name: 'Tải xuống .zip' }).click()]);
  const names = zipEntries(readFileSync((await download.path())!)).map((e) => e.name).sort();
  expect(names).toHaveLength(2);
  expect(names[0]).toMatch(/^\d{8}-e2e-tools-a-golden-retriever-[\w-]{8}\.(png|jpg|webp)$/);
  expect(names[1]).toMatch(/^\d{8}-e2e-tools-a-pug-[\w-]{8}\.(png|jpg|webp)$/);

  // Background Remover: the result copied into a new input of the member's, already in Background Remover's slot.
  await golden.getByRole('button', { name: 'Xoá nền' }).click();
  await expect(page).toHaveURL(/\/apps\/background-remover\?image=[\w-]+$/);
  await expect(page.getByRole('group', { name: 'Ảnh', exact: true }).getByRole('img', { name: /^history-[\w]{8}\.(png|jpg|webp)$/ })).toBeVisible();
  await expect(runButton(page)).toBeEnabled(); // the photo is all Background Remover needs
  // An id that is not the member's own input leaves the slot empty.
  await page.goto('/apps/image-upscale?image=no-such-asset');
  await expect(page.getByRole('group', { name: 'Ảnh', exact: true }).getByRole('img')).toHaveCount(0);
});

test('the listing preset makes a 2048 px square JPEG with the whole image on white, its transparent part white too', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signIn(page, 'toolsb');
  await page.goto('/apps/media-optimizer');
  await expect(page.getByLabel('Ảnh cần tối ưu')).toBeEnabled();
  // A 400 × 200 PNG: its left half transparent, its right half red.
  const art = await page.evaluate(async () => {
    const c = document.createElement('canvas');
    c.width = 400;
    c.height = 200;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#ff0000';
    ctx.fillRect(200, 0, 200, 200);
    const blob = await new Promise<Blob>((done) => c.toBlob((b) => done(b!), 'image/png'));
    return [...new Uint8Array(await blob.arrayBuffer())];
  });
  await page.getByLabel('Ảnh cần tối ưu').setInputFiles({ name: 'cutout.png', mimeType: 'image/png', buffer: Buffer.from(art) });
  await expect(page.getByLabel('Chiều rộng (px)')).toHaveValue('400');

  const preset = page.getByRole('button', { name: 'Ảnh listing Etsy/Shopify' });
  await preset.click();
  await expect(preset).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByLabel('Chiều rộng (px)')).toHaveValue('2048');
  await expect(page.getByLabel('Chiều cao (px)')).toHaveValue('2048');
  await expect(page.getByLabel('Chiều rộng (px)')).toBeDisabled();
  await runButton(page).click();
  const results = page.getByRole('complementary', { name: 'Kết quả trong phiên này' });
  const link = results.getByRole('link', { name: 'Tải xuống' });
  await expect(link).toHaveAttribute('download', 'cutout-listing.jpg');
  await expect(results).toContainText('2048 × 2048 px');

  // The file itself: a JPEG of 2048 × 2048 with the picture fitted (2048 × 1024, centred) and white around and under it.
  const out = await link.evaluate(async (a: HTMLAnchorElement) => {
    const blob = await (await fetch(a.href)).blob();
    const bitmap = await createImageBitmap(blob);
    const c = document.createElement('canvas');
    c.width = bitmap.width;
    c.height = bitmap.height;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(bitmap, 0, 0);
    const at = (x: number, y: number) => [...ctx.getImageData(x, y, 1, 1).data.slice(0, 3)];
    return { type: blob.type, width: bitmap.width, height: bitmap.height, padding: at(1024, 100), transparent: at(500, 1024), red: at(1600, 1024) };
  });
  expect(out).toMatchObject({ type: 'image/jpeg', width: 2048, height: 2048 });
  for (const white of [out.padding, out.transparent]) for (const v of white) expect(v).toBeGreaterThan(245);
  expect(out.red[0]).toBeGreaterThan(230);
  for (const v of out.red.slice(1)) expect(v).toBeLessThan(25);

  // Off again, the size picked returns.
  await preset.click();
  await expect(page.getByLabel('Chiều rộng (px)')).toHaveValue('400');
});

test('the listing preset takes several images and makes one .zip of 2048 px square JPEGs, a repeated name with -2', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signIn(page, 'toolsc');
  await page.goto('/apps/media-optimizer');
  const input = page.getByLabel('Ảnh cần tối ưu');
  await expect(input).toBeEnabled();
  const preset = page.getByRole('button', { name: 'Ảnh listing Etsy/Shopify' });
  await preset.click();
  await input.setInputFiles([
    { name: 'shirt.png', mimeType: 'image/png', buffer: png() },
    { name: 'shirt.jpg', mimeType: 'image/jpeg', buffer: jpg() },
  ]);
  const slot = page.getByRole('group', { name: 'Ảnh', exact: true });
  await expect(slot.getByRole('img')).toHaveCount(2);
  await expect(page.getByText('2 ảnh · ', { exact: false })).toContainText('Chạy để tạo một tệp .zip gồm 2 ảnh listing.');
  await runButton(page).click();
  const results = page.getByRole('complementary', { name: 'Kết quả trong phiên này' });
  const link = results.getByRole('link', { name: 'Tải xuống .zip' });
  await expect(link).toHaveAttribute('download', 'listing-2-anh.zip');
  await expect(results).toContainText('2 ảnh JPG');
  await expect(runButton(page)).toBeEnabled(); // the form is free again for the next Run
  const [download] = await Promise.all([page.waitForEvent('download'), link.click()]);
  const entries = zipEntries(readFileSync((await download.path())!));
  expect(entries.map((e) => e.name)).toEqual(['shirt-listing.jpg', 'shirt-listing-2.jpg']);
  for (const e of entries) expect(await sharp(e.data).metadata()).toMatchObject({ format: 'jpeg', width: 2048, height: 2048 });

  // Without the preset a Run makes one image again: the other leaves the slot.
  await preset.click();
  await expect(slot.getByRole('img')).toHaveCount(1);
  await expect(page.getByText('Đã bỏ 1 ảnh thêm: không dùng mẫu listing thì mỗi lần chạy xử lý một ảnh.')).toBeVisible();
});

// A Run of 22 jobs, seeded straight into the e2e database (serve.ts's), is more than the 20 latest jobs History loads; "Chọn cả lô" still picks all 22.
test.describe('a Run of more than 20 jobs', () => {
  const url = new URL(process.env.DATABASE_URL!);
  url.pathname = `/${process.env.CVS_E2E_DB ?? 'cvs_e2e'}`;
  const db = createPool(url.toString(), 2);
  const batch = '5b3f7c1e-2d4a-4e6b-8c9d-0e1f2a3b4c5d';
  const ids = Array.from({ length: 22 }, (_, i) => `bigrun-${i}`);

  test.beforeAll(async () => {
    const user = (await db.query('select id from users where email = $1', [USERS.toolsd.email])).rows[0].id as string;
    await db.query(`insert into assets (id, owner_id, kind, s3_key, filename, mime, bytes, workspace_id) values ('bigrun-in', $1, 'input', 'bigrun/in', 'in.png', 'image/png', 10, 'ws_vet')`, [user]);
    for (const [i, id] of ids.entries()) {
      await db.query(`insert into assets (id, owner_id, kind, s3_key, filename, mime, bytes, workspace_id) values ($1, $2, 'output', $3, 'out.png', 'image/png', 10, 'ws_vet')`, [`${id}-out`, user, `bigrun/${id}`]);
      // Long ago, so no other spec's Library or today's figures move while they exist.
      await db.query(
        `insert into jobs (id, user_id, team_id, feature, model, provider, prompt, aspect, duration_s, input_asset_ids, params, status, output_asset_id, is_mock, created_at, finished_at, workspace_id)
         values ($1, $2, 'team-unassigned', 'breed_swap', 'mock-breeds-e2e', 'mock', 'p', 'auto', 0, '{bigrun-in}', $3, 'succeeded', $4, true, $5, $5, 'ws_vet')`,
        [id, user, { resolution: '1K', breed: DOG_BREEDS[i], batch }, `${id}-out`, new Date(Date.UTC(2020, 0, 1, 0, 0, i)).toISOString()],
      );
    }
  });

  test.afterAll(async () => {
    try {
      await db.query('delete from jobs where id = any($1)', [ids]);
      await db.query('delete from assets where id = any($1)', [[...ids.map((id) => `${id}-out`), 'bigrun-in']]);
    } finally {
      await db.end();
    }
  });

  test('"Chọn cả lô" picks every result of the Run, not only the 20 History shows', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await signIn(page, 'toolsd');
    await page.goto('/apps/breed-swap');
    await openTab(page, 'Lịch sử');
    await expect(history(page).locator('li.job-card')).toHaveCount(20);
    await card(page, `Đổi giống chó · ${DOG_BREEDS[21]}`).getByRole('button', { name: 'Chọn cả lô' }).click();
    await expect(history(page).getByRole('group', { name: 'Tải nhiều mục' })).toContainText('Đã chọn 22');
    await expect(history(page).getByRole('checkbox', { checked: true })).toHaveCount(20);
  });
});
