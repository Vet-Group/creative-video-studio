import { expect, type Page, test } from '@playwright/test';
import { HOOKS, LOCATIONS } from '../src/lib/marketing';
import { png, select, signIn } from './support.test';

// The reuse link (Fash's Recreate, without the run): History and the Library open the page that made the job with its form refilled.
const hook = HOOKS.find((h) => h.id === 'product-catch')!;
const spot = LOCATIONS.find((l) => l.id === 'bedroom')!;

async function upload(page: Page, name: string): Promise<string> {
  const res = await page.request.post('/api/assets', { multipart: { file: { name, mimeType: 'image/png', buffer: png() } } });
  return ((await res.json()) as { assets: { id: string }[] }).assets[0]!.id;
}
async function job(page: Page, assetIds: string[], params: Record<string, string>): Promise<string> {
  const res = await page.request.post('/api/jobs', { data: { feature: 'marketing', assetIds, modelId: 'mock-e2e', prompt: 'composed prompt', ratio: '1:1', durationSec: 5, params } });
  expect(res.status()).toBe(201);
  return ((await res.json()) as { id: string }).id;
}

test('the reuse link in History refills a UGC job, and an Advanced job opens on the Advanced page with its references, brief and script', async ({ page }) => {
  await signIn(page, 'mkte');
  const ugc = await job(page, [await upload(page, 'model.png'), await upload(page, 'product.png')], { audio: 'off', hook: hook.id, location: spot.id, brief: 'soft light' });

  await page.goto('/marketing-studio');
  await page.getByRole('tab', { name: 'Lịch sử' }).click();
  const tray = page.getByRole('complementary', { name: 'Job của tôi' });
  await tray.getByRole('link', { name: 'Dùng lại' }).first().click();
  await expect(page).toHaveURL((u) => u.pathname === '/marketing-studio' && u.searchParams.get('reuse') === ugc);
  await expect(page.getByLabel('Người mẫu: ảnh đã chọn').getByRole('img', { name: 'model.png' })).toBeVisible();
  await expect(page.getByLabel('Sản phẩm: ảnh đã chọn').getByRole('img', { name: 'product.png' })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Hook/ })).toContainText(hook.name);
  await expect(page.getByRole('button', { name: /^Bối cảnh/ })).toContainText(spot.name);
  await expect(page.getByRole('textbox', { name: 'Prompt (tuỳ chọn)' })).toHaveValue('soft light');
  await expect(page.getByRole('switch', { name: 'Tạo âm thanh' })).toHaveAttribute('aria-checked', 'false');
  await expect(select(page, 'Tỉ lệ')).toHaveAttribute('data-value', '1:1');
  await expect(select(page, 'Thời lượng')).toHaveAttribute('data-value', '5');

  // An Advanced job sent to the UGC page moves to the Advanced page, which refills the references, the brief and the script.
  const refs = [await upload(page, 'ref-1.png'), await upload(page, 'ref-2.png')];
  const advanced = await job(page, refs, { format: 'advanced', audio: 'on', brief: 'my brief', script: 'my lines' });
  await page.goto(`/marketing-studio?reuse=${advanced}`);
  await expect(page).toHaveURL((u) => u.pathname === '/marketing-studio/advanced' && u.searchParams.get('reuse') === advanced);
  await expect(page.getByLabel('Ảnh tham chiếu: ảnh đã chọn').getByRole('img')).toHaveCount(2);
  await expect(page.getByRole('textbox', { name: 'Prompt', exact: true })).toHaveValue('my brief');
  await expect(page.getByRole('textbox', { name: 'Lời thoại (tuỳ chọn)' })).toHaveValue('my lines');
  await expect(page.getByRole('button', { name: /^Hook/ })).not.toContainText(hook.name);

  // The Library's reuse link opens the same page for a marketing clip, not Create video.
  await expect.poll(async () => ((await (await page.request.get('/api/jobs?mine')).json()) as { jobs: { status: string }[] }).jobs.filter((j) => j.status === 'succeeded').length, { timeout: 60_000 }).toBe(2);
  await page.goto('/library');
  const card = page.getByRole('article').filter({ hasText: 'E2E Mkt E' }).first();
  await expect(card.getByRole('link', { name: 'Dùng lại' })).toHaveAttribute('href', /^\/marketing-studio\?reuse=/);
});

test('the reuse link refills Try On (person, garments, background, text, model, ratio, resolution), Image Generation and an app', async ({ page }) => {
  await signIn(page, 'reusea');
  const post = async (data: Record<string, unknown>) => {
    const res = await page.request.post('/api/jobs', { data });
    expect(res.status()).toBe(201);
    return ((await res.json()) as { id: string }).id;
  };
  const [person, g1, g2, bg] = [await upload(page, 'person.png'), await upload(page, 'g1.png'), await upload(page, 'g2.png'), await upload(page, 'bg.png')];

  // Try On: the person, two garments and a background, with the member's own text.
  const tryOn = await post({ feature: 'try_on', modelId: 'mock-image-e2e', assetIds: [person, g1, g2, bg], ratio: '3:4', prompt: 'composed', params: { resolution: '2K', garments: '2', brief: 'red dress' } });
  await page.goto(`/try-on?reuse=${tryOn}`);
  await expect(page.getByLabel('Người mẫu: ảnh đã chọn').getByRole('img')).toHaveAttribute('alt', 'person.png');
  await expect(page.getByLabel('Trang phục: ảnh đã chọn').getByRole('img')).toHaveCount(2);
  await expect(page.getByLabel('Bối cảnh (tuỳ chọn): ảnh đã chọn').getByRole('img')).toHaveAttribute('alt', 'bg.png');
  await expect(page.getByRole('textbox', { name: 'Prompt (tuỳ chọn)' })).toHaveValue('red dress');
  await expect(select(page, 'Tỉ lệ')).toHaveAttribute('data-value', '3:4');
  await expect(select(page, 'Độ phân giải')).toHaveAttribute('data-value', '2K');

  // Image Generation: the images, the member's prompt and Enhance off.
  const image = await post({ feature: 'image', modelId: 'mock-image-e2e', assetIds: [g1], ratio: '1:1', prompt: 'a studio shot', enhance: false, params: { resolution: '1K' } });
  await page.goto(`/image-generation?reuse=${image}`);
  await expect(page.getByRole('textbox', { name: 'Mô tả cảnh bạn muốn tạo' })).toHaveValue('a studio shot');
  await expect(page.getByRole('img', { name: 'g1.png' })).toBeVisible();
  await expect(select(page, 'Tỉ lệ')).toHaveAttribute('data-value', '1:1');

  // An app: Character Swap, one image per slot in order, and the member's text.
  const swap = await post({ feature: 'character_swap', modelId: 'mock-apps-e2e', assetIds: [person, bg], ratio: 'auto', prompt: 'keep the pose', params: { resolution: '1K', brief: 'keep the pose' } });
  await page.goto(`/apps/character-swap?reuse=${swap}`);
  await expect(page.getByLabel('Nhân vật mới: ảnh đã chọn').getByRole('img')).toHaveAttribute('alt', 'person.png');
  await expect(page.getByLabel('Ảnh đích: ảnh đã chọn').getByRole('img')).toHaveAttribute('alt', 'bg.png');
  await expect(page.getByRole('textbox', { name: 'Prompt (tuỳ chọn)' })).toHaveValue('keep the pose');

  // A job of another feature is not refilled.
  await page.goto(`/try-on?reuse=${image}`);
  await expect(page.getByText('Không tìm thấy ảnh để dùng lại.')).toBeVisible();
});
