import { FEATURE_PROMPTS, PRODUCT_VIEWS } from '@cvs/core/models';
import { FEATURES } from '@cvs/db';
import { describe, expect, it } from 'vitest';
import { APP_ABOUT } from './about-content';
import { POSES } from './try-on-stock';
import { APPS, appBySlug, appInputs, appReason, type AppDraft, BATCH_FEATURES, breedSwapPrompt, cleanName, csvNames, DEFAULT_VIEWS, DOG_BREEDS, filterApps, isBatchId, itemLabel, itemPrompt, jobImages, MAX_POSES, MOCKUP_PRODUCTS, mockupPrompt, motionReason, nameColumn, nameOk, nameSwapPrompt, OWN_POSE, parseNames, PET_STYLES, petPortraitPrompt, posePrompt, runTotal, slotMax, splitImages, stockGroups, unsentPicks, VIEW_LABELS, visibleApps } from './apps';

const img = (id: string) => ({ id });
const draft = (images: string[][], prompt = '', maxImages = 2): AppDraft => ({ images: images.map((l) => l.map(img)), prompt, models: [{ maxImages }], failed: false });
const reason = (slug: string, images: string[][], prompt?: string, maxImages?: number) => appReason(appBySlug(slug)!, draft(images, prompt, maxImages));

describe('the app list', () => {
  it('has nineteen apps with unique slugs, known features and (for the built image apps) a default prompt', () => {
    expect(APPS).toHaveLength(19);
    expect(new Set(APPS.map((a) => a.slug)).size).toBe(19);
    for (const a of APPS) {
      expect(FEATURES as readonly string[]).toContain(a.feature);
      if (!a.soon && a.feature !== 'motion_control' && a.feature !== 'media_optimizer' && a.feature !== 'fashion_model' && !['breed_swap', 'pet_portrait', 'mockup_pack', 'name_swap', 'pose_generator'].includes(a.feature) && a.slug !== 'smart-remake') expect(FEATURE_PROMPTS).toHaveProperty(a.feature);
    }
  });

  it('opens Smart Remake as a video app with its own page, no upload slot and the video feature (a remake is not a job)', () => {
    expect(appBySlug('smart-remake')).toMatchObject({ slots: [], feature: 'video', category: 'video' });
  });

  it('offers Smart Remake only when its flags are on: the first eighteen apps keep their places and it comes last', () => {
    expect(visibleApps(false)).toHaveLength(18);
    expect(visibleApps(false).map((a) => a.slug)).not.toContain('smart-remake');
    expect(visibleApps(true).at(-1)!.slug).toBe('smart-remake');
    expect(filterApps('all', '')).toHaveLength(18); // off unless asked for
    expect(filterApps('video', '').map((a) => a.slug)).toEqual(['motion-control']);
    expect(filterApps('all', '', true)).toHaveLength(19);
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
    // A bulk app's first slot takes a Run's worth of photos, one per job; its reference slot still one.
    expect([slotMax(appBySlug('background-changer')!, 0, 2), slotMax(appBySlug('background-changer')!, 1, 2), slotMax(appBySlug('image-upscale')!, 0, 1)]).toEqual([25, 1, 25]);
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
    expect(filterApps('all', '')).toHaveLength(18);
    expect(filterApps('all', '').at(-1)!.slug).toBe('pose-generator'); // ours comes after the live apps, which keep their order
    expect(filterApps('fashion', '').map((a) => a.slug)).toEqual(['character-swap', 'model-swap', 'face-swap', 'jewelry-try-on', 'lingerie-try-on', 'ai-fashion-model', 'pose-generator']);
    expect(filterApps('video', '').map((a) => a.slug)).toEqual(['motion-control']);
    expect(filterApps('all', 'DOI NEN').map((a) => a.slug)).toEqual(['background-changer']);
    expect(filterApps('all', 'xoá nền').map((a) => a.slug)).toContain('background-remover');
    expect(filterApps('photo', 'khuôn mặt')).toHaveLength(0);
    expect(filterApps('all', 'không có gì cả')).toHaveLength(0);
  });

  it('finds an app by the English name staff use', () => {
    expect(filterApps('all', 'swap').map((a) => a.slug)).toEqual(['character-swap', 'model-swap', 'face-swap', 'breed-swap', 'name-swap']);
    expect(filterApps('all', 'Try On').map((a) => a.slug)).toEqual(['jewelry-try-on', 'lingerie-try-on']);
    expect(filterApps('all', 'try-on').map((a) => a.slug)).toEqual(['jewelry-try-on', 'lingerie-try-on']);
    expect(filterApps('all', 'upscale').map((a) => a.slug)).toEqual(['image-upscale']);
    expect(filterApps('all', 'pose').map((a) => a.slug)).toEqual(['pose-generator']);
    expect(filterApps('fashion', 'model poses').map((a) => a.slug)).toEqual(['pose-generator']);
    expect(filterApps('all', 'thu do').map((a) => a.slug)).toEqual(['jewelry-try-on', 'lingerie-try-on', 'ai-fashion-model']);
  });
});

describe('unsentPicks', () => {
  it('keeps picked only the items of the jobs a stopped batch Run did not send', () => {
    const runs = [{ breed: 'Pug' }, { breed: 'Boxer' }, { breed: 'Beagle' }];
    expect(unsentPicks(runs, 1)).toEqual({ view: [], breed: ['Boxer', 'Beagle'], style: [], product: [], name: [], pose: [], poseText: [], left: [] });
    expect(unsentPicks([{ view: 'back' }, { view: 'left' }], 1)).toMatchObject({ view: ['left'], left: [] });
    expect(unsentPicks([{ name: 'Max' }, { name: 'Bella' }], 1)).toMatchObject({ name: ['Bella'], breed: [], left: [] });
  });

  it('keeps the poses and the own words of the pose generator that were not sent, and drops the sent ones', () => {
    const runs = [{ pose: 'front' }, { pose: 'kneel' }, { poseText: 'ngồi trên ghế gỗ' }];
    expect(unsentPicks(runs, 1)).toMatchObject({ pose: ['kneel'], poseText: ['ngồi trên ghế gỗ'], left: [] });
    expect(unsentPicks(runs, 2)).toMatchObject({ pose: [], poseText: ['ngồi trên ghế gỗ'], left: [] });
    expect(unsentPicks(runs, 3)).toMatchObject({ pose: [], poseText: [], left: [] });
  });

  it('drops a name whose breeds were partly sent and names its jobs not sent instead, so nothing is sent twice', () => {
    const runs = ['Max', 'Bella'].flatMap((name) => ['Pug', 'Boxer'].map((breed) => ({ name, breed })));
    expect(unsentPicks(runs, 1)).toEqual({ view: [], breed: ['Pug', 'Boxer'], style: [], product: [], name: ['Bella'], pose: [], poseText: [], left: [{ name: 'Max', breed: 'Boxer' }] });
    expect(unsentPicks(runs, 2)).toMatchObject({ name: ['Bella'], breed: ['Pug', 'Boxer'], left: [] });
    expect(unsentPicks(runs, 3)).toEqual({ view: [], breed: [], style: [], product: [], name: [], pose: [], poseText: [], left: [{ name: 'Bella', breed: 'Boxer' }] });
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
    expect(reason('face-swap', [['a'], []])).toBe('Tải lên ảnh: Ảnh cần đổi khuôn mặt.');
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

  it("counts one photo of a bulk app's first slot per job, so many photos fit a model that takes one or two", () => {
    expect(reason('background-remover', [['a', 'b', 'c']], '', 1)).toBeNull();
    expect(reason('background-changer', [['a', 'b', 'c'], ['r']], '', 2)).toBeNull();
    expect(reason('background-changer', [['a', 'b'], ['r']], '', 1)).toBe('Mô hình này nhận tối đa 1 ảnh.');    // The model choice counts the same way, so two photos do not lock a one-image model.
    expect(jobImages(appBySlug('background-remover')!, [[img('a'), img('b')]])).toBe(1);
    expect(jobImages(appBySlug('background-changer')!, [[img('a'), img('b')], [img('r')]])).toBe(2);
    expect(jobImages(appBySlug('face-swap')!, [[img('a')], [img('b')]])).toBe(2);
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
    expect(filterApps('all', 'giong cho').map((a) => a.slug)).toEqual(['breed-swap', 'name-swap']) // name swap can change the breed too;
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

describe('Chân dung thú cưng', () => {
  const app = appBySlug('pet-portrait')!;
  const d = (images: string[], styles: number): AppDraft => ({ images: [images.map(img)], prompt: '', models: [{ maxImages: 1 }], failed: false, styles });
  it('takes one pet photo and shows eight print styles, each once', () => {
    expect(app).toMatchObject({ feature: 'pet_portrait', category: 'photo', styles: true });
    expect(app.slots.map((s) => [s.label, !!s.optional, !!s.many])).toEqual([['Thú cưng', false, false]]);
    expect(PET_STYLES.map((s) => s.id)).toEqual(['watercolor', 'cartoon', 'line-art', 'royal', 'pop-art', 'flat-vector', 'pencil', 'oil']);
    expect(new Set(PET_STYLES.map((s) => s.label)).size).toBe(8);
    expect(filterApps('all', 'chan dung thu cung').map((a) => a.slug)).toEqual(['pet-portrait']);
  });

  it('asks for the photo, then for at least one style', () => {
    expect(appReason(app, d([], 2))).toBe('Tải lên ảnh: Thú cưng.');
    expect(appReason(app, d(['a'], 0))).toBe('Chọn ít nhất một phong cách.');
    expect(appReason(app, d(['a'], 3))).toBeNull();
  });

  it('writes one English prompt per style that keeps the likeness, one centred pet on pure white, no text or frame', () => {
    const water = petPortraitPrompt('watercolor');
    expect(water).toMatch(/^Turn the pet in the photo into a print-ready design in this style: a soft watercolor painting/);
    for (const kept of ['face, markings, coat colors and pattern, eye color and ear shape', 'this one pet only, centered', 'plain pure white background', 'No text', 'no frame', 'no watermark', 'ready to print']) {
      expect(water).toContain(kept);
    }
    for (const s of PET_STYLES) {
      const prompt = petPortraitPrompt(s.id);
      expect(prompt).toContain(`style: ${s.look}. `);
      expect(prompt).toMatch(/^[ -~]+$/); // English only, as the image models read best
      expect(prompt.replace(s.look, 'X')).toBe(water.replace(PET_STYLES[0]!.look, 'X')); // only the style differs
    }
  });
});

describe('Mockup hàng loạt', () => {
  const app = appBySlug('mockup-pack')!;
  const d = (design: string[], blank: string[], products: number): AppDraft => ({ images: [design.map(img), blank.map(img)], prompt: '', models: [{ maxImages: 2 }], failed: false, products });
  it('takes the design and an optional blank product photo, and shows six products', () => {
    expect(app).toMatchObject({ feature: 'mockup_pack', category: 'photo', products: true });
    expect(app.slots.map((s) => [s.label, !!s.optional, !!s.many])).toEqual([['Thiết kế', false, false], ['Sản phẩm trơn (tuỳ chọn)', true, false]]);
    expect(MOCKUP_PRODUCTS.map((p) => p.id)).toEqual(['round-rug', 'ornament', 'tshirt', 'mug', 'blanket', 'canvas']);
  });

  it('asks for the design and a product, and takes only one product with a blank, the one the blank shows', () => {
    expect(appReason(app, d([], [], 1))).toBe('Tải lên ảnh: Thiết kế.');
    expect(appReason(app, d(['a'], [], 0))).toBe('Chọn ít nhất một sản phẩm.');
    expect(appReason(app, d(['a'], [], 6))).toBeNull();
    expect(appReason(app, d(['a'], ['b'], 2))).toBe('Có ảnh sản phẩm trơn thì chỉ chọn một sản phẩm: đúng loại trong ảnh đó.');
    expect(appReason(app, d(['a'], ['b'], 1))).toBeNull();
    expect(appReason(app, d(['a'], ['b'], 0))).toBe('Chọn ít nhất một sản phẩm.');
  });

  it('writes one English prompt per product that keeps the design exact, in its scene or on the blank as it is', () => {
    const mug = mockupPrompt('mug', false);
    expect(mug).toMatch(/^Make a realistic product photo of a white 11 oz ceramic mug standing on a wooden table/);
    expect(mug).toContain('Use the design exactly as it is: the same colors, text and spelling, layout and proportions, not redrawn, cropped, mirrored or added to.');
    expect(mug).toContain("Keep the product's real shape and proportions");
    const onBlank = mockupPrompt('mug', true);
    expect(onBlank).toMatch(/^Put the design from the first image on the white 11 oz ceramic mug in the second image\. Keep that product exactly as it is: its shape, size, color, material, angle, background and lighting\./);
    expect(onBlank).toContain('not redrawn, cropped, mirrored or added to.');
    for (const p of MOCKUP_PRODUCTS) for (const blank of [false, true]) expect(mockupPrompt(p.id, blank)).toMatch(/^[ -~]+$/);
    expect(new Set(MOCKUP_PRODUCTS.map((p) => mockupPrompt(p.id, false))).size).toBe(6);
  });
});

describe('Đổi tên hàng loạt', () => {
  const app = appBySlug('name-swap')!;
  const d = (names: string, breeds = 0): AppDraft => ({ images: [[img('a')]], prompt: '', models: [{ maxImages: 1 }], failed: false, names, breeds });
  it('takes one design with a name and shows the names box and the breeds', () => {
    expect(app).toMatchObject({ feature: 'name_swap', category: 'photo', names: true });
    expect(app.breeds).toBeUndefined();
    expect(app.slots.map((s) => [s.label, !!s.optional])).toEqual([['Thiết kế có tên', false]]);
  });

  it('cleans the names, one per line: trimmed, NFC, single spaces, blank lines and repeats dropped', () => {
    expect(parseNames(' Max \n\n  Bella\r\nMax\nMary   Jane\n')).toEqual({ names: ['Max', 'Bella', 'Mary Jane'], problem: null });
    const nfd = 'Nguyễn'; // Nguyễn typed with combining marks
    expect(parseNames(nfd).names).toEqual(['Nguyễn']);
    expect(cleanName(nfd)).toBe('Nguyễn');
    expect(parseNames('')).toEqual({ names: [], problem: 'Nhập ít nhất một tên.' });
    expect(parseNames(' \n \n').problem).toBe('Nhập ít nhất một tên.');
  });

  it('takes Vietnamese and Latin letters with their accents, digits, spaces, apostrophes and hyphens, up to 20 characters', () => {
    for (const ok of ['Đức', 'Nguyễn Thị Ánh', 'Phở', 'José', 'Zoë', 'Søren', "O'Brien", 'D’Arcy', 'Mary-Jane', 'K9', 'Bé Na 2', 'x'.repeat(20), 'Ưng Hoàng Phúc']) {
      expect([ok, nameOk(ok), parseNames(ok).problem]).toEqual([ok, true, null]);
    }
  });

  it('refuses emoji, symbols, quotes, other scripts, punctuation alone and names over 20 characters', () => {
    expect(parseNames('Max 🐶').problem).toBe('Tên "Max 🐶" chỉ được có chữ cái, chữ số, khoảng trắng, dấu nháy đơn và gạch nối.');
    for (const bad of ['1️⃣', '❤', 'Max!', '"Max"', 'Max & Bella', 'a.b', '小明', 'Борис', '--', "'", 'Max\tBella​', '<b>']) expect([bad, nameOk(cleanName(bad))]).toEqual([bad, false]);
    expect(parseNames('x'.repeat(21)).problem).toBe(`Tên "${'x'.repeat(21)}" dài quá 20 ký tự.`);
    expect(parseNames('Bella\nMax 🐶\nLuna').problem).toMatch(/^Tên "Max 🐶"/); // the first wrong name is named
  });

  it('takes at most 25 names, and at most 25 pictures with the breeds', () => {
    const many = (n: number) => Array.from({ length: n }, (_, i) => `Name ${i + 1}`).join('\n');
    expect(parseNames(many(25)).problem).toBeNull();
    expect(parseNames(many(26)).problem).toBe('Tối đa 25 tên mỗi lần chạy, đang có 26.');
    expect(parseNames(`${many(25)}\nName 1`).problem).toBeNull(); // a repeat is not counted
    expect(appReason(app, d(''))).toBe('Nhập ít nhất một tên.');
    expect(appReason(app, d(many(25)))).toBeNull();
    expect(appReason(app, d(many(5), 5))).toBeNull();
    expect(appReason(app, d(many(5), 6))).toBe('Tối đa 25 ảnh mỗi lần chạy, đang là 30: bớt tên hoặc giống chó.');
    expect(appReason(app, d('Max 🐶', 1))).toMatch(/^Tên "Max 🐶"/);
  });

  it("picks a CSV's column of names: a pet's name first, then one called name or tên, then one with either in it, else the first", () => {
    expect(nameColumn(['Name', 'Email', 'Lineitem name', 'Pet Name'])).toBe(3); // a Shopify export's Name is the order number
    expect(nameColumn(['Order', "Pet's name (engraving)"])).toBe(1);
    expect(nameColumn(['Mã đơn', 'Tên thú cưng'])).toBe(1);
    expect(nameColumn(['Email', ' NAME ', 'Billing Name'])).toBe(1);
    expect(nameColumn(['Mã đơn', 'Tên'])).toBe(1);
    expect(nameColumn(['Order', 'Billing Name'])).toBe(1);
    expect(nameColumn(['Order', 'Email'])).toBe(0);
  });

  it("takes a CSV column's names through the box's rules: cleaned, blanks and repeats dropped, bad ones listed, the first 25 kept", () => {
    const rows = [['Name', 'Pet Name'], ['#1001', ' Max '], ['#1002', ''], ['#1003', 'Max'], ['#1004', 'Mary\nJane'], ['#1005', 'Max 🐶'], ['#1006', 'Nguyễn Ánh'], ['#1007']];
    expect(csvNames(rows, 1)).toEqual({ names: ['Max', 'Mary Jane', 'Nguyễn Ánh'], invalid: ['Max 🐶'], over: 0 });
    expect(csvNames(rows, 0)).toEqual({ names: [], invalid: ['#1001', '#1002', '#1003', '#1004', '#1005', '#1006', '#1007'], over: 0 });
    const many = [['Pet Name'], ...Array.from({ length: 30 }, (_, i) => [`Dog ${i + 1}`])];
    expect(csvNames(many, 0)).toEqual({ names: Array.from({ length: 25 }, (_, i) => `Dog ${i + 1}`), invalid: [], over: 5 });
  });

  it('writes one English prompt per name that swaps only the name, and with a breed the dog too', () => {
    const max = nameSwapPrompt('Max');
    expect(max).toMatch(/^Replace only the personalized name in the image with the name "Max", spelled exactly like that, letter for letter, with every accent mark\. /);
    for (const kept of ['same font, size, color, outline, curve and position', 'keep it centered on the same spot', 'the artwork, every other text and number, the layout', 'Do not add any other text, logos or watermarks.']) expect(max).toContain(kept);
    expect(max).not.toContain('dog');
    expect(max).toMatch(/^[ -~]+$/);
    expect(nameSwapPrompt('Nguyễn Ánh')).toContain('with the name "Nguyễn Ánh", ');
    const withBreed = nameSwapPrompt('Max', 'Australian Shepherd');
    expect(withBreed).toContain('Also replace the dog with an Australian Shepherd, with the coat, colours and markings typical of the breed, in the same pose,');
    expect(withBreed.replace(/Also replace the dog [^.]+\. /, '')).toBe(max);
  });
});

describe('Tạo tư thế người mẫu', () => {
  const app = appBySlug('pose-generator')!;
  const d = (images: string[], poses: number): AppDraft => ({ images: [images.map(img)], prompt: '', models: [{ maxImages: 2 }], failed: false, poses });
  it('takes one photo of the model, which may be a saved AI model, among the fashion apps', () => {
    expect(app).toMatchObject({ feature: 'pose_generator', category: 'fashion', poses: true });
    expect(app.slots.map((s) => [s.label, s.empty, !!s.optional, !!s.aiModels])).toEqual([['Người mẫu', 'Ảnh người mẫu (rõ mặt, thấy người)', false, true]]);
    expect(MAX_POSES).toBe(4);
  });

  it('asks for the photo, then for a pose, and holds a Run to four poses, the own words counted', () => {
    expect(appReason(app, d([], 2))).toBe('Tải lên ảnh: Người mẫu.');
    expect(appReason(app, d(['a'], 0))).toBe('Chọn ít nhất một tư thế, hoặc tự tả một tư thế.');
    expect(appReason(app, d(['a'], 4))).toBeNull();
    expect(appReason(app, d(['a'], 5))).toBe('Tối đa 4 tư thế mỗi lần chạy, đang là 5: bỏ bớt một tư thế.');
  });

  it('writes one English prompt per pose that keeps the person, the outfit, the light and the background, and only the pose words differ', () => {
    const front = posePrompt(POSES[0]!.words);
    for (const kept of ["Keep the person's face, identity, hair, skin, body shape and outfit, and the photo's lighting and background, exactly unchanged", 'show the same person in this pose and framing: standing straight', 'Photorealistic, with the same camera quality as the photo', 'Do not add any text']) {
      expect(front).toContain(kept);
    }
    for (const p of POSES) expect(posePrompt(p.words).replace(p.words, 'X')).toBe(front.replace(POSES[0]!.words, 'X'));
    expect(front).toMatch(/^[ -~]+$/); // English only; the member's own words are theirs
  });
});

describe('the batch apps', () => {
  it('title each job with its item, and give each app that writes its own prompt the prompt of an item', () => {
    expect(itemLabel({ view: 'back' })).toBe('Mặt sau');
    expect(itemLabel({ breed: 'Pug' })).toBe('Pug');
    expect(itemLabel({ style: 'royal' })).toBe('Chân dung hoàng gia');
    expect(itemLabel({ product: 'mug' })).toBe('Cốc sứ 11 oz');
    expect(itemLabel({ name: 'Max', breed: 'Pug' })).toBe('Max · Pug');
    expect(itemLabel({ name: 'Max', breed: null })).toBe('Max');
    expect(itemLabel({ pose: 'hand-on-hip' })).toBe('Tay chống hông');
    expect(itemLabel({ pose: null, poseText: 'ngồi trên ghế gỗ' })).toBe(OWN_POSE);
    expect(itemLabel({ pose: 'no-such-pose' })).toBeNull();
    expect(itemLabel({ view: null, breed: null, style: null, product: null, name: null, pose: null, poseText: null })).toBeNull();
    expect(itemPrompt('breed_swap', { breed: 'Pug' })).toBe(breedSwapPrompt('Pug'));
    expect(itemPrompt('pet_portrait', { style: 'oil' })).toBe(petPortraitPrompt('oil'));
    expect(itemPrompt('mockup_pack', { product: 'canvas' }, true)).toBe(mockupPrompt('canvas', true));
    expect(itemPrompt('name_swap', { name: 'Max', breed: 'Pug' })).toBe(nameSwapPrompt('Max', 'Pug'));
    expect(itemPrompt('pose_generator', { pose: 'kneel' })).toBe(posePrompt('kneeling on one knee and facing the camera, full body'));
    expect(itemPrompt('pose_generator', { poseText: 'ngồi trên ghế gỗ' })).toBe(posePrompt('ngồi trên ghế gỗ'));
    expect(itemPrompt('multi_angle', { view: 'back' })).toBeUndefined();
    expect(itemPrompt('reframe', {})).toBeUndefined();
  });

  it('are the apps that pick items or take many photos, and their Run id is a UUID', () => {
    expect(APPS.filter((a) => a.views || a.breeds || a.styles || a.products || a.names || a.poses || a.bulk).map((a) => a.feature).sort()).toEqual([...BATCH_FEATURES].sort());
    expect(APPS.filter((a) => a.bulk).map((a) => a.slug)).toEqual(['background-changer', 'image-upscale', 'background-remover']);
    expect(isBatchId('7d0e2f54-3c55-4a0e-9a59-2f3f0c8b1a11')).toBe(true);
    for (const bad of ['', 'batch-1', '7D0E2F54-3C55-4A0E-9A59-2F3F0C8B1A11', '7d0e2f54-3c55-4a0e-9a59-2f3f0c8b1a11 ']) expect(isBatchId(bad)).toBe(false);
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
