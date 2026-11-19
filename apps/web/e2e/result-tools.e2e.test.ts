import { readFileSync } from 'node:fs';
import { expect, type Page, test } from '@playwright/test';
import { modelButton, png, signIn } from './support.test';

const runButton = (page: Page) => page.getByRole('button', { name: /^Chạy/ });
const history = (page: Page) => page.getByRole('complementary', { name: 'Lượt tạo của tôi' });
const card = (page: Page, title: string) => history(page).locator('li.job-card').filter({ has: page.getByRole('heading', { name: title, level: 3 }) });

/** The entry names of a zip, read through its central directory. */
function zipNames(zip: Buffer): string[] {
  const end = zip.length - 22;
  let p = zip.readUInt32LE(end + 16);
  return Array.from({ length: zip.readUInt16LE(end + 10) }, () => {
    const n = zip.readUInt16LE(p + 28);
    const name = zip.subarray(p + 46, p + 46 + n).toString('utf8');
    p += 46 + n + zip.readUInt16LE(p + 30) + zip.readUInt16LE(p + 32);
    return name;
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
  const names = zipNames(readFileSync((await download.path())!)).sort();
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
