import { expect, test } from 'vitest';
import { appBySlug, splitImages } from './apps';
import { alignInputs, asExample, exampleFrom, lostInputs, nothingNote, nothingRefilled, queryOf, refillFrom, reuseHref, skippedNote, tryOnSlots } from './reuse';

test('the reuse link opens the page that made the job, with the job to refill from; features without a refill yet get no link', () => {
  expect(reuseHref({ id: 'j1', feature: 'video' })).toBe('/create?reuse=j1');
  expect(reuseHref({ id: 'j2', feature: 'marketing' })).toBe('/marketing-studio?reuse=j2');
  expect(reuseHref({ id: 'j3', feature: 'try_on' })).toBe('/try-on?reuse=j3');
  expect(reuseHref({ id: 'j4', feature: 'image' })).toBe('/image-generation?reuse=j4');
  expect(reuseHref({ id: 'j5', feature: 'character_swap' })).toBe('/apps/character-swap?reuse=j5');
  expect(reuseHref({ id: 'j6', feature: 'background_changer' })).toBe('/apps/background-changer?reuse=j6');
  expect(reuseHref({ id: 'j 7', feature: 'video' })).toBe('/create?reuse=j%207');
  expect(reuseHref({ id: 'j8', feature: 'motion_control' })).toBe('/apps/motion-control?reuse=j8'); // its form refills since History saves it as a template
  expect(reuseHref({ id: 'j9', feature: 'media_optimizer' })).toBeNull(); // still to come
});

test('a page refills from a job (?reuse=) before a saved template (?template=), and from nothing otherwise', () => {
  expect(refillFrom({ reuse: 'j 1' })).toBe('/api/jobs/j%201');
  expect(refillFrom({ template: 't1' })).toBe('/api/templates/t1');
  expect(refillFrom({ reuse: 'j1', template: 't1' })).toBe('/api/jobs/j1');
  expect(refillFrom({ reuse: ['a', 'b'] })).toBeUndefined();
  expect(refillFrom({})).toBeUndefined();
});

test("Recreate on a sample reads that sample's details file, and nothing else", () => {
  expect(exampleFrom({ example: 'marketing-example-3' })).toBe('/api/samples/marketing-example-3.json');
  expect(['marketing-example-0', 'marketing-example-3.mp4', '../x', 'video-example-1', 'example-0', ['marketing-example-1']].map((example) => exampleFrom({ example }))).toEqual(Array(6).fill(undefined));
  expect(exampleFrom({ example: 'example-12' })).toBe('/api/samples/example-12.json'); // Create Videos' samples
  expect(exampleFrom({ example: 'try-on-example-4' })).toBe('/api/samples/try-on-example-4.json');
  expect(exampleFrom({ example: 'image-example-7' })).toBe('/api/samples/image-example-7.json'); // Image Generation's
  expect(exampleFrom({ example: 'jewelry-try-on-example-10' })).toBe('/api/samples/jewelry-try-on-example-10.json'); // the two Try-On apps'
  expect(exampleFrom({ example: 'lingerie-try-on-example-2' })).toBe('/api/samples/lingerie-try-on-example-2.json');
  expect(['jewelry-try-on-example-0', 'lingerie-try-on-example-1-model', 'jewelry-example-1', 'lingerie-try-on-example-01'].map((example) => exampleFrom({ example }))).toEqual(Array(4).fill(undefined)); // a photo of a sample, or another app
  expect(exampleFrom({})).toBeUndefined();
});

test('a refill that has to open on another page carries its source as that page query', () => {
  expect(queryOf(refillFrom({ reuse: 'j 1' })!)).toBe('reuse=j%201');
  expect(queryOf(refillFrom({ template: 't1' })!)).toBe('template=t1');
  expect(queryOf(exampleFrom({ example: 'marketing-example-2' })!)).toBe('example=marketing-example-2');
  expect(queryOf('/api/other/x')).toBe('');
});

test("a company example's photos come along, each marked as the example's, and the originals are untouched", () => {
  const images = [{ id: 'a1', filename: 'shirt.png' }, { id: 'a2', filename: 'model.png' }];
  expect(asExample(images)).toEqual([{ id: 'a1', filename: 'shirt.png', example: true }, { id: 'a2', filename: 'model.png', example: true }]);
  expect(images[0]).not.toHaveProperty('example');
  expect(asExample([])).toEqual([]);
});

test('a refill that left something out names each part with its reason, in one line', () => {
  expect(skippedNote(2, { lost: 1 })).toBe('Đã điền lại 2 ảnh và phần còn lại. Không dùng lại được: 1 ảnh đầu vào (đã bị xoá).');
  expect(skippedNote(1, { model: { label: 'Nano Banana', instead: 'Seedream' } })).toBe('Đã điền lại 1 ảnh và phần còn lại. Không dùng lại được: mô hình Nano Banana (đã tắt hoặc không còn dùng ở trang này, đã chọn Seedream).');
  expect(skippedNote(0, { model: { label: null, instead: null } })).toBe('Đã điền lại phần còn lại. Không dùng lại được: mô hình đã dùng (đã tắt hoặc không còn dùng ở trang này).');
  expect(skippedNote(1, { extra: { count: 2, max: 1 } })).toBe('Đã điền lại 1 ảnh và phần còn lại. Không dùng lại được: 2 ảnh thừa (chỗ này chỉ nhận 1 ảnh).');
  expect(skippedNote(3, { store: true })).toBe('Đã điền lại 3 ảnh và phần còn lại. Không dùng lại được: cửa hàng (đã bị ẩn).');
  expect(skippedNote(1, { lost: 1, extra: { count: 1, max: 2 }, store: true, model: { label: 'X', instead: 'Y' } })).toBe(
    'Đã điền lại 1 ảnh và phần còn lại. Không dùng lại được: mô hình X (đã tắt hoặc không còn dùng ở trang này, đã chọn Y); 1 ảnh đầu vào (đã bị xoá); 1 ảnh thừa (chỗ này chỉ nhận 2 ảnh); cửa hàng (đã bị ẩn).',
  );
  expect(skippedNote(2, {})).toBe(''); // nothing was left out: no note
  expect(skippedNote(2, { lost: 0 })).toBe('');
});

test('a refill has nothing to bring back only when every input photo is gone and the job has no words', () => {
  expect(nothingRefilled({ inputCount: 2, images: [], prompt: null, brief: ' ' })).toBe(true);
  expect(nothingRefilled({ inputCount: 2, images: [], prompt: 'a studio shot' })).toBe(false); // the words still come back
  expect(nothingRefilled({ inputCount: 2, images: [{}] })).toBe(false); // a photo still comes back
  expect(nothingRefilled({ inputCount: 0, images: [] })).toBe(false); // a job or a template without photos, or a sample (no count)
  expect(nothingRefilled({ images: [] })).toBe(false);
  expect(nothingNote(2, '/api/jobs/j1')).toBe('Không dùng lại được: 2 ảnh đầu vào đã bị xoá và lượt này không có mô tả. Biểu mẫu được giữ nguyên.');
  expect(nothingNote(1, '/api/templates/t1')).toBe('Không dùng lại được: 1 ảnh đầu vào đã bị xoá và thiết lập này không có mô tả. Biểu mẫu được giữ nguyên.');
});

test("the photos lost are the job's or the template's count less those that still exist, and none for a sample", () => {
  expect(lostInputs({ inputCount: 3, images: [{}, {}] })).toBe(1);
  expect(lostInputs({ inputCount: 2, images: [{}, {}] })).toBe(0);
  expect(lostInputs({ images: [{}] })).toBe(0);
});

test("a job's photos go back in the places it sent them, a deleted one as an empty place, and a sample's or a template's as they come", () => {
  const [a, c] = [{ id: 'a' }, { id: 'c' }];
  expect(alignInputs(['a', 'b', 'c'], [a, c])).toEqual([a, null, c]);
  expect(alignInputs(['a', 'b'], [])).toEqual([null, null]);
  expect(alignInputs(undefined, [a, c])).toEqual([a, c]);
  // An app's slots: the face swap's source deleted leaves the target in its own slot.
  expect(splitImages(appBySlug('face-swap')!, alignInputs(['s', 't'], [{ id: 't' }]))).toEqual([[null], [{ id: 't' }]]);
});

test('Try On with the person deleted refills the garments as garments and the background as the background, and leaves the person empty', () => {
  const [g1, g2, bg] = [{ id: 'g1' }, { id: 'g2' }, { id: 'bg' }];
  expect(tryOnSlots(['person', 'g1', 'g2', 'bg'], [g1, g2, bg], 2)).toEqual({ person: [], garments: [g1, g2], background: [bg] });
  expect(tryOnSlots(['p', 'g1', 'g2', 'bg'], [{ id: 'p' }, g1, bg], 2)).toEqual({ person: [{ id: 'p' }], garments: [g1], background: [bg] }); // a deleted garment
  expect(tryOnSlots(['p', 'g1'], [g1], null)).toEqual({ person: [], garments: [g1], background: [] }); // no garment count: all but the person
  expect(tryOnSlots(undefined, [{ id: 'p' }, g1, g2], null)).toEqual({ person: [{ id: 'p' }], garments: [g1, g2], background: [] }); // a sample or a template
});
