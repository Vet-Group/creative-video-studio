import { expect, test } from 'vitest';
import { emptyNoun } from './Library';

test('the empty Library names photos under a photo filter, clips under a video one, and results under a mixed one', () => {
  expect(['images', 'try_on', 'image'].map(emptyNoun)).toEqual(['ảnh', 'ảnh', 'ảnh']);
  expect(['videos', 'video', 'marketing', 'marketing_review'].map(emptyNoun)).toEqual(['clip', 'clip', 'clip', 'clip']);
  expect(['all', 'apps'].map(emptyNoun)).toEqual(['kết quả', 'kết quả']);
});
