import { expect, test } from 'vitest';
import { templateData } from './templates';

test("an empty id is an empty photo slot: kept in its place, any number of times, while a real id may still appear only once", () => {
  expect(templateData({ images: ['', 'a', '', 'b'] })).toEqual({ images: ['', 'a', '', 'b'] });
  expect(templateData({ images: ['', ''], prompt: 'p' })).toEqual({ images: ['', ''], prompt: 'p' });
  expect(templateData({ images: ['', 'a', 'a'] })).toBe('data.images must list up to 15 different asset ids');
  expect(templateData({ images: ['', 5] })).toBe('data.images must list up to 15 different asset ids');
  expect(templateData({ images: Array(16).fill('') })).toBe('data.images must list up to 15 different asset ids');
  // Unboxing's roles name each place, the empty one's too.
  expect(templateData({ images: ['', 'p', 'b'], format: 'unboxing', roles: 'model,product,packaging' })).toMatchObject({ roles: 'model,product,packaging' });
});

test("Try On's garment count goes up to 13 (Nano Banana 2.1's cap), with its person, garments and background places", () => {
  const places = ['p', ...Array.from({ length: 13 }, (_, i) => `g${i}`), 'bg'];
  expect(templateData({ images: places, garments: 13 })).toEqual({ images: places, garments: 13 });
  expect(templateData({ images: ['p', 'g'], garments: 14 })).toBe('data.garments must be 1 to 13');
  expect(templateData({ images: ['p', 'g'], garments: 0 })).toBe('data.garments must be 1 to 13');
});

test("the hook effects app's effect is kept only when it is one of the effects", () => {
  expect(templateData({ images: ['p'], effect: 'drop' })).toMatchObject({ effect: 'drop' });
  expect(templateData({ images: ['p'], effect: 'confetti' })).toBe('data.effect must be one of the hook effects');
});

test("the video edit's colour and backdrop are kept only when they are a recolor swatch and one of its backdrops", () => {
  expect(templateData({ images: ['v'], color: '#C8102E' })).toMatchObject({ color: '#C8102E' });
  expect(templateData({ images: ['v'], color: '#123456' })).toBe('data.color must be one of the recolor swatches');
  expect(templateData({ images: ['v'], background: 'lifestyle' })).toMatchObject({ background: 'lifestyle' });
  expect(templateData({ images: ['v'], background: 'keep' })).toBe('data.background must be one of the video edit backdrops');
});
