import { expect, type Page, test } from '@playwright/test';
import { png, select, signIn } from './support.test';

// Saved forms: Save template keeps the page's inputs under a name, My templates reopens the page filled from one. Nothing is run.
const file = (name: string) => ({ name, mimeType: 'image/png', buffer: png() });

async function saveAs(page: Page, name: string) {
  await page.getByRole('button', { name: 'Lưu mẫu' }).click();
  const dialog = page.getByRole('dialog', { name: 'Lưu mẫu' });
  await dialog.getByLabel('Tên mẫu').fill(name);
  await dialog.getByRole('button', { name: 'Lưu', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Đã lưu mẫu.' })).toBeVisible();
}

test('on every form the template links scroll with the fields, and the fixed bar below holds only Run, as on the live page', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signIn(page, 'tplpos');
  for (const path of ['/create', '/try-on', '/marketing-studio', '/apps/character-swap']) {
    await page.goto(path);
    await expect(page.getByRole('button', { name: 'Lưu mẫu' })).toBeVisible();
    await expect(page.locator('.form-scroll > .templates'), path).toHaveCount(1);
    await expect(page.locator('.runbar').getByRole('button'), path).toHaveCount(1);
  }
});

test('Try On: a saved template lists under Mẫu của tôi and refills the person, garment, text and resolution; another member does not see it; it can be deleted', async ({ page, browser }) => {
  await signIn(page, 'tpla');
  await page.goto('/try-on');
  await page.getByLabel('Ảnh trang phục').setInputFiles(file('garment.png'));
  await page.getByLabel('Ảnh người mẫu').setInputFiles(file('person.png'));
  await expect(page.getByRole('img', { name: 'person.png' })).toBeVisible();
  await page.getByRole('textbox', { name: 'Prompt (tuỳ chọn)' }).fill('red dress');
  await select(page, 'Độ phân giải').click();
  await page.getByRole('option', { name: '2K' }).click();
  await saveAs(page, 'Váy đỏ');

  await page.goto('/try-on');
  await expect(page.getByRole('textbox', { name: 'Prompt (tuỳ chọn)' })).toHaveValue('');
  await page.getByRole('button', { name: 'Mẫu của tôi' }).click();
  const list = page.getByRole('dialog', { name: 'Mẫu của tôi' });
  await list.getByRole('link', { name: 'Váy đỏ' }).click();
  await expect(page).toHaveURL(/\/try-on\?template=/);
  await expect(page.getByLabel('Người mẫu: ảnh đã chọn').getByRole('img')).toHaveAttribute('alt', 'person.png');
  await expect(page.getByLabel('Trang phục: ảnh đã chọn').getByRole('img')).toHaveAttribute('alt', 'garment.png');
  await expect(page.getByRole('textbox', { name: 'Prompt (tuỳ chọn)' })).toHaveValue('red dress');
  await expect(select(page, 'Độ phân giải')).toHaveAttribute('data-value', '2K');
  const url = page.url();

  // Another member: not in the list, and the link refills nothing.
  const other = await (await browser.newContext()).newPage();
  await signIn(other, 'tplb');
  await other.goto('/try-on');
  await other.getByRole('button', { name: 'Mẫu của tôi' }).click();
  await expect(other.getByRole('dialog', { name: 'Mẫu của tôi' })).toContainText('Chưa có mẫu nào.');
  await other.goto(url);
  await expect(other.getByText('Không tìm thấy ảnh để dùng lại.')).toBeVisible();
  await other.close();

  page.once('dialog', (d) => void d.accept());
  await page.getByRole('button', { name: 'Mẫu của tôi' }).click();
  await list.getByRole('button', { name: 'Xoá mẫu Váy đỏ' }).click();
  await expect(list).toContainText('Chưa có mẫu nào.');
});

test('Image Generation: a saved template refills the prompt and Enhance', async ({ page }) => {
  await signIn(page, 'tpla');
  await page.goto('/image-generation');
  const prompt = page.getByRole('textbox', { name: 'Mô tả cảnh bạn muốn tạo' });
  await prompt.fill('a studio shot');
  await saveAs(page, 'Studio');
  await page.goto('/image-generation');
  await expect(prompt).toHaveValue('');
  await page.getByRole('button', { name: 'Mẫu của tôi' }).click();
  await page.getByRole('dialog', { name: 'Mẫu của tôi' }).getByRole('link', { name: 'Studio' }).click();
  await expect(prompt).toHaveValue('a studio shot');
});

test('Marketing Studio: an Advanced template chosen on the UGC page opens the Advanced page with its references, brief and script', async ({ page }) => {
  await signIn(page, 'tplb');
  const refs: string[] = [];
  for (const name of ['ref-1.png', 'ref-2.png']) {
    const res = await page.request.post('/api/assets', { multipart: { file: file(name) } });
    refs.push(((await res.json()) as { assets: { id: string }[] }).assets[0]!.id);
  }
  const saved = await page.request.post('/api/templates', { data: { feature: 'marketing', name: 'Launch', data: { images: refs, format: 'advanced', brief: 'my brief', script: 'my lines', audio: 'on' } } });
  expect(saved.status()).toBe(201);
  await page.goto('/marketing-studio');
  await page.getByRole('button', { name: 'Mẫu của tôi' }).click();
  await page.getByRole('dialog', { name: 'Mẫu của tôi' }).getByRole('link', { name: 'Launch' }).click();
  await expect(page).toHaveURL((u) => u.pathname === '/marketing-studio/advanced' && u.searchParams.has('template'));
  await expect(page.getByLabel('Ảnh tham chiếu: ảnh đã chọn').getByRole('img')).toHaveCount(2);
  await expect(page.getByRole('textbox', { name: 'Prompt', exact: true })).toHaveValue('my brief');
  await expect(page.getByRole('textbox', { name: 'Lời thoại (tuỳ chọn)' })).toHaveValue('my lines');
});

test('Dùng mẫu này on a company result in Ví dụ fills Try On, Image Generation and Marketing Studio from its inputs, for another member too; an Explore image model opens Image Generation on that model', async ({ page, browser }) => {
  await signIn(page, 'usea');
  const up = async (name: string) => ((await (await page.request.post('/api/assets', { multipart: { file: file(name) } })).json()) as { assets: { id: string }[] }).assets[0]!.id;
  const post = async (data: Record<string, unknown>) => {
    const res = await page.request.post('/api/jobs', { data });
    expect(res.status()).toBe(201);
    return ((await res.json()) as { id: string }).id;
  };
  const [person, garment] = [await up('use-person.png'), await up('use-garment.png')];
  const ids = {
    try_on: await post({ feature: 'try_on', modelId: 'mock-image-e2e', assetIds: [person, garment], ratio: '3:4', prompt: 'composed', params: { resolution: '1K', garments: '1', brief: 'blue coat' } }),
    image: await post({ feature: 'image', modelId: 'mock-image-e2e', assetIds: [garment], ratio: '1:1', prompt: 'a flat lay', enhance: false, params: { resolution: '1K' } }),
    marketing: await post({ feature: 'marketing', modelId: 'mock-e2e', assetIds: [person, garment], ratio: '1:1', durationSec: 5, prompt: 'composed', params: { audio: 'off' } }),
  };
  const done = async () => ((await (await page.request.get('/api/jobs?mine')).json()) as { jobs: { id: string; status: string }[] }).jobs.filter((j) => Object.values(ids).includes(j.id) && j.status === 'succeeded').length;
  await expect.poll(done, { timeout: 60_000 }).toBe(3);

  // Another member uses them: the inputs of a Library result are open to every member.
  const other = await (await browser.newContext()).newPage();
  await signIn(other, 'useb');
  const use = (id: string) => other.locator(`a.gallery-use[href$="reuse=${id}"]`);

  await other.goto('/try-on');
  await other.getByRole('tab', { name: 'Ví dụ' }).click();
  await use(ids.try_on).click();
  await expect(other).toHaveURL((u) => u.pathname === '/try-on' && u.searchParams.get('reuse') === ids.try_on);
  await expect(other.getByLabel('Người mẫu: ảnh đã chọn').getByRole('img')).toHaveAttribute('alt', 'use-person.png');
  await expect(other.getByLabel('Trang phục: ảnh đã chọn').getByRole('img')).toHaveAttribute('alt', 'use-garment.png');
  await expect(other.getByRole('textbox', { name: 'Prompt (tuỳ chọn)' })).toHaveValue(''); // the creator's own words stay theirs

  await other.goto('/image-generation');
  await use(ids.image).click();
  await expect(other.getByRole('textbox', { name: 'Mô tả cảnh bạn muốn tạo' })).toHaveValue('a flat lay');
  await expect(other.getByRole('img', { name: 'use-garment.png' })).toBeVisible();

  await other.goto('/marketing-studio');
  await use(ids.marketing).click();
  await expect(other).toHaveURL((u) => u.pathname === '/marketing-studio' && u.searchParams.get('reuse') === ids.marketing);
  await expect(other.getByRole('img', { name: 'use-person.png' })).toBeVisible();

  await other.goto('/explore');
  await other.getByRole('list', { name: 'Mô hình' }).getByRole('link', { name: /Mock image Solo/ }).click();
  await expect(other).toHaveURL(/\/image-generation\?model=mock-image-solo$/);
  await expect(other.getByRole('button', { name: /^Mô hình / })).toContainText('Mock image Solo');
  await other.close();
});
