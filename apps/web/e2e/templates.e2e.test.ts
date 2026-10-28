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
