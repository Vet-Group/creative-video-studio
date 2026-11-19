import { FEATURE_PROMPTS, PRODUCT_VIEWS } from '@cvs/core/models';
import { FEATURES } from '@cvs/db';
import { describe, expect, it } from 'vitest';
import { APP_ABOUT } from './about-content';
import { APPS, appBySlug, appInputs, appReason, type AppDraft, breedSwapPrompt, DEFAULT_VIEWS, DOG_BREEDS, filterApps, motionReason, runTotal, slotMax, splitImages, stockGroups, VIEW_LABELS, visibleApps } from './apps';

const img = (id: string) => ({ id });
const draft = (images: string[][], prompt = '', maxImages = 2): AppDraft => ({ images: images.map((l) => l.map(img)), prompt, models: [{ maxImages }], failed: false });
const reason = (slug: string, images: string[][], prompt?: string, maxImages?: number) => appReason(appBySlug(slug)!, draft(images, prompt, maxImages));

describe('the app list', () => {
  it('has fifteen apps with unique slugs, known features and (for the built image apps) a default prompt', () => {
    expect(APPS).toHaveLength(15);
    expect(new Set(APPS.map((a) => a.slug)).size).toBe(15);
    for (const a of APPS) {
      expect(FEATURES as readonly string[]).toContain(a.feature);
      if (!a.soon && a.feature !== 'motion_control' && a.feature !== 'media_optimizer' && a.feature !== 'fashion_model' && a.feature !== 'breed_swap' && a.slug !== 'smart-remake') expect(FEATURE_PROMPTS).toHaveProperty(a.feature);
    }
  });

  it('opens Smart Remake as a video app with its own page, no upload slot and the video feature (a remake is not a job)', () => {
    expect(appBySlug('smart-remake')).toMatchObject({ slots: [], feature: 'video', category: 'video' });
  });

  it('offers Smart Remake only when its flags are on: the first fourteen apps keep their places and it comes last', () => {
    expect(visibleApps(false)).toHaveLength(14);
    expect(visibleApps(false).map((a) => a.slug)).not.toContain('smart-remake');
    expect(visibleApps(true).at(-1)!.slug).toBe('smart-remake');
    expect(filterApps('all', '')).toHaveLength(14); // off unless asked for
    expect(filterApps('video', '').map((a) => a.slug)).toEqual(['motion-control']);
    expect(filterApps('all', '', true)).toHaveLength(15);
    expect(filterApps('video', '', true).map((a) => a.slug)).toEqual(['motion-control', 'smart-remake']);
    expect(filterApps('all', 'remake', true).map((a) => a.slug)).toEqual(['smart-remake']);
    expect(filterApps('all', 'remake')).toEqual([]);
  });

  it('opens the AI model generator as an app with its own page and no upload slot', () => {
    expect(appBySlug('ai-fashion-model')).toMatchObject({ slots: [], feature: 'fashion_model', category: 'fashion' });
  });

  it('opens Media Optimizer as a local image tool without a coming-soon badge', () => {
    expect(appBySlug('media-optimizer')).toMatchObject({ slots: [], feature: 'media_optimizer' });
    expect(appBySlug('media-optimizer')!.soon).toBeUndefined();
    expect(appBySlug('media-optimizer')!.description).toContain('Chưa hỗ trợ video');
    expect(APPS.filter((a) => a.soon)).toEqual([]);
  });

  it('gives the swaps and Face Swap two required slots, and the others the slots of the reference', () => {
    for (const slug of ['character-swap', 'model-swap', 'jewelry-try-on', 'lingerie-try-on', 'face-swap']) expect(appBySlug(slug)!.slots.map((s) => !!s.optional)).toEqual([false, false]);
    expect(appBySlug('background-changer')!.slots.map((s) => !!s.optional)).toEqual([false, true]);
    for (const slug of ['reframe', 'image-upscale', 'background-remover']) expect(appBySlug(slug)!.slots).toHaveLength(1);
    expect(appBySlug('reframe')).toMatchObject({ ratio: true });
    expect(appBySlug('image-upscale')).toMatchObject({ resolution: true });
    expect(appBySlug('jewelry-try-on')).toMatchObject({ resolution: true });
    expect(appBySlug('lingerie-try-on')).toMatchObject({ feature: 'lingerie_try_on', prompt: 'optional', ratio: true, resolution: true });
  });
});

describe('Lingerie Try-On pieces', () => {
  const lingerie = appBySlug('lingerie-try-on')!;
  it('takes the pieces first and the model last, as Jewelry Try-On does', () => {
    expect([slotMax(lingerie, 0, 4), slotMax(lingerie, 1, 4)]).toEqual([3, 1]);
    expect(reason('lingerie-try-on', [['a', 'b'], ['p']], '', 4)).toBeNull();
    expect(reason('lingerie-try-on', [[], ['p']], '', 4)).toBe('Tải lên ảnh: Đồ lót.');
    expect(appInputs(lingerie, { images: [[img('a')], [img('p')]], prompt: ' ren đen ' })).toEqual({ assetIds: ['a', 'p'], prompt: 'ren đen' });
    expect(splitImages(lingerie, ['a', 'b', 'p'])).toEqual([['a', 'b'], ['p']]);
  });
});

describe('stockGroups', () => {
  const have = new Set(['lingerie-model-m10.jpg', 'lingerie-model-m9.jpg', 'lingerie-model-m2.jpg.bak', 'jewelry-template-ear-02.jpg', 'jewelry-template-ear-01.jpg', 'jewelry-template-hand-01.png', 'app-lingerie-try-on.jpg']);
  it('lists the uploaded photos of each group in number order and leaves out the groups with none', () => {
    expect(stockGroups(appBySlug('lingerie-try-on')!.slots[1]!, have)).toEqual([{ label: undefined, names: ['lingerie-model-m9.jpg', 'lingerie-model-m10.jpg'] }]);
    expect(stockGroups(appBySlug('jewelry-try-on')!.slots[1]!, have)).toEqual([
      { label: 'Tai', names: ['jewelry-template-ear-01.jpg', 'jewelry-template-ear-02.jpg'] },
      { label: 'Tay', names: ['jewelry-template-hand-01.png'] },
    ]);
  });
  it('offers nothing for a slot without stock photos or when no sample exists', () => {
    expect(stockGroups(appBySlug('lingerie-try-on')!.slots[0]!, have)).toEqual([]);
    expect(stockGroups(appBySlug('lingerie-try-on')!.slots[1]!, new Set())).toEqual([]);
  });
});

describe('Jewelry Try-On pieces', () => {
  const jewelry = appBySlug('jewelry-try-on')!;
  it('takes as many pieces as the model allows beside the person, and one image in every other slot', () => {
    expect([slotMax(jewelry, 0, 4), slotMax(jewelry, 1, 4), slotMax(jewelry, 0, 2)]).toEqual([3, 1, 1]);
    expect(slotMax(appBySlug('face-swap')!, 0, 4)).toBe(1);
    expect(reason('jewelry-try-on', [['a', 'b', 'c'], ['p']], '', 4)).toBeNull();
    expect(reason('jewelry-try-on', [['a', 'b', 'c'], ['p']], '', 3)).toBe('Mô hình này nhận tối đa 3 ảnh.');
    expect(appInputs(jewelry, { images: [[img('a'), img('b')], [img('p')]], prompt: '' })).toEqual({ assetIds: ['a', 'b', 'p'] });
  });

  it('puts a reused job back in its slots: the pieces first, the person last', () => {
    expect(splitImages(jewelry, ['a', 'b', 'p'])).toEqual([['a', 'b'], ['p']]);
    expect(splitImages(jewelry, ['a', 'p'])).toEqual([['a'], ['p']]);
    expect(splitImages(jewelry, [])).toEqual([[], []]);
    expect(splitImages(appBySlug('face-swap')!, ['s', 't', 'x'])).toEqual([['s'], ['t']]);
  });
});

describe('the app About tabs', () => {
  it('has an About page for every built app and none for an app that is not built', () => {
    for (const a of APPS) expect(Object.hasOwn(APP_ABOUT, a.slug)).toBe(!a.soon);
    expect(Object.keys(APP_ABOUT)).toHaveLength(APPS.filter((a) => !a.soon).length);
  });
});

describe('filterApps', () => {
  it('filters by category and by name or description, ignoring accents and case', () => {
    expect(filterApps('all', '')).toHaveLength(14);
    expect(filterApps('all', '').at(-1)!.slug).toBe('breed-swap'); // ours comes after the live apps, which keep their order
    expect(filterApps('fashion', '').map((a) => a.slug)).toEqual(['character-swap', 'model-swap', 'face-swap', 'jewelry-try-on', 'lingerie-try-on', 'ai-fashion-model']);
    expect(filterApps('video', '').map((a) => a.slug)).toEqual(['motion-control']);
    expect(filterApps('all', 'DOI NEN').map((a) => a.slug)).toEqual(['background-changer']);
    expect(filterApps('all', 'xoá nền').map((a) => a.slug)).toContain('background-remover');
    expect(filterApps('photo', 'khuôn mặt')).toHaveLength(0);
    expect(filterApps('all', 'không có gì cả')).toHaveLength(0);
  });
});

describe('appReason', () => {
  it('waits for the models, reports a failed load, and says when no model is enabled', () => {
    const app = appBySlug('reframe')!;
    expect(appReason(app, { images: [[]], prompt: '', models: null, failed: false })).toBe('Đang tải danh sách mô hình...');
    expect(appReason(app, { images: [[]], prompt: '', models: [], failed: true })).toBe('Không tải được danh sách mô hình.');
    expect(appReason(app, { images: [[img('a')]], prompt: '', models: [], failed: false })).toBe('Ứng dụng này chưa được Admin bật');
  });

  it('asks for each required slot in order and lets a complete form run', () => {
    expect(reason('face-swap', [[], []])).toBe('Tải lên ảnh: Khuôn mặt nguồn.');
    expect(reason('face-swap', [['a'], []])).toBe('Tải lên ảnh: Ảnh đích.');
    expect(reason('face-swap', [['a'], ['b']])).toBeNull();
    expect(reason('background-remover', [[]])).toBe('Tải lên ảnh: Ảnh.');
    expect(reason('background-remover', [['a']])).toBeNull();
  });

  it('follows the Background Changer rule: a prompt with 1 image, or a reference image, not both, not neither', () => {
    expect(reason('background-changer', [['a'], []], '')).toBe('Nhập mô tả nền mới hoặc tải lên ảnh nền tham chiếu.');
    expect(reason('background-changer', [['a'], []], '   ')).toBe('Nhập mô tả nền mới hoặc tải lên ảnh nền tham chiếu.');
    expect(reason('background-changer', [['a'], []], 'a sunlit cafe')).toBeNull();
    expect(reason('background-changer', [['a'], ['b']], '')).toBeNull();
    expect(reason('background-changer', [['a'], ['b']], 'a sunlit cafe')).toBe('Chọn mô tả nền hoặc ảnh nền tham chiếu, không dùng cả hai.');
    expect(reason('background-changer', [[], ['b']], '')).toBe('Tải lên ảnh: Ảnh.');
  });

  it('refuses more images than the model takes', () => {
    expect(reason('character-swap', [['a'], ['b']], '', 1)).toBe('Mô hình này nhận tối đa 1 ảnh.');
  });
});

describe('Ảnh nhiều góc', () => {
  const app = appBySlug('multi-angle')!;
  it('takes one product photo and shows the views, starting with the back and both sides', () => {
    expect(app).toMatchObject({ feature: 'multi_angle', category: 'photo', views: true });
    expect(app.slots.map((s) => [s.label, !!s.optional, !!s.many])).toEqual([['Sản phẩm', false, false]]);
    expect(DEFAULT_VIEWS).toEqual(['back', 'left', 'right']);
    expect(DEFAULT_VIEWS.every((v) => PRODUCT_VIEWS.some((p) => p.id === v))).toBe(true);
    expect(Object.keys(VIEW_LABELS)).toEqual(PRODUCT_VIEWS.map((v) => v.id)); // a label for every view, in the same order
    expect(filterApps('photo', '').map((a) => a.slug)).toContain('multi-angle');
  });

  it('asks for the photo, then for at least one view', () => {
    const d = (images: string[], views: number): AppDraft => ({ images: [images.map(img)], prompt: '', models: [{ maxImages: 1 }], failed: false, views });
    expect(appReason(app, d([], 3))).toBe('Tải lên ảnh: Sản phẩm.');
    expect(appReason(app, d(['a'], 0))).toBe('Chọn ít nhất một góc.');
    expect(appReason(app, d(['a'], 1))).toBeNull();
    expect(appReason(appBySlug('reframe')!, draft([['a']]))).toBeNull(); // no other app asks for views
  });

  it('prices a Run as one job per view, with the 4 decimals of an estimate', () => {
    expect(runTotal('0.035', 3)).toBe('0.1050');
    expect(runTotal('0.0350', 6)).toBe('0.2100');
    expect(runTotal('0.0000', 2)).toBe('0.0000');
    expect(runTotal(undefined, 3)).toBeUndefined();
  });
});

describe('Đổi giống chó hàng loạt', () => {
  const app = appBySlug('breed-swap')!;
  it('takes one picture with a dog and shows the breeds, about two dozen of them, each once', () => {
    expect(app).toMatchObject({ feature: 'breed_swap', category: 'photo', breeds: true });
    expect(app.views).toBeUndefined();
    expect(app.slots.map((s) => [s.label, !!s.optional, !!s.many])).toEqual([['Ảnh gốc', false, false]]);
    expect(DOG_BREEDS.length).toBeGreaterThanOrEqual(24);
    expect(new Set(DOG_BREEDS).size).toBe(DOG_BREEDS.length);
    expect(DOG_BREEDS.slice(0, 3)).toEqual(['Golden Retriever', 'Labrador Retriever', 'French Bulldog']);
    expect(filterApps('photo', '').map((a) => a.slug)).toContain('breed-swap');
    expect(filterApps('all', 'giong cho').map((a) => a.slug)).toEqual(['breed-swap']);
  });

  it('asks for the picture, then for at least one breed', () => {
    const d = (images: string[], breeds: number): AppDraft => ({ images: [images.map(img)], prompt: '', models: [{ maxImages: 1 }], failed: false, breeds });
    expect(appReason(app, d([], 3))).toBe('Tải lên ảnh: Ảnh gốc.');
    expect(appReason(app, d(['a'], 0))).toBe('Chọn ít nhất một giống chó.');
    expect(appReason(app, d(['a'], 1))).toBeNull();
    expect(appReason(appBySlug('multi-angle')!, { ...d(['a'], 0), views: 1 })).toBeNull(); // no other app asks for breeds
  });

  it('writes one English prompt per breed that swaps only the dog and keeps the rest of the picture', () => {
    const pug = breedSwapPrompt('Pug');
    expect(pug).toMatch(/^Replace only the dog in the image with a Pug, /);
    expect(breedSwapPrompt('Australian Shepherd')).toMatch(/^Replace only the dog in the image with an Australian Shepherd, /);
    for (const kept of ['same pose', 'same size', 'same position', 'every text, name and number', 'the layout', 'the background', 'the product', 'the lighting', 'the art style', 'A photo stays a photo', 'an illustration stays an illustration', 'Do not add any text, logos or watermarks.']) {
      expect(pug).toContain(kept);
    }
    for (const breed of DOG_BREEDS) {
      const prompt = breedSwapPrompt(breed);
      expect(prompt).toContain(` ${breed}, `);
      expect(prompt).toMatch(/^[ -~]+$/); // English only, as the image models read best
      expect(prompt.replace(/ an? [^,]+, /, ' X, ')).toBe(pug.replace(/ an? [^,]+, /, ' X, ')); // only the breed differs
    }
  });
});

describe('appInputs', () => {
  it('lists the assets slot by slot', () => {
    expect(appInputs(appBySlug('face-swap')!, { images: [[img('a')], [img('b')]], prompt: '' })).toEqual({ assetIds: ['a', 'b'] });
  });

  it('sends the written prompt for the swaps and Background Changer, trimmed, and for no other app', () => {
    for (const slug of ['character-swap', 'model-swap']) {
      expect(appBySlug(slug)).toMatchObject({ prompt: 'optional' });
      expect(appInputs(appBySlug(slug)!, { images: [[img('a')], [img('b')]], prompt: ' keep the hat ' })).toEqual({ assetIds: ['a', 'b'], prompt: 'keep the hat' });
      expect(appInputs(appBySlug(slug)!, { images: [[img('a')], [img('b')]], prompt: '  ' })).toEqual({ assetIds: ['a', 'b'] });
      expect(reason(slug, [['a'], ['b']], 'keep the hat')).toBeNull();
    }
    expect(appInputs(appBySlug('face-swap')!, { images: [[img('a')], [img('b')]], prompt: 'ignored' })).toEqual({ assetIds: ['a', 'b'] });
    const bg = appBySlug('background-changer')!;
    expect(appInputs(bg, { images: [[img('a')], []], prompt: '  a sunlit cafe ' })).toEqual({ assetIds: ['a'], prompt: 'a sunlit cafe' });
    expect(appInputs(bg, { images: [[img('a')], [img('b')]], prompt: '' })).toEqual({ assetIds: ['a', 'b'] });
    expect(appInputs(appBySlug('reframe')!, { images: [[img('a')]], prompt: 'ignored' })).toEqual({ assetIds: ['a'] });
  });
});

describe('motionReason', () => {
  const model = { durationsSec: Array.from({ length: 28 }, (_, i) => i + 3) };
  const base = { image: true, videoMs: 5400, model, failed: false };
  it('asks for the steps in order, then checks the video length against the model', () => {
    expect(motionReason({ ...base, model: null })).toBe('Đang tải danh sách mô hình...');
    expect(motionReason({ ...base, failed: true })).toBe('Không tải được danh sách mô hình.');
    expect(motionReason({ ...base, model: undefined })).toBe('Ứng dụng này chưa được Admin bật');
    expect(motionReason({ ...base, image: false })).toBe('Tải lên ảnh: Nhân vật.');
    expect(motionReason({ ...base, videoMs: null })).toBe('Tải lên video chuyển động.');
    expect(motionReason({ ...base, videoMs: 1900 })).toBe('Video chuyển động phải dài từ 3 đến 30 giây.'); // rounds up to 2 s
    expect(motionReason({ ...base, videoMs: 30_100 })).toBe('Video chuyển động phải dài từ 3 đến 30 giây.'); // rounds up to 31 s
    expect(motionReason(base)).toBeNull();
    expect(motionReason({ ...base, videoMs: 30_000 })).toBeNull();
  });
  it('holds the orientation of the image to 10 s, and the orientation of the video to the model', () => {
    expect(motionReason({ ...base, videoMs: 12_000, orientation: 'image' })).toBe('Khi nhân vật giữ hướng của ảnh, video chuyển động chỉ dài tối đa 10 giây. Hãy cắt ngắn video hoặc chọn "Theo video".');
    expect(motionReason({ ...base, videoMs: 10_100, orientation: 'image' })).not.toBeNull(); // rounds up to 11 s
    expect(motionReason({ ...base, videoMs: 10_000, orientation: 'image' })).toBeNull();
    expect(motionReason({ ...base, videoMs: 12_000, orientation: 'video' })).toBeNull();
    expect(motionReason({ ...base, videoMs: 12_000 })).toBeNull();
  });
});
