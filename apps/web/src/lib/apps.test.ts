import { FEATURE_PROMPTS } from '@cvs/core/models';
import { FEATURES } from '@cvs/db';
import { describe, expect, it } from 'vitest';
import { APPS, appBySlug, appInputs, appReason, type AppDraft, filterApps, motionReason } from './apps';

const img = (id: string) => ({ id });
const draft = (images: string[][], prompt = '', maxImages = 2): AppDraft => ({ images: images.map((l) => l.map(img)), prompt, models: [{ maxImages }], failed: false });
const reason = (slug: string, images: string[][], prompt?: string, maxImages?: number) => appReason(appBySlug(slug)!, draft(images, prompt, maxImages));

describe('the app list', () => {
  it('has nine apps with unique slugs, known features and (for the built image apps) a default prompt', () => {
    expect(APPS).toHaveLength(9);
    expect(new Set(APPS.map((a) => a.slug)).size).toBe(9);
    for (const a of APPS) {
      expect(FEATURES as readonly string[]).toContain(a.feature);
      if (!a.soon && a.feature !== 'motion_control') expect(FEATURE_PROMPTS).toHaveProperty(a.feature);
    }
  });

  it('marks only Media Optimizer as coming soon; Motion Control is built, with its own form', () => {
    expect(appBySlug('media-optimizer')).toMatchObject({ slots: [], soon: expect.any(String) });
    expect(APPS.filter((a) => a.soon).map((a) => a.slug)).toEqual(['media-optimizer']);
    expect(appBySlug('motion-control')!.about.steps).toHaveLength(3);
  });

  it('gives the swaps and Face Swap two required slots, and the others the slots of the reference', () => {
    for (const slug of ['character-swap', 'model-swap', 'face-swap']) expect(appBySlug(slug)!.slots.map((s) => !!s.optional)).toEqual([false, false]);
    expect(appBySlug('background-changer')!.slots.map((s) => !!s.optional)).toEqual([false, true]);
    for (const slug of ['reframe', 'image-upscale', 'background-remover']) expect(appBySlug(slug)!.slots).toHaveLength(1);
    expect(appBySlug('reframe')).toMatchObject({ ratio: true });
    expect(appBySlug('image-upscale')).toMatchObject({ resolution: true });
  });
});

describe('filterApps', () => {
  it('filters by category and by name or description, ignoring accents and case', () => {
    expect(filterApps('all', '')).toHaveLength(9);
    expect(filterApps('fashion', '').map((a) => a.slug)).toEqual(['character-swap', 'model-swap', 'face-swap']);
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
    expect(motionReason({ ...base, videoMs: null })).toBe('Tải lên video mẫu.');
    expect(motionReason({ ...base, videoMs: 1900 })).toBe('Video mẫu phải dài từ 3 đến 30 giây.'); // rounds up to 2 s
    expect(motionReason({ ...base, videoMs: 30_100 })).toBe('Video mẫu phải dài từ 3 đến 30 giây.'); // rounds up to 31 s
    expect(motionReason(base)).toBeNull();
    expect(motionReason({ ...base, videoMs: 30_000 })).toBeNull();
  });
});
