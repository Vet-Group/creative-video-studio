import { expect, test } from 'vitest';
import { isUploadSlot, slotOfLabel } from './upload-slots';

test('a form slot label maps to its upload slot, with or without the optional suffix', () => {
  expect(slotOfLabel('Trang phục')).toBe('garment');
  expect(slotOfLabel('Người mẫu')).toBe('model');
  expect(slotOfLabel('Bối cảnh (tuỳ chọn)')).toBe('background');
  expect(slotOfLabel('Khung hình cuối')).toBe('end-frame');
  expect(slotOfLabel('Ảnh minh hoạ (tuỳ chọn)')).toBe('illustration');
  expect(slotOfLabel('Mô hình')).toBeUndefined();
});

test('only the listed keys are slots', () => {
  expect(isUploadSlot('product')).toBe(true);
  expect(isUploadSlot('toString')).toBe(false);
  expect(isUploadSlot(null)).toBe(false);
});
