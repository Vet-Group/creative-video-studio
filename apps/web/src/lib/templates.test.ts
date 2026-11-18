import { expect, test } from 'vitest';
import { templateData } from './templates';

test("an empty id is an empty photo slot: kept in its place, any number of times, while a real id may still appear only once", () => {
  expect(templateData({ images: ['', 'a', '', 'b'] })).toEqual({ images: ['', 'a', '', 'b'] });
  expect(templateData({ images: ['', ''], prompt: 'p' })).toEqual({ images: ['', ''], prompt: 'p' });
  expect(templateData({ images: ['', 'a', 'a'] })).toBe('data.images must list up to 7 different asset ids');
  expect(templateData({ images: ['', 5] })).toBe('data.images must list up to 7 different asset ids');
  expect(templateData({ images: Array(8).fill('') })).toBe('data.images must list up to 7 different asset ids');
  // Unboxing's roles name each place, the empty one's too.
  expect(templateData({ images: ['', 'p', 'b'], format: 'unboxing', roles: 'model,product,packaging' })).toMatchObject({ roles: 'model,product,packaging' });
});
