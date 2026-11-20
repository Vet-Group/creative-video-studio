import { expect, type Page, test } from '@playwright/test';
import { modelButton, openTab, pickPreset, png, signIn } from './support.test';

// The owner's "one or the other, clearly" (2026-11-20): a preset that replaces the member's words shows as the one Run sends, with the words kept;
// Marketing Studio's History and Examples tabs follow the page's format unless asked for all.

const file = (name: string) => ({ name, mimeType: 'image/png', buffer: png() });

test('Create: a preset replaces the typed words, so a card names it, says the words are kept and unsent, and Tự viết thay gives the box back with them', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signIn(page, 'notea');
  await page.goto('/create');
  await expect(modelButton(page)).toContainText('Mock E2E');
  await expect(page.locator('.banner')).toHaveAttribute('aria-busy', 'false'); // the presets have loaded
  const words = page.getByLabel('Mô tả chuyển động');
  const inUse = page.getByRole('group', { name: 'Mẫu đang dùng' });
  await expect(inUse).toHaveCount(0);

  // With no words typed, the card only names the preset.
  await pickPreset(page, 'light-sweep');
  await expect(inUse).toContainText('Đang dùng: Lướt gần lấp lánh');
  await expect(inUse).not.toContainText('Mô tả bạn đã viết được giữ lại');
  await expect(page.getByRole('radiogroup', { name: 'Nguồn mẫu' }).getByRole('radio', { name: 'Có sẵn' })).toBeChecked();
  await expect(words).toBeDisabled();
  await inUse.getByRole('button', { name: 'Tự viết thay' }).click();
  await expect(inUse).toHaveCount(0);
  await expect(words).toBeFocused();

  // With words typed, the preset is sent and the words wait.
  await words.fill('Slow turn of the shirt.');
  await pickPreset(page, 'light-sweep');
  await expect(inUse).toContainText('Mô tả bạn đã viết được giữ lại nhưng không gửi khi dùng mẫu.');
  await inUse.getByRole('button', { name: 'Đổi mẫu' }).click();
  await expect(page.getByRole('dialog', { name: 'Bộ sưu tập mẫu' })).toBeVisible();
  await page.keyboard.press('Escape');
  await inUse.getByRole('button', { name: 'Tự viết thay' }).click();
  await expect(inUse).toHaveCount(0);
  await expect(words).toBeFocused();
  await expect(words).toHaveValue('Slow turn of the shirt.');
});

const jobs = async (page: Page, feature: string) => ((await (await page.request.get('/api/jobs?mine')).json()) as { jobs: { feature: string }[] }).jobs.filter((j) => j.feature === feature);

test('Marketing Studio: History and Ví dụ show this format by default, with a way to see every format', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signIn(page, 'noteb');
  const upload = async (name: string) => ((await (await page.request.post('/api/assets', { multipart: { file: file(name) } })).json()) as { assets: { id: string }[] }).assets[0]!.id;
  const ugc = await page.request.post('/api/jobs', { data: { feature: 'marketing', assetIds: [await upload('note-model.png'), await upload('note-product.png')], modelId: 'mock-e2e', prompt: 'ugc', ratio: '9:16', durationSec: 5, params: { audio: 'off' } } });
  expect(ugc.status()).toBe(201);
  const advanced = await page.request.post('/api/jobs', { data: { feature: 'marketing', assetIds: [await upload('note-ref.png')], modelId: 'mock-e2e', prompt: 'advanced', ratio: '9:16', durationSec: 5, params: { format: 'advanced', audio: 'off' } } });
  expect(advanced.status()).toBe(201);
  await expect.poll(async () => (await jobs(page, 'marketing')).length).toBe(2);

  const library = (kind: string) => (r: { url(): string }) => r.url().includes(`/api/library?kind=${kind}&example=1`);
  const first = page.waitForRequest(library('marketing_ugc'));
  await page.goto('/marketing-studio');
  await first; // Ví dụ opens first beside the form, asking for this format's results only
  const filter = page.getByRole('group', { name: 'Lọc theo định dạng' });
  await expect(filter.getByRole('button', { name: 'UGC Thử đồ' })).toHaveAttribute('aria-pressed', 'true');
  const every = page.waitForRequest(library('marketing'));
  await filter.getByRole('button', { name: 'Tất cả định dạng' }).click();
  await every;
  await expect(filter.getByRole('button', { name: 'Tất cả định dạng' })).toHaveAttribute('aria-pressed', 'true');
  const back = page.waitForRequest(library('marketing_ugc'));
  await filter.getByRole('button', { name: 'UGC Thử đồ' }).click();
  await back;

  // History: this format's jobs; every format's after the switch; the other format's page lists its own.
  await openTab(page, 'Lịch sử');
  const cards = page.locator('.tray.history > ul > li');
  await expect(cards).toHaveCount(1);
  await expect(cards).toContainText('UGC Thử đồ');
  await filter.getByRole('button', { name: 'Tất cả định dạng' }).click();
  await expect(cards).toHaveCount(2);
  await page.goto('/marketing-studio/advanced');
  await openTab(page, 'Lịch sử');
  await expect(filter.getByRole('button', { name: 'Editorial' })).toHaveAttribute('aria-pressed', 'true');
  await expect(cards).toHaveCount(1);
  await expect(cards).toContainText('Marketing Editorial');
});
