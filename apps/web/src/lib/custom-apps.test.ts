import { describe, expect, test } from 'vitest';
import { type AppFields, appInputProblem, canOfferApp, cleanApp, composeAssetIds, draftFromJob, hasDuplicate, type SourceJob, toAppConfig } from './custom-apps';

const job = (over: Partial<SourceJob> = {}): SourceJob => ({ feature: 'video', presetId: null, prompt: '  own prompt  ', enhancedPrompt: null, ratio: '9:16', durationSec: 5, params: {}, inputCount: 2, ...over });

describe('draftFromJob', () => {
  test('refuses a feature other than video or image, with its own reason', () => {
    expect(draftFromJob(job({ feature: 'try_on' }))).toMatch(/video hoặc ảnh/);
  });

  test('refuses a job with no input', () => {
    expect(draftFromJob(job({ inputCount: 0 }))).toMatch(/không có ảnh đầu vào/);
  });

  test('refuses a preset or a style, and a brand kit', () => {
    expect(draftFromJob(job({ presetId: 'gentle-push-in' }))).toMatch(/mẫu chuyển động hoặc phong cách/);
    expect(draftFromJob(job({ feature: 'image', presetId: 'style-1' }))).toMatch(/mẫu chuyển động hoặc phong cách/);
    expect(draftFromJob(job({ params: { brand: 'on' } }))).toMatch(/bộ nhận diện/);
  });

  test('refuses an end frame, reference audio and a reference video', () => {
    for (const key of ['endAssetId', 'audioAssetIds', 'videoAssetId']) expect(draftFromJob(job({ params: { [key]: 'a1' } }))).toMatch(/khung hình cuối/);
  });

  test('takes the enhanced prompt over the plain one, trimmed', () => {
    expect(draftFromJob(job({ enhancedPrompt: ' enhanced ' }))).toMatchObject({ prompt: 'enhanced' });
    expect(draftFromJob(job())).toMatchObject({ prompt: 'own prompt' });
  });

  test('keeps only the params an app runs with, and a default slot for each input', () => {
    expect(draftFromJob(job({ params: { audio: 'on', hookText: 'x', batch: 'b' } }))).toEqual({
      feature: 'video', prompt: 'own prompt', aspect: '9:16', durationS: 5, params: { audio: 'on' }, inputs: [{ slot: { label: 'Ảnh 1', hint: '' } }, { slot: { label: 'Ảnh 2', hint: '' } }],
    });
    expect(draftFromJob(job({ feature: 'image', durationSec: 0, inputCount: 1, params: { resolution: '2K', quality: 'high', thinking: 'high', brief: 'x', batch: 'b' } }))).toMatchObject({
      feature: 'image', durationS: 0, params: { resolution: '2K', quality: 'high', thinking: 'high' },
    });
  });
});

describe('canOfferApp', () => {
  test('is true for a video or image with inputs, no preset and no brand', () => {
    const ok = { inputCount: 1, presetId: null, brand: false };
    expect(canOfferApp('video', ok)).toBe(true);
    expect(canOfferApp('image', ok)).toBe(true);
    expect(canOfferApp('try_on', ok)).toBe(false);
    expect(canOfferApp('video', { ...ok, inputCount: 0 })).toBe(false);
    expect(canOfferApp('video', { ...ok, presetId: 'p' })).toBe(false);
    expect(canOfferApp('video', { ...ok, brand: true })).toBe(false);
  });
});

describe('appInputProblem', () => {
  const ok = (): AppFields => ({ name: ' Video xoay ', description: '', category: 'video', prompt: ' xoay sản phẩm ', inputs: [{ slot: { label: ' Ảnh sản phẩm ', hint: '' } }, { fixed: true }] });
  const problem = (over: Partial<AppFields>, count = 2, max = 100) => appInputProblem({ ...ok(), ...over }, count, max);

  test('accepts valid fields, trimming first', () => {
    expect(problem({})).toBeNull();
    expect(problem({ name: ` ${'x'.repeat(60)} ` })).toBeNull();
  });

  test('holds the name to 1 to 60 characters on one line', () => {
    expect(problem({ name: '  ' })).toMatch(/tên ứng dụng/);
    expect(problem({ name: 'x'.repeat(61) })).toMatch(/tên ứng dụng/);
    expect(problem({ name: 'a\nb' })).toMatch(/tên ứng dụng/);
    expect(problem({ name: '😀'.repeat(60) })).toBeNull(); // characters, not UTF-16 units
  });

  test('holds the description to 200 characters', () => {
    expect(problem({ description: 'x'.repeat(200) })).toBeNull();
    expect(problem({ description: 'x'.repeat(201) })).toMatch(/200/);
  });

  test('takes only a category of the Apps page', () => {
    expect(problem({ category: 'all' })).toMatch(/danh mục/);
    expect(problem({ category: 'misc' })).toMatch(/danh mục/);
    for (const c of ['fashion', 'photo', 'video', 'utility']) expect(problem({ category: c })).toBeNull();
  });

  test('holds the prompt to 1 character up to the limit, a newline allowed', () => {
    expect(problem({ prompt: ' ' })).toMatch(/mô tả gửi cho mô hình/i);
    expect(problem({ prompt: 'a\nb' })).toBeNull();
    expect(problem({ prompt: 'x'.repeat(100) })).toBeNull();
    expect(problem({ prompt: 'x'.repeat(101) })).toMatch(/tối đa 100 ký tự/);
    expect(problem({ prompt: '😀'.repeat(51) })).toMatch(/tối đa 100 ký tự/); // UTF-16 units, as /api/jobs counts them
  });

  test('refuses a NUL in the prompt or the description', () => {
    expect(problem({ prompt: 'a\u0000b' })).toMatch(/không hợp lệ/);
    expect(problem({ description: 'a\u0000b' })).toMatch(/không hợp lệ/);
  });

  test('needs one entry per source input and at least one slot', () => {
    expect(problem({}, 3)).toMatch(/đúng 3 ảnh/);
    expect(problem({ inputs: [{ fixed: true }, { fixed: true }] })).toMatch(/ít nhất một ô/);
  });

  test('holds a slot label to 1 to 40 characters and a hint to 100', () => {
    expect(problem({ inputs: [{ slot: { label: ' ', hint: '' } }, { fixed: true }] })).toMatch(/Tên ô/);
    expect(problem({ inputs: [{ slot: { label: 'x'.repeat(41), hint: '' } }, { fixed: true }] })).toMatch(/Tên ô/);
    expect(problem({ inputs: [{ slot: { label: 'x'.repeat(40), hint: 'y'.repeat(100) } }, { fixed: true }] })).toBeNull();
    expect(problem({ inputs: [{ slot: { label: 'a', hint: 'y'.repeat(101) } }, { fixed: true }] })).toMatch(/Gợi ý/);
  });

  test('refuses two slots with the same label, after trimming and ignoring case', () => {
    const two = (a: string, b: string) => ({ inputs: [{ slot: { label: a, hint: '' } }, { slot: { label: b, hint: '' } }] });
    expect(problem(two(' Ảnh ', 'ảnh'))).toBe('Hai ô không được trùng tên.');
    expect(problem(two('Ảnh 1', 'Ảnh 2'))).toBeNull();
    expect(problem(two('Ảnh'.normalize('NFC'), 'Ảnh'.normalize('NFD')))).toBe('Hai ô không được trùng tên.'); // the same word typed in combining form
  });
});

test('cleanApp trims the text and leaves a fixed input as it is', () => {
  expect(cleanApp({ name: ' a ', description: ' b ', category: 'video', prompt: ' c ', inputs: [{ slot: { label: ' d ', hint: ' e ' } }, { fixed: 'asset-1' }] })).toEqual({
    name: 'a', description: 'b', category: 'video', prompt: 'c', inputs: [{ slot: { label: 'd', hint: 'e' } }, { fixed: 'asset-1' }],
  });
});

describe('composeAssetIds and hasDuplicate', () => {
  test('puts each slot photo in its place among the fixed ones', () => {
    const inputs = [{ fixed: 'f1' }, { slot: { label: 'a', hint: '' } }, { slot: { label: 'b', hint: '' } }, { fixed: 'f2' }];
    expect(composeAssetIds(inputs, ['s1', 's2'])).toEqual(['f1', 's1', 's2', 'f2']);
  });

  test('finds a photo that is in two places', () => {
    expect(hasDuplicate(['a', 'b', 'a'])).toBe(true);
    expect(hasDuplicate(['a', 'b'])).toBe(false);
  });
});

describe('toAppConfig', () => {
  const row = { id: 'app-1', feature: 'video', name: 'Xoay', description: 'Mô tả', category: 'video', aspect: '9:16', durationS: 5, params: { audio: 'on' }, inputs: [{ fixed: 'f1' }, { slot: { label: 'Ảnh sản phẩm', hint: 'Ảnh trên nền trắng' } }, { slot: { label: 'Ảnh 3', hint: '' } }], publishedAt: new Date('2026-11-27T20:30:00Z'), outputAssetId: 'out-1', posterAssetId: 'poster-1' };

  test('makes a card of a video: a slot for each upload, the ICT day it was published, the video and its poster', () => {
    const app = toAppConfig(row, ['m-cheap', 'm-dear']);
    expect(app).toMatchObject({
      slug: 'app-1', feature: 'video', name: 'Xoay', category: 'video', added: '2026-11-28',
      slots: [{ label: 'Ảnh sản phẩm', inputLabel: 'Ảnh sản phẩm', empty: 'Ảnh trên nền trắng' }, { label: 'Ảnh 3', inputLabel: 'Ảnh 3', empty: 'Thêm 1 ảnh' }],
      custom: { modelIds: ['m-cheap', 'm-dear'], ratio: '9:16', durationSec: 5, inputCount: 3, audio: 'on', art: { video: '/api/assets/out-1/content', poster: '/api/assets/poster-1/thumb' } },
    });
  });

  test('makes a card of an image: its still, and the resolution and thinking it runs with', () => {
    const app = toAppConfig({ ...row, feature: 'image', durationS: 0, params: { resolution: '2K', thinking: 'high' }, posterAssetId: null }, ['m']);
    expect(app.custom).toMatchObject({ resolution: '2K', thinking: 'high', art: { video: null, poster: '/api/assets/out-1/thumb' } });
  });

  test('carries no prompt', () => {
    expect(Object.keys(toAppConfig(row, ['m']))).not.toContain('prompt');
    expect(JSON.stringify(toAppConfig({ ...row, prompt: 'SECRET' } as typeof row, ['m']))).not.toContain('SECRET');
  });
});
