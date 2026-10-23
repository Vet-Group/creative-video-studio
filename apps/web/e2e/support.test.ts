// Helpers shared by the specs. The name ends in .test.ts, like the specs, so the UI strings below pass the English check;
// Playwright runs only *.e2e.test.ts (see playwright.config.ts) and Vitest skips this folder.
import { crc32, deflateSync } from 'node:zlib';
import { expect, type Page } from '@playwright/test';
import { PASSWORD, USERS, type UserKey } from './users';

/** A small valid 8x8 PNG, made here so no product image is needed. */
export function png(): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type), data]);
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(8, 0);
  header.writeUInt32BE(8, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // RGB
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(8 * 3, 0x80)]);
  const pixels = Buffer.concat(Array.from({ length: 8 }, () => row));
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', header), chunk('IDAT', deflateSync(pixels)), chunk('IEND', Buffer.alloc(0))]);
}

export async function signIn(page: Page, who: UserKey): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill(USERS[who].email);
  await page.getByLabel('Mật khẩu').fill(PASSWORD);
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await expect(page).toHaveURL(/\/create$/);
}

/** Uploads one image on the Create page, keeps the pre-selected model and presses Run. `store` is the name of a store in the picker. */
export async function runInUi(page: Page, options: { preset?: string; ratio?: string; duration?: string; store?: string } = {}): Promise<void> {
  await page.getByLabel('Ảnh sản phẩm').setInputFiles({ name: 'shirt.png', mimeType: 'image/png', buffer: png() });
  await expect(page.getByRole('img', { name: 'shirt.png' })).toBeVisible();
  if (options.preset) await page.getByLabel('Mẫu chuyển động').selectOption(options.preset);
  if (options.ratio) await page.getByLabel('Tỉ lệ khung hình').selectOption(options.ratio);
  if (options.duration) await page.getByLabel('Thời lượng').selectOption(options.duration);
  if (options.store) await page.getByLabel('Cửa hàng/Thương hiệu').selectOption({ label: options.store });
  await expect(page.getByRole('radio', { name: /Mock E2E/ })).toBeChecked();
  await page.getByRole('button', { name: 'Tạo video' }).click();
  await expect(page.getByText('Đã gửi job')).toBeVisible();
}

/** Starts a mock job through the API with the page's session; returns the job id. */
export async function runViaApi(page: Page): Promise<string> {
  const up = await page.request.post('/api/assets', { multipart: { file: { name: 'shirt.png', mimeType: 'image/png', buffer: png() } } });
  expect(up.status()).toBe(201);
  const { assets } = (await up.json()) as { assets: { id: string }[] };
  const job = await page.request.post('/api/jobs', {
    data: { assetIds: [assets[0]!.id], modelId: 'mock-e2e', presetId: 'gentle-push-in', ratio: '9:16', durationSec: 5 },
  });
  expect(job.status()).toBe(201);
  return ((await job.json()) as { id: string }).id;
}

/** `YYYYMMDD` of today in Vietnam, the first part of a download name. */
export const today = (): string => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date()).replaceAll('-', '');
