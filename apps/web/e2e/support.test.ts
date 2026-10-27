// Helpers shared by the specs. The name ends in .test.ts, like the specs, so the UI strings below pass the English check;
// Playwright runs only *.e2e.test.ts (see playwright.config.ts) and Vitest skips this folder.
import { crc32, deflateSync } from 'node:zlib';
import { expect, type Locator, type Page } from '@playwright/test';
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
  // Wait for hydration, so the next link click navigates client-side and the next page's file inputs are already enabled.
  await expect(page.getByLabel('Ảnh sản phẩm')).toBeEnabled();
  // The click leaves the pointer where the login's submit button was, which can hover a Create card and skew geometry checks.
  await page.mouse.move(0, 0);
}

// The Create form's selects are custom: a button (role combobox) that opens a listbox. These helpers drive them the way a user does.

/** The select with this label. Its `data-value` attribute holds the chosen value. */
export const select = (page: Page, label: string): Locator => page.getByRole('combobox', { name: label, exact: true });
/** The options of an open select. */
export const optionsOf = (page: Page, label: string): Locator => page.getByRole('listbox', { name: label, exact: true }).getByRole('option');

/** Opens the select and picks the option with this value (`data-value`). */
export async function selectValue(page: Page, label: string, value: string): Promise<void> {
  await select(page, label).click();
  await optionsOf(page, label).and(page.locator(`[data-value="${value}"]`)).click();
}

/** Opens the select and picks the option with this text. */
export async function selectText(page: Page, label: string, text: string): Promise<void> {
  await select(page, label).click();
  await optionsOf(page, label).getByText(text, { exact: true }).click();
}

/** The Create form's chosen preset: the banner title, whose `data-value` holds the preset id ('' for a prompt of one's own). */
export const presetOf = (page: Page): Locator => page.locator('.banner-text strong');
/** The cards of the preset picker, opened from the banner. */
export const presetCards = (page: Page): Locator => page.getByRole('list', { name: 'Danh sách mẫu' }).getByRole('button');

/** Opens the preset picker from the banner and picks the card with this preset id (an empty id for a prompt of one's own). */
export async function pickPreset(page: Page, value: string): Promise<void> {
  await page.getByRole('button', { name: 'Chọn mẫu khác' }).click();
  await presetCards(page).and(page.locator(`[data-value="${value}"]`)).click();
  await expect(presetOf(page)).toHaveAttribute('data-value', value);
}

/** Opens the select, checks the full list of options, and closes it again with the mouse. */
export async function expectOptions(page: Page, label: string, texts: string[]): Promise<void> {
  await select(page, label).click();
  await expect(optionsOf(page, label)).toHaveText(texts);
  await select(page, label).click();
  await expect(select(page, label)).toHaveAttribute('aria-expanded', 'false');
}

/** The model picker's button; its text is the chosen model. */
export const modelButton = (page: Page): Locator => page.getByRole('button', { name: /^Mô hình / });

/** Opens the model panel and picks the model whose row matches. */
export async function pickModel(page: Page, name: RegExp): Promise<void> {
  await modelButton(page).click();
  await page.getByRole('option', { name }).click();
}

/** Uploads one image on the Create page, keeps the pre-selected model and presses Run. `preset` (default `gentle-push-in`, as the form starts on a free prompt), `ratio` and `duration` are option values; `store` is the name of a store in the picker. */
export async function runInUi(page: Page, options: { preset?: string; ratio?: string; duration?: string; store?: string } = {}): Promise<void> {
  await expect(page.getByLabel('Ảnh sản phẩm')).toBeEnabled(); // the file input stays disabled until hydration; files set before it are dropped
  await page.getByLabel('Ảnh sản phẩm').setInputFiles({ name: 'shirt.png', mimeType: 'image/png', buffer: png() });
  await expect(page.getByRole('img', { name: 'shirt.png' })).toBeVisible();
  await pickPreset(page, options.preset ?? 'gentle-push-in');
  if (options.ratio) await selectValue(page, 'Tỉ lệ khung hình', options.ratio);
  if (options.duration) await selectValue(page, 'Thời lượng', options.duration);
  if (options.store) await selectText(page, 'Cửa hàng/Thương hiệu', options.store);
  await expect(modelButton(page)).toContainText('Mock E2E');
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
