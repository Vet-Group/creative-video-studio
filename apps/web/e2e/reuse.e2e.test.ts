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
  await job(page, [await upload(page, 'model.png'), await upload(page, 'product.png')], { audio: 'off', hook: hook.id, location: spot.id, brief: 'soft light' });

  await page.goto('/marketing-studio');
  await page.getByRole('tab', { name: 'Lịch sử' }).click();
  const tray = page.getByRole('complementary', { name: 'Lượt tạo của tôi' });
  await tray.getByRole('button', { name: 'Dùng lại' }).first().click();
  await expect(page).toHaveURL((u) => u.pathname === '/marketing-studio' && u.search === ''); // in place, as Fash's Recreate: the URL stays
  await expect(page.getByLabel('Người mẫu: ảnh đã chọn').getByRole('img', { name: 'model.png' })).toBeVisible();
  await expect(page.getByLabel('Sản phẩm: ảnh đã chọn').getByRole('img', { name: 'product.png' })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Hook/ })).toContainText(hook.name);
  await expect(page.getByRole('button', { name: /^Bối cảnh/ })).toContainText(spot.name);
  await expect(page.getByRole('textbox', { name: 'Mô tả (tuỳ chọn)' })).toHaveValue('soft light');
  await expect(page.getByRole('switch', { name: 'Tạo âm thanh' })).toHaveAttribute('aria-checked', 'false');
  await expect(select(page, 'Tỉ lệ')).toHaveAttribute('data-value', '1:1');
  await expect(select(page, 'Thời lượng')).toHaveAttribute('data-value', '5');
  // As on Fash's "Ready to Recreate", a short note says the form is refilled.
  await expect(page.getByRole('region', { name: 'Thông báo' }).getByText('Sẵn sàng tạo lại')).toBeVisible();

  // An Advanced job sent to the UGC page moves to the Advanced page, which refills the references, the brief and the script.
  const refs = [await upload(page, 'ref-1.png'), await upload(page, 'ref-2.png')];
  const advanced = await job(page, refs, { format: 'advanced', audio: 'on', brief: 'my brief', script: 'my lines' });
  await page.goto(`/marketing-studio?reuse=${advanced}`);
  await expect(page.getByLabel('Ảnh tham chiếu: ảnh đã chọn').getByRole('img')).toHaveCount(2);
  await expect(page).toHaveURL((u) => u.pathname === '/marketing-studio/advanced' && u.search === ''); // the link opened the refill, then the address drops its query
  await expect(page.getByRole('textbox', { name: 'Mô tả', exact: true })).toHaveValue('my brief');
  await expect(page.getByRole('textbox', { name: 'Lời thoại (tuỳ chọn)' })).toHaveValue('my lines');
  await expect(page.getByRole('button', { name: /^Hook/ })).not.toContainText(hook.name);

  // The Library's reuse link opens the same page for a marketing clip, not Create video.
  await expect.poll(async () => ((await (await page.request.get('/api/jobs?mine')).json()) as { jobs: { status: string }[] }).jobs.filter((j) => j.status === 'succeeded').length, { timeout: 60_000 }).toBe(2);
  await page.goto('/library');
  const card = page.getByRole('article').filter({ hasText: 'E2E Mkt E' }).first();
  await card.getByRole('button', { name: 'Xem chi tiết' }).click();
  await expect(page.getByRole('dialog').getByRole('link', { name: 'Dùng lại' })).toHaveAttribute('href', /^\/marketing-studio\?reuse=/);
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
  await expect(page.getByRole('textbox', { name: 'Mô tả (tuỳ chọn)' })).toHaveValue('red dress');
  await expect(select(page, 'Tỉ lệ')).toHaveAttribute('data-value', '3:4');
  await expect(select(page, 'Độ phân giải')).toHaveAttribute('data-value', '2K');

  // Image Generation: the images, the member's prompt and Enhance off.
  const image = await post({ feature: 'image', modelId: 'mock-image-e2e', assetIds: [g1], ratio: '1:1', prompt: 'a studio shot', enhance: false, params: { resolution: '1K' } });
  await page.goto(`/image-generation?reuse=${image}`);
  await expect(page.getByRole('textbox', { name: 'Mô tả', exact: true })).toHaveValue('a studio shot');
  await expect(page.getByRole('img', { name: 'g1.png' })).toBeVisible();
  await expect(select(page, 'Tỉ lệ')).toHaveAttribute('data-value', '1:1');

  // An app: Character Swap, one image per slot in order, and the member's text.
  const swap = await post({ feature: 'character_swap', modelId: 'mock-apps-e2e', assetIds: [person, bg], ratio: 'auto', prompt: 'keep the pose', params: { resolution: '1K', brief: 'keep the pose' } });
  await page.goto(`/apps/character-swap?reuse=${swap}`);
  await expect(page.getByLabel('Nhân vật mới: ảnh đã chọn').getByRole('img')).toHaveAttribute('alt', 'person.png');
  await expect(page.getByLabel('Ảnh đích: ảnh đã chọn').getByRole('img')).toHaveAttribute('alt', 'bg.png');
  await expect(page.getByRole('textbox', { name: 'Mô tả (tuỳ chọn)' })).toHaveValue('keep the pose');

  // A job of another feature is not refilled.
  await page.goto(`/try-on?reuse=${image}`);
  await expect(page.getByText('Không tìm thấy ảnh để dùng lại.')).toBeVisible();
});

test('a reuse says what it could not bring back and why: a deleted input photo, a model that is gone, and nothing at all', async ({ page }) => {
  await signIn(page, 'reusea');
  const post = async (data: Record<string, unknown>) => {
    const res = await page.request.post('/api/jobs', { data });
    expect(res.status()).toBe(201);
    return ((await res.json()) as { id: string }).id;
  };
  const [a, b] = [await upload(page, 'first.png'), await upload(page, 'second.png')];
  // No API deletes an input photo, so the job's answer is cut as the server cuts it for one that was deleted or purged: the images that still exist, `inputCount` still the job's own.
  const cut = (id: string, change: (j: Record<string, unknown>) => void) =>
    page.route(`**/api/jobs/${id}`, async (route) => {
      const j = (await (await route.fetch()).json()) as Record<string, unknown>;
      change(j);
      await route.fulfill({ json: j });
    });
  const note = page.locator('.form-message p.help[role="status"], .form-card p.help[role="status"]').filter({ hasText: 'Không dùng lại được' });

  // A deleted input photo: the one that is left comes back, and the note counts the one that is not.
  const two = await post({ feature: 'image', modelId: 'mock-image-e2e', assetIds: [a, b], ratio: '1:1', prompt: 'two photos', enhance: false, params: { resolution: '1K' } });
  await cut(two, (j) => (j.images = (j.images as unknown[]).slice(0, 1)));
  await page.goto(`/image-generation?reuse=${two}`);
  await expect(page.getByRole('img', { name: 'first.png' })).toBeVisible();
  await expect(note).toHaveText('Đã điền lại 1 ảnh và phần còn lại. Không dùng lại được: 1 ảnh đầu vào (đã bị xoá).');

  // A model that is switched off or hidden: the list lacks it, so the form chose another and says which and why.
  const one = await post({ feature: 'image', modelId: 'mock-image-e2e', assetIds: [a], ratio: 'auto', prompt: 'one photo', enhance: false, params: { resolution: '1K' } });
  await page.route(/\/api\/image-models\?feature=image\b/, async (route) => {
    const list = (await (await route.fetch()).json()) as { models: { id: string }[] };
    await route.fulfill({ json: { ...list, models: list.models.filter((m) => m.id !== 'mock-image-e2e') } });
  });
  await page.goto(`/image-generation?reuse=${one}`);
  await expect(page.getByRole('img', { name: 'first.png' })).toBeVisible();
  await expect(note).toHaveText('Đã điền lại 1 ảnh và phần còn lại. Không dùng lại được: mô hình Mock image E2E (đã tắt hoặc không còn dùng ở trang này, đã chọn Mock image Solo).');
  await page.unroute(/\/api\/image-models\?feature=image\b/);

  // Nothing to bring back: every photo is gone and the job has no words. The form stays as it is, and a toast says so.
  const bare = await post({ feature: 'image', modelId: 'mock-image-e2e', assetIds: [a], ratio: 'auto', prompt: 'words', enhance: false, params: { resolution: '1K' } });
  await cut(bare, (j) => Object.assign(j, { images: [], prompt: null, brief: null }));
  await page.goto(`/image-generation?reuse=${bare}`);
  await expect(page.getByRole('region', { name: 'Thông báo' }).getByText('Không dùng lại được: 1 ảnh đầu vào đã bị xoá và lượt này không có mô tả. Biểu mẫu được giữ nguyên.')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Thông báo' }).getByText('Sẵn sàng tạo lại')).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: 'Mô tả', exact: true })).toHaveValue('');
  await expect(page.getByRole('img', { name: 'first.png' })).toHaveCount(0);
});

test("a History card shows what it cannot do as a disabled action with its reason: Motion Control's inputs", async ({ page }) => {
  await signIn(page, 'reusea');
  // The tray's answer gets a Motion Control card, as no mock model runs it here.
  await page.route(/\/api\/jobs\?mine/, async (route) => {
    const body = (await (await route.fetch()).json()) as { jobs: Record<string, unknown>[] };
    const card = (id: string, inputAssetIds: string[]) => ({
      id, status: 'failed', error: 'e2e', failureReason: null, twin: null, isMock: true, feature: 'motion_control', ratio: 'auto', durationSec: 5, resolution: null, modelId: 'mock', retryOf: null, retried: false,
      outputAssetId: null, posterAssetId: null, createdAt: new Date().toISOString(), startedAt: null, providerQueue: null, finishedAt: new Date().toISOString(), text: null, inputAssetIds,
      garments: null, traits: null, format: null, roles: null, view: null, favorite: false, estimateUsd: null, unbilled: true,
    });
    await route.fulfill({ json: { ...body, jobs: [card('card-motion', ['x1', 'x2']), ...body.jobs] } });
  });
  await page.goto('/apps/motion-control');
  await page.getByRole('tab', { name: 'Lịch sử' }).click();
  const inputs = page.getByRole('button', { name: 'Dùng ảnh đầu vào' });
  await expect(inputs).toBeDisabled();
  await expect(inputs).toHaveAccessibleDescription('Ảnh nhân vật và video tham chiếu chỉ dùng lại cùng nhau: bấm Dùng lại.');
  await expect(page.getByRole('button', { name: 'Dùng lại', exact: true })).toBeEnabled(); // the way that does work stays
});
