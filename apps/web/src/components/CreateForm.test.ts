// Why Run is disabled on Create Video: the first stop, in the order the form is filled.
import { expect, test } from 'vitest';
import { runReason } from './CreateForm';

const ok = {
  loading: false,
  modelsLoaded: true,
  chosen: { supported: true, maxImages: 4, endMaxSec: 10 },
  images: 1,
  wordsOnly: false,
  preset: false,
  tooMany: false,
  clipsOver: false,
  takes: null,
  endOver: false,
  promptOk: true,
  tooLong: null,
};

test('a form that can run has no reason', () => {
  expect(runReason(ok)).toBeNull();
  // A model with a text twin runs from the prompt alone.
  expect(runReason({ ...ok, images: 0, wordsOnly: true })).toBeNull();
});

test('each stop names what to do, the earliest in the form first', () => {
  expect(runReason({ ...ok, loading: true, chosen: undefined })).toBe('Đang tải cài đặt đã dùng...');
  expect(runReason({ ...ok, chosen: undefined, modelsLoaded: false })).toBe('Đang tải danh sách mô hình...');
  expect(runReason({ ...ok, chosen: undefined })).toBe('Chọn một mô hình.');
  expect(runReason({ ...ok, images: 0, promptOk: false })).toBe('Tải lên ít nhất 1 ảnh sản phẩm.');
  expect(runReason({ ...ok, images: 0, wordsOnly: true, preset: true })).toBe('Mẫu cần ít nhất 1 ảnh sản phẩm. Bỏ chọn mẫu để tạo video chỉ từ mô tả.');
  expect(runReason({ ...ok, chosen: { ...ok.chosen, supported: false }, tooMany: true })).toMatch(/^Mô hình này không tạo được clip/);
  expect(runReason({ ...ok, tooMany: true })).toBe('Mô hình này nhận tối đa 4 ảnh.');
  expect(runReason({ ...ok, clipsOver: true, takes: { max: 3, seconds: 15 } })).toBe('Mô hình này nhận tối đa 3 tệp âm thanh, tổng 15 giây.');
  expect(runReason({ ...ok, endOver: true })).toBe('Mô hình này chỉ nhận khung hình cuối cho clip tối đa 10 giây.');
  expect(runReason({ ...ok, promptOk: false })).toBe('Viết mô tả cho video, hoặc chọn một mẫu.');
  expect(runReason({ ...ok, promptOk: false, tooLong: 'Mô tả dài quá.' })).toBe('Mô tả dài quá.');
});
