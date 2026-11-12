import { expect, test } from 'vitest';
import { adjustNote } from './video-adjust';

test('the note names each setting the form changed and why, and is empty when it changed nothing', () => {
  expect(adjustNote({ durationSec: { from: 5, to: 8 } })).toBe('Đã đổi thời lượng sang 8s vì mô hình không hỗ trợ 5s.');
  expect(adjustNote({ ratio: { from: '1:1', to: '9:16' }, durationSec: { from: 5, to: 8 } })).toBe('Đã đổi tỉ lệ sang 9:16 vì mô hình không hỗ trợ 1:1. Đã đổi thời lượng sang 8s vì mô hình không hỗ trợ 5s.');
  expect(adjustNote({ model: { label: 'Kling 3', ratio: '1:1', durationSec: 10 } })).toBe('Đã chuyển sang Kling 3 vì mô hình trước không hỗ trợ 1:1, 10s.');
  expect(adjustNote({})).toBe('');
});
